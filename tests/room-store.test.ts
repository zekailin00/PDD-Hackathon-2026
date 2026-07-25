import { describe, expect, it } from "vitest";
import {
  addMessage,
  createRoom,
  getRoom,
  getRoomProvider,
  getRoomSourceContext,
  joinRoom,
  listPublicRooms,
  removeParticipant,
  setPresence,
} from "@/lib/server/rooms";
import { recentContext } from "@/lib/server/run-agent";

const creator = { userId: "creator", name: "Creator", role: "pm" as const };

describe("production room boundaries", () => {
  it("keeps private rooms and provider keys out of public snapshots", () => {
    const created = createRoom({
      title: "Private test",
      visibility: "private",
      apiKey: "secret-room-key",
      participant: creator,
    });

    expect(listPublicRooms().some((room) => room.id === created.room.id)).toBe(false);
    expect(JSON.stringify(created.room)).not.toContain("secret-room-key");
    expect(getRoomProvider(created.room.id).apiKey).toBe("secret-room-key");
    expect(() => joinRoom({
      roomId: created.room.id,
      inviteCode: "wrong",
      participant: { userId: "guest", name: "Guest", role: "qa" },
    })).toThrow(/邀請連結/);

    const joined = joinRoom({
      roomId: created.room.id,
      inviteCode: created.inviteCode,
      participant: { userId: "guest", name: "Guest", role: "qa" },
    });
    expect(joined.participants.some((person) => person.userId === "guest")).toBe(true);
  });

  it("never includes Member Chat in AI context", () => {
    const created = createRoom({
      title: "Chat boundary",
      visibility: "public",
      participant: creator,
    });
    addMessage(created.room.id, {
      authorName: "Creator",
      userId: creator.userId,
      role: creator.role,
      kind: "member",
      content: "private teammate planning",
    });
    addMessage(created.room.id, {
      authorName: "Creator",
      userId: creator.userId,
      role: creator.role,
      kind: "prompt",
      content: "agent-visible request",
    });

    const context = recentContext(getRoom(created.room.id)!);
    expect(context).toContain("agent-visible request");
    expect(context).not.toContain("private teammate planning");
  });

  it("tracks presence and removes a member on logout", () => {
    const created = createRoom({
      title: "Presence",
      visibility: "public",
      participant: creator,
    });
    setPresence(created.room.id, creator.userId, "away");
    expect(getRoom(created.room.id)?.participants[0].status).toBe("away");
    removeParticipant(created.room.id, creator.userId);
    expect(getRoom(created.room.id)?.participants).toHaveLength(0);
  });

  it("keeps seed content in the Demo room only", () => {
    const demo = getRoom("demo");
    const created = createRoom({
      title: "Blank room",
      visibility: "public",
      participant: creator,
    });
    expect(demo?.isDemo).toBe(true);
    expect(demo?.messages.some((message) => message.content.includes("唯一含有示範資料"))).toBe(true);
    expect(demo?.messages.some((message) => message.kind === "member")).toBe(true);
    expect(demo?.runs.some((run) => run.status === "proposed" && run.output)).toBe(true);
    expect(demo?.artifacts.map((artifact) => artifact.kind).sort()).toEqual(["criteria", "html", "tests"]);
    expect(demo?.state).toBe("PROPOSED");
    expect(created.room.isDemo).toBeUndefined();
    expect(created.room.messages.some((message) => message.content.includes("示範資料"))).toBe(false);
    expect(created.room.runs).toHaveLength(0);
    expect(created.room.artifacts).toHaveLength(0);
  });

  it("keeps imported ZIP content server-side while exposing safe metadata", () => {
    const created = createRoom({
      title: "Imported project",
      visibility: "public",
      participant: creator,
      sourceArchive: {
        name: "project.zip",
        fileCount: 2,
        truncated: false,
        context: "--- FILE: app.ts ---\nconsole.log('ready');",
      },
    });

    expect(created.room.sourceArchive).toEqual({
      name: "project.zip",
      fileCount: 2,
      truncated: false,
    });
    expect(JSON.stringify(created.room)).not.toContain("console.log");
    expect(getRoomSourceContext(created.room.id)).toContain("console.log");
  });
});
