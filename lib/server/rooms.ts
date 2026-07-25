import { randomBytes, randomUUID } from "node:crypto";
import type {
  Artifact,
  Participant,
  Presence,
  PublicRoom,
  Room,
  RoomEvent,
  RoomMessage,
  RoomRun,
  RoomVisibility,
  Steer,
  VoteRecord,
} from "@/lib/domain";
import { ROOM_AGENT_SYSTEM } from "@/lib/prompts";
import type { Difficulty } from "@/pdd/model-router";
import type { Role } from "@/pdd/role-policy";

type Listener = (event: RoomEvent) => void;
type RoomSecret = { inviteCode: string; apiKey?: string; baseUrl?: string };
type Store = {
  rooms: Map<string, Room>;
  listeners: Map<string, Set<Listener>>;
  secrets: Map<string, RoomSecret>;
  sourceContexts: Map<string, string>;
};

const globalStore = globalThis as typeof globalThis & { __copromptStore?: Store };
const store: Store = globalStore.__copromptStore ?? {
  rooms: new Map<string, Room>(),
  listeners: new Map<string, Set<Listener>>(),
  secrets: new Map<string, RoomSecret>(),
  sourceContexts: new Map<string, string>(),
};
globalStore.__copromptStore = store;
store.sourceContexts ??= new Map<string, string>();

const now = () => new Date().toISOString();
const inviteCode = () => randomBytes(18).toString("base64url");

function cleanRoomId(value: string): string {
  const id = value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  if (!id) throw new Error("Room id is required.");
  return id;
}

function participant(input: { userId: string; name: string; role: Role }): Participant {
  return { ...input, status: "online", lastSeenAt: now() };
}

function seedDemoRoom(): void {
  if (store.rooms.has("demo")) return;
  const timestamp = now();
  store.rooms.set("demo", {
    id: "demo",
    title: "Demo",
    createdBy: "demo-owner",
    visibility: "public",
    systemPrompt: ROOM_AGENT_SYSTEM,
    preferredModel: "",
    isDemo: true,
    state: "IDLE",
    intent: "## Goal\n建立一個清楚、可共同審核的產品變更。\n\n## Acceptance criteria\n1. 產物可預覽\n2. 測試與驗收條件一致\n\n## Must not\n- 不得洩漏任何 API key\n",
    participants: [],
    messages: [{
      id: randomUUID(),
      authorName: "co-prompt",
      userId: "agent",
      role: "agent",
      kind: "system",
      content: "這是唯一含有示範資料的 Demo 房間。加入後可直接體驗共同意圖、Member Chat、Steering Queue 與核准流程。",
      createdAt: timestamp,
    }],
    runs: [],
    steers: [],
    artifacts: [],
    votes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  store.secrets.set("demo", { inviteCode: inviteCode() });
}

seedDemoRoom();

export function getRoom(roomId: string): Room | undefined {
  return store.rooms.get(cleanRoomId(roomId));
}

export function listPublicRooms(): PublicRoom[] {
  return [...store.rooms.values()]
    .filter((room) => room.visibility === "public")
    .map((room) => ({
      id: room.id,
      title: room.title,
      participantCount: room.participants.filter((person) => person.status !== "offline").length,
      isDemo: Boolean(room.isDemo),
    }))
    .sort((a, b) => Number(b.isDemo) - Number(a.isDemo) || a.title.localeCompare(b.title));
}

export function createRoom(input: {
  title?: string;
  visibility: RoomVisibility;
  systemPrompt?: string;
  preferredModel?: string;
  apiKey?: string;
  baseUrl?: string;
  sourceArchive?: {
    name: string;
    fileCount: number;
    truncated: boolean;
    context: string;
  };
  participant: { userId: string; name: string; role: Role };
}): { room: Room; inviteCode: string } {
  let roomId = randomUUID().slice(0, 8);
  while (store.rooms.has(roomId)) roomId = randomUUID().slice(0, 8);
  const timestamp = now();
  const room: Room = {
    id: roomId,
    title: input.title?.trim().slice(0, 100) || "Untitled room",
    createdBy: input.participant.userId,
    visibility: input.visibility,
    systemPrompt: input.systemPrompt?.trim().slice(0, 20_000) || ROOM_AGENT_SYSTEM,
    preferredModel: input.preferredModel?.trim().slice(0, 200) || "",
    sourceArchive: input.sourceArchive ? {
      name: input.sourceArchive.name,
      fileCount: input.sourceArchive.fileCount,
      truncated: input.sourceArchive.truncated,
    } : undefined,
    state: "IDLE",
    intent: "## Goal\n\n## Acceptance criteria\n\n## Must not\n",
    participants: [participant(input.participant)],
    messages: [{
      id: randomUUID(),
      authorName: "co-prompt",
      userId: "agent",
      role: "agent",
      kind: "system",
      content: input.sourceArchive
        ? `房間已準備好，已載入 ${input.sourceArchive.name} 的 ${input.sourceArchive.fileCount} 個文字檔${input.sourceArchive.truncated ? "（已依安全限制截斷）" : ""}。共同編寫意圖，然後啟動 agent。`
        : "房間已準備好。共同編寫意圖，然後啟動 agent。",
      createdAt: timestamp,
    }],
    runs: [],
    steers: [],
    artifacts: [],
    votes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const secret: RoomSecret = {
    inviteCode: inviteCode(),
    apiKey: input.apiKey?.trim() || undefined,
    baseUrl: input.baseUrl?.trim() || undefined,
  };
  store.rooms.set(roomId, room);
  store.secrets.set(roomId, secret);
  if (input.sourceArchive) store.sourceContexts.set(roomId, input.sourceArchive.context);
  return { room, inviteCode: secret.inviteCode };
}

export function joinRoom(input: {
  roomId: string;
  inviteCode?: string;
  participant: { userId: string; name: string; role: Role };
}): Room {
  const room = getRoom(input.roomId);
  if (!room) throw new Error("Room not found.");
  const secret = store.secrets.get(room.id);
  if (room.visibility === "private" && input.inviteCode !== secret?.inviteCode) {
    throw new Error("這個私人房間需要有效邀請連結。");
  }
  const joined = participant(input.participant);
  room.participants = [...room.participants.filter((item) => item.userId !== joined.userId), joined];
  room.updatedAt = joined.lastSeenAt;
  publish(room.id, { type: "presence", participants: room.participants });
  publishSnapshot(room);
  return room;
}

export function updateRoomSettings(
  roomId: string,
  userId: string,
  patch: {
    title?: string;
    visibility?: RoomVisibility;
    systemPrompt?: string;
    preferredModel?: string;
    apiKey?: string;
    baseUrl?: string;
  },
): { room: Room; inviteCode: string } {
  const room = requiredRoom(roomId);
  if (room.createdBy !== userId) throw new Error("只有建立者可以修改房間設定。");
  if (room.isDemo) throw new Error("Demo 房間設定不可修改。");
  if (patch.title !== undefined) room.title = patch.title.trim().slice(0, 100) || room.title;
  if (patch.visibility !== undefined) room.visibility = patch.visibility;
  if (patch.systemPrompt !== undefined) room.systemPrompt = patch.systemPrompt.trim().slice(0, 20_000) || ROOM_AGENT_SYSTEM;
  if (patch.preferredModel !== undefined) room.preferredModel = patch.preferredModel.trim().slice(0, 200);
  const secret = store.secrets.get(room.id) ?? { inviteCode: inviteCode() };
  if (patch.apiKey !== undefined) secret.apiKey = patch.apiKey.trim() || undefined;
  if (patch.baseUrl !== undefined) secret.baseUrl = patch.baseUrl.trim() || undefined;
  store.secrets.set(room.id, secret);
  room.updatedAt = now();
  publishSnapshot(room);
  return { room, inviteCode: secret.inviteCode };
}

export function getRoomProvider(roomId: string): { apiKey?: string; baseUrl?: string } {
  const secret = store.secrets.get(cleanRoomId(roomId));
  return { apiKey: secret?.apiKey, baseUrl: secret?.baseUrl };
}

export function getRoomSourceContext(roomId: string): string {
  return store.sourceContexts.get(cleanRoomId(roomId)) ?? "";
}

export function updateIntent(roomId: string, intent: string): Room {
  const room = requiredRoom(roomId);
  if (room.state === "RUNNING") throw new Error("執行中不能直接改意圖；請改用 NUDGE。");
  room.intent = intent.slice(0, 50_000);
  room.updatedAt = now();
  publishSnapshot(room);
  return room;
}

export function setPresence(roomId: string, userId: string, status: Presence): void {
  const room = requiredRoom(roomId);
  const person = room.participants.find((item) => item.userId === userId);
  if (!person) return;
  person.status = status;
  person.lastSeenAt = now();
  publish(room.id, { type: "presence", participants: room.participants });
  publishSnapshot(room);
}

export function removeParticipant(roomId: string, userId: string): void {
  const room = requiredRoom(roomId);
  room.participants = room.participants.filter((item) => item.userId !== userId);
  room.updatedAt = now();
  publish(room.id, { type: "presence", participants: room.participants });
  publishSnapshot(room);
}

export function addMessage(roomId: string, message: Omit<RoomMessage, "id" | "createdAt">): RoomMessage {
  const room = requiredRoom(roomId);
  const created = { ...message, id: randomUUID(), createdAt: now() };
  room.messages.push(created);
  room.updatedAt = created.createdAt;
  publishSnapshot(room);
  return created;
}

/** Mark every human message as taken in, and report who was covered. */
export function markMessagesSeen(roomId: string): void {
  const room = requiredRoom(roomId);
  for (const message of room.messages) {
    if (message.kind === "prompt" || message.kind === "steer" || message.kind === "answer") {
      message.seenByAgent = true;
    }
  }
  room.updatedAt = new Date().toISOString();
}

export function startRun(roomId: string, startedBy: string, difficulty: Difficulty): RoomRun {
  const room = requiredRoom(roomId);
  if (room.state === "RUNNING" || room.state === "AWAITING_INPUT") {
    throw new Error("另一位隊友已經啟動 agent。");
  }
  const run: RoomRun = {
    id: randomUUID(), status: "running", startedBy, difficulty, output: "", step: 0, createdAt: now(),
  };
  room.runs.push(run);
  room.state = "RUNNING";
  room.updatedAt = now();
  publishSnapshot(room);
  return run;
}

export function updateRun(roomId: string, runId: string, patch: Partial<RoomRun>): RoomRun {
  const room = requiredRoom(roomId);
  const run = room.runs.find((item) => item.id === runId);
  if (!run) throw new Error("Run not found.");
  Object.assign(run, patch);
  room.updatedAt = now();
  return run;
}

export function finishRun(roomId: string, runId: string, status: RoomRun["status"]): void {
  const room = requiredRoom(roomId);
  updateRun(roomId, runId, { status });
  room.state = status === "proposed" ? "PROPOSED" : "IDLE";
  publishSnapshot(room);
  publish(roomId, { type: "done", runId, status });
}

export function queueSteer(roomId: string, input: Omit<Steer, "id" | "createdAt" | "consumed">): Steer {
  const room = requiredRoom(roomId);
  const steer: Steer = { ...input, id: randomUUID(), consumed: false, createdAt: now() };
  room.steers.push(steer);
  addMessage(roomId, {
    authorName: steer.authorName, userId: steer.userId, role: steer.role,
    kind: "steer", content: `${steer.kind.toUpperCase()}: ${steer.content}`, runId: steer.runId,
  });
  return steer;
}

export function consumeSteers(roomId: string, runId: string): Steer[] {
  const room = requiredRoom(roomId);
  const pending = room.steers.filter((item) => item.runId === runId && !item.consumed);
  for (const steer of pending) steer.consumed = true;
  if (pending.length) publish(roomId, { type: "steer_applied", runId, steers: pending });
  return pending;
}

export function addArtifact(
  roomId: string,
  artifact: Omit<Artifact, "id" | "version" | "createdAt">,
): Artifact {
  const room = requiredRoom(roomId);
  const created: Artifact = {
    ...artifact,
    id: randomUUID(),
    version: Math.max(0, ...room.artifacts.filter((item) => item.kind === artifact.kind).map((item) => item.version)) + 1,
    createdAt: now(),
  };
  room.artifacts.push(created);
  publish(roomId, { type: "artifact", artifact: created });
  publishSnapshot(room);
  return created;
}

export function recordVote(roomId: string, vote: Omit<VoteRecord, "createdAt">): void {
  const room = requiredRoom(roomId);
  room.votes = [...room.votes.filter((item) => !(item.runId === vote.runId && item.userId === vote.userId)), {
    ...vote, createdAt: now(),
  }];
  publishSnapshot(room);
}

export function subscribe(roomId: string, listener: Listener): () => void {
  const id = cleanRoomId(roomId);
  const listeners = store.listeners.get(id) ?? new Set();
  listeners.add(listener);
  store.listeners.set(id, listeners);
  const room = store.rooms.get(id);
  if (room) listener({ type: "snapshot", room });
  return () => listeners.delete(listener);
}

export function publish(roomId: string, event: RoomEvent): void {
  for (const listener of store.listeners.get(cleanRoomId(roomId)) ?? []) listener(event);
}

export function publishSnapshot(room: Room): void {
  publish(room.id, { type: "snapshot", room });
}

function requiredRoom(roomId: string): Room {
  const room = getRoom(roomId);
  if (!room) throw new Error("Room not found.");
  return room;
}
