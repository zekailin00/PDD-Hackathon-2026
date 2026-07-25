import { z } from "zod";
import { issueIdentity } from "@/lib/server/auth";
import { createOrJoinRoom } from "@/lib/server/rooms";

export const runtime = "nodejs";

const schema = z.object({
  roomId: z.string().max(48).optional(),
  title: z.string().max(100).optional(),
  userId: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  role: z.enum(["pm", "eng", "design", "qa", "observer"]),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "房間資料格式錯誤。" }, { status: 400 });
  const room = createOrJoinRoom({ roomId: parsed.data.roomId, title: parsed.data.title, participant: parsed.data });
  const token = issueIdentity({
    roomId: room.id,
    userId: parsed.data.userId,
    name: parsed.data.name,
    role: parsed.data.role,
  });
  return Response.json({ room, token });
}
