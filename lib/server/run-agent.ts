import type { Room } from "@/lib/domain";
import { ROLE_LENS, ROOM_AGENT_SYSTEM } from "@/lib/prompts";
import { can } from "@/pdd/role-policy";
import { splitTokens } from "@/pdd/token-split";
import {
  addArtifact, addMessage, consumeSteers, finishRun, getRoom, publish, startRun, updateRun,
  getRoomProvider,
} from "@/lib/server/rooms";
import { autoRoute, streamChat, type ChatMessage } from "@/lib/server/tokenrouter";
import type { Identity } from "@/lib/server/auth";
import type { Difficulty } from "@/pdd/model-router";

const PHASES = [
  "先讀共同意圖與最近對話，列出本輪最小計畫及驗收邊界。",
  "依計畫完成核心產物。套用最新 STEER，不得擴大範圍。",
  "檢查驗收條件並提出可審核版本。需要預覽時輸出完整 artifact 標籤。",
];

function roleContext(room: Room): string {
  return room.participants
    .map((person) => `${person.name} [${person.role.toUpperCase()}]: ${ROLE_LENS[person.role]}`)
    .join("\n");
}

export function recentContext(room: Room): string {
  return room.messages.filter((message) => message.kind !== "member").slice(-20)
    .map((message) => `[${message.authorName} · ${message.role.toUpperCase()}]\n${message.content.slice(0, 4000)}`)
    .join("\n\n")
    .slice(-12_000);
}

function saveArtifacts(roomId: string, runId: string, output: string): void {
  const pattern = /<artifact\s+kind="(html|tests|criteria)">([\s\S]*?)<\/artifact>/gi;
  for (const match of output.matchAll(pattern)) {
    addArtifact(roomId, { runId, kind: match[1].toLowerCase() as "html" | "tests" | "criteria", content: match[2].trim() });
  }
}

export async function executeRoomAgent(input: {
  roomId: string;
  identity: Identity;
  prompt: string;
  difficulty: Difficulty;
  prefer?: string;
}): Promise<string> {
  if (!can(input.identity.role, "run")) throw new Error("你的角色不能啟動 agent。");
  let room = getRoom(input.roomId);
  if (!room) throw new Error("Room not found.");

  const run = startRun(input.roomId, input.identity.userId, input.difficulty);
  addMessage(input.roomId, {
    authorName: input.identity.name,
    userId: input.identity.userId,
    role: input.identity.role,
    kind: "prompt",
    content: input.prompt,
    runId: run.id,
  });
  try {
    const provider = getRoomProvider(input.roomId);
    const choice = await autoRoute(input.difficulty, input.prefer || room.preferredModel, provider);
    updateRun(input.roomId, run.id, { model: choice.model });
    publish(input.roomId, { type: "step", runId: run.id, step: 0, label: `TokenRouter auto → ${choice.model}` });

    room = getRoom(input.roomId)!;
    const messages: ChatMessage[] = [{
      role: "system",
      content: `${room.systemPrompt || ROOM_AGENT_SYSTEM}\n\n角色分道：\n${roleContext(room)}\n\n共同意圖：\n${room.intent}\n\n最近 AI 對話（Member Chat 已排除）：\n${recentContext(room)}`,
    }, {
      role: "user",
      content: input.prompt,
    }];
    let complete = "";

    for (let index = 0; index < PHASES.length; index += 1) {
      const steers = consumeSteers(input.roomId, run.id);
      const halt = steers.find((steer) => steer.kind === "halt");
      if (halt) {
        finishRun(input.roomId, run.id, "halted");
        publish(input.roomId, { type: "halted", runId: run.id, by: halt.authorName });
        return complete;
      }
      const nudges = steers.filter((steer) => steer.kind === "nudge");
      const steerContext = nudges.length
        ? `\n${nudges.map((steer) => `[STEER from ${steer.authorName} (${steer.role})]: ${steer.content}`).join("\n")}`
        : "";
      const phase = `${PHASES[index]}${steerContext}`;
      messages.push({ role: "user", content: phase });
      updateRun(input.roomId, run.id, { step: index + 1 });
      publish(input.roomId, { type: "step", runId: run.id, step: index + 1, label: PHASES[index] });

      const phaseOutput = await streamChat({
        model: choice.model,
        messages,
        provider,
        onToken(token) {
          complete += token;
          updateRun(input.roomId, run.id, { output: complete });
          publish(input.roomId, { type: "token", runId: run.id, chunk: token });
        },
      });
      messages.push({ role: "assistant", content: phaseOutput });
    }

    saveArtifacts(input.roomId, run.id, complete);
    room = getRoom(input.roomId)!;
    const weights = room.participants.map((participant) => ({
      userId: participant.userId,
      weight: 1 + room!.messages.filter((message) => message.runId === run.id && message.userId === participant.userId).length,
    }));
    updateRun(input.roomId, run.id, {
      tokenAllocation: splitTokens(Math.max(1, Math.ceil(complete.length / 4)), weights),
    });
    addMessage(input.roomId, {
      authorName: "co-prompt agent", userId: "agent", role: "agent",
      kind: "agent", content: complete, runId: run.id,
    });
    finishRun(input.roomId, run.id, "proposed");
    return complete;
  } catch (error) {
    finishRun(input.roomId, run.id, "error");
    const message = error instanceof Error ? error.message : "Agent 執行失敗。";
    publish(input.roomId, { type: "error", runId: run.id, message });
    throw error;
  }
}
