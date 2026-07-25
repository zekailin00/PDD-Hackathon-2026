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
  const kickoffMessageId = randomUUID();
  const runId = randomUUID();
  const demoOutput = [
    "Demo proposal ready for room review.",
    "",
    "1. Added a focused launch checklist.",
    "2. Included browser-ready HTML, acceptance criteria, and QA tests.",
    "3. Waiting for the room to approve or request changes.",
  ].join("\n");
  const demoHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CoPrompt Launch Checklist</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1020; color: #eef2ff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { width: min(560px, calc(100% - 32px)); padding: 32px; border: 1px solid #334155; border-radius: 24px; background: #111827; box-shadow: 0 24px 80px #02061780; }
    .eyebrow { color: #a5b4fc; font-size: 12px; font-weight: 800; letter-spacing: .16em; }
    h1 { margin: 10px 0 8px; font-size: clamp(28px, 7vw, 44px); }
    p { color: #aab4c8; line-height: 1.6; }
    ul { display: grid; gap: 12px; padding: 0; list-style: none; }
    li { padding: 14px 16px; border-radius: 14px; background: #1e293b; }
    li::before { content: "✓"; margin-right: 10px; color: #34d399; font-weight: 900; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">COPROMPT DEMO</div>
    <h1>Launch checklist</h1>
    <p>A room-approved artifact generated from one shared team intent.</p>
    <ul>
      <li>Product goal is clear</li>
      <li>Preview works in the browser</li>
      <li>Acceptance criteria match the tests</li>
    </ul>
  </main>
</body>
</html>`;
  store.rooms.set("demo", {
    id: "demo",
    title: "Demo",
    createdBy: "demo-owner",
    visibility: "public",
    systemPrompt: ROOM_AGENT_SYSTEM,
    preferredModel: "",
    isDemo: true,
    state: "PROPOSED",
    intent: "## Goal\nCreate a clear launch checklist the whole room can review.\n\n## Acceptance criteria\n1. The artifact renders directly in the browser preview.\n2. The page contains three launch checklist items.\n3. Tests match the acceptance criteria.\n\n## Must not\n- Do not call external APIs.\n- Do not expose API keys or other secrets.\n",
    participants: [],
    messages: [
      {
        id: randomUUID(),
        authorName: "CoPrompt",
        userId: "agent",
        role: "agent",
        kind: "system",
        content: "This is the only room with seeded demo data. Explore the shared intent, Member Chat, agent proposal, artifact preview, and approval flow.",
        createdAt: timestamp,
      },
      {
        id: kickoffMessageId,
        authorName: "Mia",
        userId: "demo-pm",
        role: "pm",
        kind: "member",
        content: "I added the launch checklist goal and acceptance criteria to the shared intent. Please confirm the scope.",
        createdAt: timestamp,
      },
      {
        id: randomUUID(),
        authorName: "Leo",
        userId: "demo-eng",
        role: "eng",
        kind: "member",
        content: "The scope is clear. Keep the HTML self-contained and avoid external APIs so it can run directly in the preview iframe.",
        replyTo: kickoffMessageId,
        createdAt: timestamp,
      },
      {
        id: randomUUID(),
        authorName: "Mia",
        userId: "demo-pm",
        role: "pm",
        kind: "prompt",
        content: "Build the launch checklist preview from the shared intent and include acceptance criteria and tests.",
        runId,
        seenByAgent: true,
        createdAt: timestamp,
      },
      {
        id: randomUUID(),
        authorName: "CoPrompt agent",
        userId: "agent",
        role: "agent",
        kind: "agent",
        content: demoOutput,
        runId,
        createdAt: timestamp,
      },
    ],
    runs: [{
      id: runId,
      status: "proposed",
      startedBy: "demo-pm",
      model: "Demo model",
      difficulty: "standard",
      output: demoOutput,
      tokenAllocation: { "demo-pm": 96, "demo-eng": 72 },
      step: 3,
      createdAt: timestamp,
    }],
    steers: [],
    artifacts: [
      {
        id: randomUUID(),
        version: 1,
        kind: "html",
        content: demoHtml,
        runId,
        createdAt: timestamp,
      },
      {
        id: randomUUID(),
        version: 1,
        kind: "tests",
        content: [
          "1. Open the Preview tab and confirm the page renders without network requests.",
          "2. Confirm exactly three checklist items are visible.",
          "3. Resize to 320px wide and confirm no horizontal scrolling.",
        ].join("\n"),
        runId,
        createdAt: timestamp,
      },
      {
        id: randomUUID(),
        version: 1,
        kind: "criteria",
        content: [
          "- Browser-ready single-file HTML is present.",
          "- Three launch checklist items are readable.",
          "- The preview is responsive and uses no external API.",
        ].join("\n"),
        runId,
        createdAt: timestamp,
      },
    ],
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
      authorName: "CoPrompt",
      userId: "agent",
      role: "agent",
      kind: "system",
      content: input.sourceArchive
        ? `The room is ready. Loaded ${input.sourceArchive.fileCount} text file(s) from ${input.sourceArchive.name}${input.sourceArchive.truncated ? " (truncated to the safety limit)" : ""}. Co-author the shared intent, then start the agent.`
        : "The room is ready. Co-author the shared intent, then start the agent.",
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
    throw new Error("This private room requires a valid invite link.");
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
  if (room.createdBy !== userId) throw new Error("Only the room creator can change room settings.");
  if (room.isDemo) throw new Error("Demo room settings cannot be changed.");
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
  if (room.state === "RUNNING") throw new Error("The shared intent cannot be edited during a run. Use NUDGE instead.");
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
    throw new Error("Another teammate has already started the agent.");
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
