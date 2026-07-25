import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { addMessage, getRoom } from "@/lib/server/rooms";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    const parsed = z.object({
      content: z.string().trim().min(1).max(8_000),
      replyTo: z.string().uuid().optional(),
      kind: z.enum(["member", "answer"]).default("member"),
    }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "訊息格式錯誤。" }, { status: 400 });
    if (parsed.data.replyTo && !getRoom(roomId)?.messages.some((item) => item.id === parsed.data.replyTo)) {
      return Response.json({ error: "回覆的訊息不存在。" }, { status: 404 });
    }
    const message = addMessage(roomId, {
      authorName: identity.name, userId: identity.userId, role: identity.role, ...parsed.data,
    });
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "訊息送出失敗。" }, { status: 400 });
  }
}
