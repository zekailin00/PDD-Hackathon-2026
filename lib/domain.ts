import type { Difficulty } from "@/pdd/model-router";
import type { Role, RoleOverrides } from "@/pdd/role-policy";

export type RoomState = "IDLE" | "RUNNING" | "AWAITING_INPUT" | "PROPOSED";
export type RunStatus = "running" | "proposed" | "done" | "halted" | "error";
export type Presence = "online" | "away" | "offline";
export type RoomVisibility = "public" | "private";

export type Participant = {
  userId: string;
  name: string;
  role: Role;
  status: Presence;
  lastSeenAt: string;
};

export type RoomMessage = {
  id: string;
  authorName: string;
  userId: string;
  role: Role | "agent";
  kind: "prompt" | "member" | "steer" | "agent" | "question" | "answer" | "review" | "system";
  content: string;
  runId?: string;
  replyTo?: string;
  /** Set once a run has actually fed this message to the model. */
  seenByAgent?: boolean;
  createdAt: string;
};

export type Steer = {
  id: string;
  runId: string;
  userId: string;
  authorName: string;
  role: Role;
  kind: "nudge" | "halt";
  content: string;
  consumed: boolean;
  createdAt: string;
};

export type Artifact = {
  id: string;
  version: number;
  kind: "html" | "tests" | "criteria";
  content: string;
  runId: string;
  createdAt: string;
};

export type RoomRun = {
  id: string;
  status: RunStatus;
  memoryStatus?: "pending" | "queued" | "error";
  startedBy: string;
  model?: string;
  difficulty: Difficulty;
  output: string;
  tokenAllocation?: Record<string, number>;
  step: number;
  createdAt: string;
};

export type VoteRecord = {
  runId: string;
  userId: string;
  verdict: "approve" | "request_changes";
  createdAt: string;
};

export type Room = {
  id: string;
  title: string;
  createdBy: string;
  visibility: RoomVisibility;
  systemPrompt: string;
  memoryEnabled: boolean;
  preferredModel?: string;
  roleOverrides: RoleOverrides;
  sourceArchive?: {
    name: string;
    fileCount: number;
    truncated: boolean;
  };
  isDemo?: boolean;
  state: RoomState;
  intent: string;
  participants: Participant[];
  messages: RoomMessage[];
  runs: RoomRun[];
  steers: Steer[];
  artifacts: Artifact[];
  votes: VoteRecord[];
  createdAt: string;
  updatedAt: string;
};

export type PublicRoom = {
  id: string;
  title: string;
  participantCount: number;
  isDemo: boolean;
};

export type AgentPhase = "reading" | "planning" | "building" | "reviewing" | "done";

/**
 * A shared session has a fairness problem a solo one does not: when four people
 * type at once, each needs to know whether the agent has taken THEIR words in
 * yet, or is still working from someone else's. Guessing from a token stream is
 * not good enough, so the room is told outright.
 */
export type RoomProgress = {
  runId: string;
  phase: AgentPhase;
  step: number;
  totalSteps: number;
  percent: number;
  label: string;
  pickedUp: { userId: string; name: string; role: string }[];
  waiting: { userId: string; name: string; role: string }[];
};

export type RoomEvent =
  | { type: "snapshot"; room: Room }
  | { type: "presence"; participants: Participant[] }
  | { type: "token"; runId: string; chunk: string }
  | { type: "step"; runId: string; step: number; label: string }
  | { type: "progress"; progress: RoomProgress }
  | { type: "steer_applied"; runId: string; steers: Steer[] }
  | { type: "halted"; runId: string; by: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "done"; runId: string; status: RunStatus }
  | { type: "error"; runId?: string; message: string };
