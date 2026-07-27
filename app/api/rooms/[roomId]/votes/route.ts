import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { addMessage, getRoom, publishSnapshot, recordVote, updateRun } from "@/lib/server/rooms";
import { rememberApprovedDecision } from "@/lib/server/memory";
import { evaluateQuorum } from "@/lib/approval";
import { can, voters } from "@/lib/roles";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    const room = getRoom(roomId);
    if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
    if (!can(identity.role, "vote", room.roleOverrides)) {
      return Response.json({ error: "Your role cannot vote." }, { status: 403 });
    }
    const parsed = z.object({
      runId: z.string().uuid(),
      verdict: z.enum(["approve", "request_changes"]),
      feedback: z.string().trim().max(4_000).optional(),
    }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "The vote is invalid." }, { status: 400 });
    if (parsed.data.verdict === "request_changes" && !parsed.data.feedback) {
      return Response.json({ error: "Please explain the requested changes." }, { status: 400 });
    }
    recordVote(roomId, { ...parsed.data, userId: identity.userId });
    addMessage(roomId, {
      authorName: identity.name,
      userId: identity.userId,
      role: identity.role,
      kind: "review",
      content: parsed.data.verdict === "approve"
        ? "Approved this proposal."
        : `Requested changes: ${parsed.data.feedback}`,
      runId: parsed.data.runId,
    });
    const electorate = voters(room.participants, room.roleOverrides);
    const result = evaluateQuorum(electorate, room.votes.filter((vote) => vote.runId === parsed.data.runId));
    const run = room.runs.find((item) => item.id === parsed.data.runId);
    if (
      result.approved
      && room.memoryEnabled
      && run
      && run.memoryStatus !== "pending"
      && run.memoryStatus !== "queued"
    ) {
      updateRun(roomId, run.id, { memoryStatus: "pending" });
      publishSnapshot(room);
      void rememberApprovedDecision({ room, runId: run.id })
        .then(() => {
          updateRun(roomId, run.id, { memoryStatus: "queued" });
          publishSnapshot(room);
        })
        .catch((error: unknown) => {
          updateRun(roomId, run.id, { memoryStatus: "error" });
          publishSnapshot(room);
          console.error(`Mem0 approved decision write failed (${error instanceof Error ? error.name : "UnknownError"}).`);
        });
    }
    return Response.json({ quorum: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The vote failed." }, { status: 400 });
  }
}
