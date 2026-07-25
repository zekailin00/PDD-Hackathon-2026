import { afterEach, describe, expect, it, vi } from "vitest";
import { addArtifact, addMessage, createRoom, startRun } from "@/lib/server/rooms";
import {
  approvedRoomMemory,
  sanitizeMemoryText,
  searchRoomMemories,
} from "@/lib/server/memory";

const creator = { userId: "memory-creator", name: "Creator", role: "pm" as const };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("room memory boundaries", () => {
  it("is disabled cleanly without a server key", async () => {
    vi.stubEnv("MEM0_API_KEY", "");
    await expect(searchRoomMemories("room-a", "query")).resolves.toEqual([]);
  });

  it("redacts credential-looking values before storage", () => {
    const sanitized = sanitizeMemoryText([
      "Use the approved provider.",
      "api_key=fake-secret-value",
      "token: fake-token-value",
      "credential prefix m0-examplecredential123456",
    ].join("\n"));
    expect(sanitized).toContain("Use the approved provider.");
    expect(sanitized).not.toContain("fake-secret-value");
    expect(sanitized).not.toContain("fake-token-value");
    expect(sanitized).not.toContain("m0-examplecredential123456");
  });

  it("stores only approved intent and criteria, never chat, ZIP source, or generated code", () => {
    const created = createRoom({
      title: "Memory boundary",
      visibility: "public",
      memoryEnabled: true,
      participant: creator,
      sourceArchive: {
        name: "private-source.zip",
        fileCount: 1,
        truncated: false,
        context: "RAW ZIP SECRET SOURCE",
      },
    });
    created.room.intent = "Build the approved launch checklist.";
    addMessage(created.room.id, {
      authorName: "Creator",
      userId: creator.userId,
      role: creator.role,
      kind: "member",
      content: "MEMBER CHAT MUST STAY PRIVATE",
    });
    const run = startRun(created.room.id, creator.userId, "standard");
    run.output = "<artifact kind=\"html\"><html>GENERATED CODE</html></artifact>";
    addArtifact(created.room.id, {
      runId: run.id,
      kind: "criteria",
      content: "The checklist has three items.",
    });

    const memory = approvedRoomMemory(created.room, run.id);
    expect(memory).toContain("Build the approved launch checklist.");
    expect(memory).toContain("The checklist has three items.");
    expect(memory).not.toContain("MEMBER CHAT MUST STAY PRIVATE");
    expect(memory).not.toContain("RAW ZIP SECRET SOURCE");
    expect(memory).not.toContain("GENERATED CODE");
  });
});
