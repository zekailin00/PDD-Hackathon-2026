import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { getRoom, queueSteer } from "@/lib/server/rooms";
import { can } from "@/lib/roles";
import { reportProgress } from "@/lib/server/run-agent";

export const runtime = "nodejs";

const schema = z.object({
  runId: z.string().uuid(),
  kind: z.enum(["nudge", "halt"]),
  content: z.string().max(4000).default(""),
});

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "The steering request is invalid." }, { status: 400 });
    const power = parsed.data.kind === "halt" ? "halt" : "steer";
    const room = getRoom(roomId);
    if (!room || !["RUNNING", "AWAITING_INPUT"].includes(room.state)) {
      return Response.json({ error: "There is no active agent run." }, { status: 409 });
    }
    if (!can(identity.role, power, room.roleOverrides)) {
      return Response.json({ error: `Your role cannot ${power} this run.` }, { status: 403 });
    }
    const steer = queueSteer(roomId, {
      ...parsed.data,
      userId: identity.userId,
      authorName: identity.name,
      role: identity.role,
    });
    // Show the room immediately that this steer is queued but not yet read,
    // otherwise nobody sees the "waiting" state at all -- it would be consumed
    // silently at the next checkpoint.
    const run = [...room.runs].reverse().find((item) => item.status === "running");
    if (run) {
      reportProgress({
        roomId, runId: run.id, phase: "building", step: run.step,
        label: `${identity.name}'s ${parsed.data.kind === "halt" ? "halt" : "steering note"} is queued for the next checkpoint`,
      });
    }
    return Response.json({ steer }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The steering request failed." }, { status: 400 });
  }
}
