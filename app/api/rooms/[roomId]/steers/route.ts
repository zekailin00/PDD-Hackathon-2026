import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { getRoom, queueSteer } from "@/lib/server/rooms";
import { can } from "@/pdd/role-policy";
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
    if (!parsed.success) return Response.json({ error: "導引格式錯誤。" }, { status: 400 });
    const power = parsed.data.kind === "halt" ? "halt" : "steer";
    if (!can(identity.role, power)) return Response.json({ error: `你的角色不能執行 ${power}。` }, { status: 403 });
    const room = getRoom(roomId);
    if (!room || !["RUNNING", "AWAITING_INPUT"].includes(room.state)) {
      return Response.json({ error: "目前沒有執行中的 agent。" }, { status: 409 });
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
        label: `${identity.name} 的${parsed.data.kind === "halt" ? "中止" : "導引"}已排隊，等待下個檢查點`,
      });
    }
    return Response.json({ steer }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "導引失敗。" }, { status: 400 });
  }
}
