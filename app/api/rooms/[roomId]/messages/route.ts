import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { addMessage, getRoom } from "@/lib/server/rooms";
import { reportProgress } from "@/lib/server/run-agent";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    const parsed = z.object({
      content: z.string().trim().min(1).max(8_000),
      replyTo: z.string().uuid().optional(),
      kind: z.enum(["prompt", "answer"]).default("prompt"),
    }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "訊息格式錯誤。" }, { status: 400 });
    if (parsed.data.replyTo && !getRoom(roomId)?.messages.some((item) => item.id === parsed.data.replyTo)) {
      return Response.json({ error: "回覆的訊息不存在。" }, { status: 404 });
    }
    const message = addMessage(roomId, {
      authorName: identity.name, userId: identity.userId, role: identity.role, ...parsed.data,
    });
    // While a run is in flight, a new message is not read yet. Say so, so the
    // author knows whether the agent is working from their words or someone
    // else's.
    const room = getRoom(roomId);
    const run = room && [...room.runs].reverse().find((item) => item.status === "running");
    if (run) {
      reportProgress({
        roomId, runId: run.id, phase: "building", step: run.step,
        label: `${identity.name} 的訊息已送出，等待 agent 於下個檢查點讀取`,
      });
    }
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "訊息送出失敗。" }, { status: 400 });
  }
}
