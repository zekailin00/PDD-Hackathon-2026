import { randomUUID } from "node:crypto";
import type {
  Artifact, Participant, Room, RoomEvent, RoomMessage, RoomRun, Steer, VoteRecord,
} from "@/lib/domain";
import type { Difficulty } from "@/pdd/model-router";
import type { Role } from "@/pdd/role-policy";

type Listener = (event: RoomEvent) => void;
type Store = { rooms: Map<string, Room>; listeners: Map<string, Set<Listener>> };

const globalStore = globalThis as typeof globalThis & { __copromptStore?: Store };
const store: Store = globalStore.__copromptStore ?? {
  rooms: new Map<string, Room>(),
  listeners: new Map<string, Set<Listener>>(),
};
globalStore.__copromptStore = store;

const now = () => new Date().toISOString();

function cleanRoomId(value: string): string {
  const id = value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  if (!id) throw new Error("Room id is required.");
  return id;
}

export function getRoom(roomId: string): Room | undefined {
  return store.rooms.get(cleanRoomId(roomId));
}

export function createOrJoinRoom(input: {
  roomId?: string;
  title?: string;
  participant: { userId: string; name: string; role: Role };
}): Room {
  const roomId = cleanRoomId(input.roomId || randomUUID().slice(0, 8));
  let room = store.rooms.get(roomId);
  const timestamp = now();
  if (!room) {
    room = {
      id: roomId,
      title: input.title?.trim().slice(0, 100) || "Untitled room",
      state: "IDLE",
      intent: "## Goal\n\n## Acceptance criteria\n\n## Must not\n",
      participants: [],
      messages: [{
        id: randomUUID(), authorName: "co-prompt", userId: "agent", role: "agent",
        kind: "system", content: "房間已準備好。共同編寫意圖，然後啟動 agent。", createdAt: timestamp,
      }],
      runs: [], steers: [], artifacts: [], votes: [], createdAt: timestamp, updatedAt: timestamp,
    };
    store.rooms.set(roomId, room);
  }
  const participant: Participant = { ...input.participant, lastSeenAt: timestamp };
  room.participants = [...room.participants.filter((item) => item.userId !== participant.userId), participant];
  room.updatedAt = timestamp;
  publish(roomId, { type: "presence", participants: room.participants });
  return room;
}

export function updateIntent(roomId: string, intent: string): Room {
  const room = requiredRoom(roomId);
  if (room.state === "RUNNING") throw new Error("執行中不能直接改意圖；請改用 NUDGE。");
  room.intent = intent.slice(0, 50_000);
  room.updatedAt = now();
  publishSnapshot(room);
  return room;
}

export function addMessage(roomId: string, message: Omit<RoomMessage, "id" | "createdAt">): RoomMessage {
  const room = requiredRoom(roomId);
  const created = { ...message, id: randomUUID(), createdAt: now() };
  room.messages.push(created);
  room.updatedAt = created.createdAt;
  publishSnapshot(room);
  return created;
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
