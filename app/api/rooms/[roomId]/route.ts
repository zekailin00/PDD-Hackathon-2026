import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { getRoom, updateIntent } from "@/lib/server/rooms";
import { can } from "@/pdd/role-policy";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const room = getRoom(roomId);
  return room ? Response.json({ room }) : Response.json({ error: "Room not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    if (!can(identity.role, "edit_intent")) return Response.json({ error: "你的角色不能編輯共同意圖。" }, { status: 403 });
    const parsed = z.object({ intent: z.string().max(50_000) }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "意圖文件格式錯誤。" }, { status: 400 });
    return Response.json({ room: updateIntent(roomId, parsed.data.intent) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "更新失敗。" }, { status: 400 });
  }
}
