import { describe, expect, it } from "vitest";
import {
  addMessage,
  createRoom,
  getRoom,
  getRoomProvider,
  getRoomSourceContext,
  joinRoom,
  listPublicRooms,
  closePresenceConnection,
  deleteRoom,
  openPresenceConnection,
  removeParticipant,
  setPresence,
  updateRoomSettings,
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
    })).toThrow(/valid invite link/);

    const joined = joinRoom({
      roomId: created.room.id,
      inviteCode: created.inviteCode,
      participant: { userId: "guest", name: "Guest", role: "qa" },
    });
    expect(joined.participants.some((person) => person.userId === "guest")).toBe(true);
  });

  it("keeps long-term memory opt-in and creator-controlled", () => {
    const created = createRoom({
      title: "Memory settings",
      visibility: "public",
      participant: creator,
    });
    expect(created.room.memoryEnabled).toBe(false);

    const updated = updateRoomSettings(created.room.id, creator.userId, {
      memoryEnabled: true,
    });
    expect(updated.room.memoryEnabled).toBe(true);
    expect(() => updateRoomSettings(created.room.id, "guest", {
      memoryEnabled: false,
    })).toThrow(/Only the room creator/);
  });

  it("stores creator-defined role powers and decision priorities", () => {
    const created = createRoom({
      title: "Role policy",
      visibility: "public",
      participant: creator,
    });
    const updated = updateRoomSettings(created.room.id, creator.userId, {
      roleOverrides: {
        qa: { priority: 95, halt: false, vote: true },
        observer: { run: true, priority: 25 },
      },
    });

    expect(updated.room.roleOverrides.qa).toMatchObject({
      priority: 95,
      halt: false,
      vote: true,
    });
    expect(updated.room.roleOverrides.observer).toMatchObject({
      run: true,
      priority: 25,
    });
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

  it("lets only a creator delete a non-demo room", () => {
    const created = createRoom({
      title: "Temporary room",
      visibility: "public",
      apiKey: "temporary-provider-key",
      participant: creator,
      sourceArchive: {
        name: "project.zip",
        fileCount: 1,
        truncated: false,
        context: "--- FILE: app.ts ---\nexport const ready = true;",
      },
    });
    expect(() => deleteRoom(created.room.id, "guest")).toThrow(/Only the room creator/);

    deleteRoom(created.room.id, creator.userId);

    expect(getRoom(created.room.id)).toBeUndefined();
    expect(getRoomProvider(created.room.id).apiKey).toBeUndefined();
    expect(getRoomSourceContext(created.room.id)).toBe("");
    expect(listPublicRooms().some((room) => room.id === created.room.id)).toBe(false);
  });

  it("does not delete the Demo room", () => {
    expect(() => deleteRoom("demo", "demo-owner")).toThrow(/Demo room/);
    expect(getRoom("demo")?.isDemo).toBe(true);
  });

  it("keeps same-name people as distinct room members", () => {
    const created = createRoom({
      title: "Same names",
      visibility: "public",
      participant: { userId: "anonymous-a", name: "Anonymous", role: "pm" },
    });
    joinRoom({
      roomId: created.room.id,
      participant: { userId: "anonymous-b", name: "Anonymous", role: "eng" },
    });
    expect(getRoom(created.room.id)?.participants.map((person) => person.userId).sort()).toEqual([
      "anonymous-a",
      "anonymous-b",
    ]);
  });

  it("does not mark a member offline while another SSE connection remains", () => {
    const created = createRoom({
      title: "Presence connections",
      visibility: "public",
      participant: creator,
    });
    openPresenceConnection(created.room.id, creator.userId);
    openPresenceConnection(created.room.id, creator.userId);
    closePresenceConnection(created.room.id, creator.userId);
    expect(getRoom(created.room.id)?.participants[0].status).toBe("online");
    closePresenceConnection(created.room.id, creator.userId);
    expect(getRoom(created.room.id)?.participants[0].status).toBe("offline");
  });

  it("keeps seed content in the Demo room only", () => {
    const demo = getRoom("demo");
    const created = createRoom({
      title: "Blank room",
      visibility: "public",
      participant: creator,
    });
    expect(demo?.isDemo).toBe(true);
    expect(demo?.messages.some((message) => message.content.includes("only room with seeded demo data"))).toBe(true);
    expect(demo?.messages.some((message) => message.kind === "member")).toBe(true);
    expect(demo?.runs.some((run) => run.status === "proposed" && run.output)).toBe(true);
    expect(demo?.artifacts.map((artifact) => artifact.kind).sort()).toEqual(["criteria", "html", "tests"]);
    expect(demo?.state).toBe("PROPOSED");
    expect(created.room.isDemo).toBeUndefined();
    expect(created.room.messages.some((message) => message.content.includes("seeded demo data"))).toBe(false);
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
