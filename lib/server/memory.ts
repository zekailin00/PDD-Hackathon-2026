import MemoryClient from "mem0ai";
import type { Room } from "@/lib/domain";

const MAX_QUERY_LENGTH = 12_000;
const MAX_MEMORY_LENGTH = 2_000;
const MAX_APPROVED_MEMORY_LENGTH = 8_000;

let memoryClient: MemoryClient | null = null;

function roomAgentId(roomId: string): string {
  return `coprompt-room:${roomId}`;
}

function getMemoryClient(): MemoryClient | null {
  const apiKey = process.env.MEM0_API_KEY?.trim();
  if (!apiKey) return null;
  memoryClient ??= new MemoryClient({ apiKey });
  return memoryClient;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function isMemoryConfigured(): boolean {
  return Boolean(process.env.MEM0_API_KEY?.trim());
}

export function sanitizeMemoryText(value: string): string {
  return value
    .replace(/\b(?:sk|m0)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(
      /\b(api[ _-]?key|(?:access[ _-]?)?token|auth(?:orization)?|bearer|cookie|password|secret)\b(\s*[:=]\s*)([^\s,;]+)/gi,
      "$1$2[REDACTED]",
    )
    .trim()
    .slice(0, MAX_APPROVED_MEMORY_LENGTH);
}

export function approvedRoomMemory(room: Room, runId: string): string {
  const criteria = room.artifacts
    .filter((artifact) => artifact.runId === runId && artifact.kind === "criteria")
    .at(-1)?.content ?? "";
  const sections = [
    `Approved CoPrompt room decision for "${sanitizeMemoryText(room.title)}".`,
    room.intent.trim() ? `Shared intent:\n${sanitizeMemoryText(room.intent)}` : "",
    criteria.trim() ? `Acceptance criteria:\n${sanitizeMemoryText(criteria)}` : "",
  ].filter(Boolean);
  return sections.join("\n\n").slice(0, MAX_APPROVED_MEMORY_LENGTH);
}

export async function searchRoomMemories(roomId: string, query: string): Promise<string[]> {
  const client = getMemoryClient();
  if (!client) return [];
  try {
    const response = await client.search(query.slice(0, MAX_QUERY_LENGTH), {
      filters: { agentId: roomAgentId(roomId) },
      topK: 5,
      threshold: 0.25,
    });
    return (response.results ?? [])
      .map((item) => item.memory?.trim())
      .filter((memory): memory is string => Boolean(memory))
      .slice(0, 5)
      .map((memory) => memory.slice(0, MAX_MEMORY_LENGTH));
  } catch (error) {
    console.error(`Mem0 room search failed (${errorName(error)}).`);
    return [];
  }
}

export async function rememberApprovedDecision(input: {
  room: Room;
  runId: string;
}): Promise<void> {
  const client = getMemoryClient();
  if (!client) throw new Error("Mem0 is not configured.");
  await client.add([{
    role: "user",
    content: approvedRoomMemory(input.room, input.runId),
  }], {
    agentId: roomAgentId(input.room.id),
    runId: input.runId,
    metadata: {
      source: "coprompt",
      kind: "approved-room-decision",
      roomId: input.room.id,
    },
  });
}
