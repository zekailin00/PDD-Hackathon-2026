import { describe, expect, it } from "vitest";
import type { RoomEvent, RoomProgress } from "@/lib/domain";
import { addMessage, createRoom, joinRoom, markMessagesSeen, startRun, subscribe } from "@/lib/server/rooms";
import { reportProgress } from "@/lib/server/run-agent";

/**
 * A shared session has a fairness problem a solo one does not: when several
 * people type at once, each needs to know whether the agent has taken THEIR
 * words in, or is still working from someone else's. These tests pin that down.
 */

function room() {
  const created = createRoom({
    title: "progress",
    visibility: "public",
    participant: { userId: "u-amy", name: "Amy", role: "pm" },
  });
  joinRoom({
    roomId: created.room.id,
    participant: { userId: "u-joe", name: "Joe", role: "eng" },
  });
  return created.room.id;
}

function capture(roomId: string) {
  const seen: RoomProgress[] = [];
  const stop = subscribe(roomId, (event: RoomEvent) => {
    if (event.type === "progress") seen.push(event.progress);
  });
  return { seen, stop };
}

describe("room progress", () => {
  it("reports a message as waiting until the agent consumes it", () => {
    const roomId = room();
    const run = startRun(roomId, "u-amy", "cheap");
    addMessage(roomId, {
      authorName: "Amy", userId: "u-amy", role: "pm", kind: "prompt",
      content: "use cards", runId: run.id,
    });

    const { seen, stop } = capture(roomId);
    reportProgress({ roomId, runId: run.id, phase: "reading", step: 0, label: "start" });
    expect(seen.at(-1)?.waiting.map((person) => person.name)).toEqual(["Amy"]);
    expect(seen.at(-1)?.pickedUp).toEqual([]);

    markMessagesSeen(roomId);
    reportProgress({ roomId, runId: run.id, phase: "planning", step: 1, label: "read" });
    expect(seen.at(-1)?.pickedUp.map((person) => person.name)).toEqual(["Amy"]);
    expect(seen.at(-1)?.waiting).toEqual([]);
    stop();
  });

  it("separates a late arrival from the people already read", () => {
    const roomId = room();
    const run = startRun(roomId, "u-amy", "cheap");
    addMessage(roomId, {
      authorName: "Amy", userId: "u-amy", role: "pm", kind: "prompt",
      content: "first", runId: run.id,
    });
    markMessagesSeen(roomId);
    addMessage(roomId, {
      authorName: "Joe", userId: "u-joe", role: "eng", kind: "steer",
      content: "actually, a table", runId: run.id,
    });

    const { seen, stop } = capture(roomId);
    reportProgress({ roomId, runId: run.id, phase: "building", step: 2, label: "mid" });
    expect(seen.at(-1)?.pickedUp.map((person) => person.name)).toEqual(["Amy"]);
    expect(seen.at(-1)?.waiting.map((person) => person.name)).toEqual(["Joe"]);
    stop();
  });

  it("lists a person once however many times they spoke", () => {
    const roomId = room();
    const run = startRun(roomId, "u-amy", "cheap");
    for (const content of ["a", "b", "c"]) {
      addMessage(roomId, {
        authorName: "Joe", userId: "u-joe", role: "eng", kind: "prompt",
        content, runId: run.id,
      });
    }

    const { seen, stop } = capture(roomId);
    reportProgress({ roomId, runId: run.id, phase: "building", step: 2, label: "x" });
    expect(seen.at(-1)?.waiting).toHaveLength(1);
    stop();
  });

  it("never reports a percentage outside 0..100", () => {
    const roomId = room();
    const run = startRun(roomId, "u-amy", "cheap");
    const { seen, stop } = capture(roomId);
    for (const step of [0, 2, 99]) {
      reportProgress({ roomId, runId: run.id, phase: "building", step, label: "x" });
    }
    for (const progress of seen) {
      expect(progress.percent).toBeGreaterThanOrEqual(0);
      expect(progress.percent).toBeLessThanOrEqual(100);
    }
    stop();
  });

  it("reports a finished run as complete", () => {
    const roomId = room();
    const run = startRun(roomId, "u-amy", "cheap");
    const { seen, stop } = capture(roomId);
    reportProgress({ roomId, runId: run.id, phase: "done", step: 3, label: "done" });
    expect(seen.at(-1)?.percent).toBe(100);
    expect(seen.at(-1)?.phase).toBe("done");
    stop();
  });

  it("does not count the agent's own messages as someone waiting", () => {
    const roomId = room();
    const run = startRun(roomId, "u-amy", "cheap");
    addMessage(roomId, {
      authorName: "co-prompt agent", userId: "agent", role: "agent",
      kind: "agent", content: "thinking", runId: run.id,
    });

    const { seen, stop } = capture(roomId);
    reportProgress({ roomId, runId: run.id, phase: "building", step: 1, label: "x" });
    expect(seen.at(-1)?.waiting).toEqual([]);
    stop();
  });
});
