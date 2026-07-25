import type { Difficulty } from "@/pdd/model-router";
import type { Role } from "@/pdd/role-policy";

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
  kind: "prompt" | "member" | "steer" | "agent" | "question" | "answer" | "system";
  content: string;
  runId?: string;
  replyTo?: string;
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
  preferredModel?: string;
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

export type RoomEvent =
  | { type: "snapshot"; room: Room }
  | { type: "presence"; participants: Participant[] }
  | { type: "token"; runId: string; chunk: string }
  | { type: "step"; runId: string; step: number; label: string }
  | { type: "steer_applied"; runId: string; steers: Steer[] }
  | { type: "halted"; runId: string; by: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "done"; runId: string; status: RunStatus }
  | { type: "error"; runId?: string; message: string };
