import type { AgentPhase, Room, RoomProgress } from "@/lib/domain";
import { ROLE_LENS, ROOM_AGENT_SYSTEM } from "@/lib/prompts";
import { can } from "@/pdd/role-policy";
import { splitTokens } from "@/pdd/token-split";
import {
  addArtifact, addMessage, consumeSteers, finishRun, getRoom, markMessagesSeen, publish,
  startRun, updateRun,
} from "@/lib/server/rooms";
import { autoRoute, streamChat, type ChatMessage } from "@/lib/server/tokenrouter";
import type { Identity } from "@/lib/server/auth";
import type { Difficulty } from "@/pdd/model-router";

const PHASES = [
  "先讀共同意圖與最近對話，列出本輪最小計畫及驗收邊界。",
  "依計畫完成核心產物。套用最新 STEER，不得擴大範圍。",
  "檢查驗收條件並提出可審核版本。需要預覽時輸出完整 artifact 標籤。",
];

const PHASE_NAMES: AgentPhase[] = ["planning", "building", "reviewing"];

/**
 * Tell the room where the run is, and — the part that matters in a shared
 * session — whose words it has actually consumed versus whose are still queued.
 */
export function reportProgress(input: {
  roomId: string; runId?: string; phase: AgentPhase; step: number; label: string;
}): void {
  const room = getRoom(input.roomId);
  if (!room) return;
  const activeRun = [...room.runs].reverse().find((run) => run.status === "running");
  const runId = input.runId || activeRun?.id;
  if (!runId) return;

  const human = room.messages.filter(
    (message) => message.kind === "prompt" || message.kind === "steer" || message.kind === "answer",
  );
  const distinct = (seen: boolean) => {
    const found = new Map<string, { userId: string; name: string; role: string }>();
    for (const message of human) {
      if (Boolean(message.seenByAgent) !== seen) continue;
      if (message.userId === "agent" || found.has(message.userId)) continue;
      found.set(message.userId, {
        userId: message.userId, name: message.authorName, role: message.role,
      });
    }
    return [...found.values()];
  };

  const progress: RoomProgress = {
    runId,
    phase: input.phase,
    step: input.step,
    totalSteps: PHASES.length,
    percent: input.phase === "done"
      ? 100
      : Math.min(100, Math.round((input.step / (PHASES.length + 1)) * 100)),
    label: input.label,
    pickedUp: distinct(true),
    waiting: distinct(false),
  };
  publish(input.roomId, { type: "progress", progress });
}

function roleContext(room: Room): string {
  return room.participants
    .map((person) => `${person.name} [${person.role.toUpperCase()}]: ${ROLE_LENS[person.role]}`)
    .join("\n");
}

function recentContext(room: Room): string {
  const byId = new Map(room.messages.map((message) => [message.id, message]));
  return room.messages.slice(-20)
    .map((message) => {
      const parent = message.replyTo ? byId.get(message.replyTo) : undefined;
      const thread = parent
        ? `，回覆 ${parent.authorName}「${parent.content.slice(0, 60)}」— 此則取代該說法`
        : "";
      return `[${message.authorName} · ${message.role.toUpperCase()}${thread}]\n${message.content.slice(0, 4000)}`;
    })
    .join("\n\n")
    .slice(-12_000);
}

function saveArtifacts(roomId: string, runId: string, output: string): void {
  const pattern = /<artifact\s+kind="(html|tests|criteria)">([\s\S]*?)<\/artifact>/gi;
  let hasHtml = false;
  for (const match of output.matchAll(pattern)) {
    const kind = match[1].toLowerCase() as "html" | "tests" | "criteria";
    const content = kind === "html"
      ? match[2].trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "")
      : match[2].trim();
    if (content) {
      if (kind === "html") hasHtml = true;
      addArtifact(roomId, { runId, kind, content });
    }
  }
  // Keep the preview useful if a model forgets the wrapper but still returns a
  // complete browser document. The system prompt asks for the wrapper; this is
  // a recovery path, not a second output format.
  if (!hasHtml) {
    const document = output.match(/(?:<!doctype html>|<html\b)[\s\S]*?<\/html>/i)?.[0];
    if (document) addArtifact(roomId, { runId, kind: "html", content: document });
  }
}

export async function executeRoomAgent(input: {
  roomId: string;
  identity: Identity;
  prompt: string;
  difficulty: Difficulty;
  prefer?: string;
  apiKey?: string;
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
    markMessagesSeen(input.roomId);
    reportProgress({
      roomId: input.roomId, runId: run.id, phase: "reading", step: 0,
      label: "讀取共同意圖與房間對話",
    });

    const choice = await autoRoute(input.difficulty, input.prefer, input.apiKey);
    updateRun(input.roomId, run.id, { model: choice.model });
    publish(input.roomId, { type: "step", runId: run.id, step: 0, label: `TokenRouter auto → ${choice.model}` });

    room = getRoom(input.roomId)!;
    const messages: ChatMessage[] = [{
      role: "system",
      content: `${ROOM_AGENT_SYSTEM}\n\n角色分道：\n${roleContext(room)}\n\n共同意圖：\n${room.intent}\n\n最近房間對話：\n${recentContext(room)}`,
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
      if (steers.length) markMessagesSeen(input.roomId);
      const nudges = steers.filter((steer) => steer.kind === "nudge");
      const steerContext = nudges.length
        ? `\n${nudges.map((steer) => `[STEER from ${steer.authorName} (${steer.role})]: ${steer.content}`).join("\n")}`
        : "";
      const phase = `${PHASES[index]}${steerContext}`;
      messages.push({ role: "user", content: phase });
      updateRun(input.roomId, run.id, { step: index + 1 });
      publish(input.roomId, { type: "step", runId: run.id, step: index + 1, label: PHASES[index] });
      reportProgress({
        roomId: input.roomId, runId: run.id, phase: PHASE_NAMES[index],
        step: index + 1,
        label: nudges.length
          ? `已收到 ${nudges.map((steer) => steer.authorName).join("、")} 的導引`
          : PHASES[index],
      });

      const phaseOutput = await streamChat({
        model: choice.model,
        messages,
        apiKey: input.apiKey,
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
    reportProgress({
      roomId: input.roomId, runId: run.id, phase: "done", step: PHASES.length,
      label: "完成，等待房間審核",
    });
    return complete;
  } catch (error) {
    finishRun(input.roomId, run.id, "error");
    const message = error instanceof Error ? error.message : "Agent 執行失敗。";
    publish(input.roomId, { type: "error", runId: run.id, message });
    throw error;
  }
}
