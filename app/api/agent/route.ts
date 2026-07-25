import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { executeRoomAgent } from "@/lib/server/run-agent";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  roomId: z.string().min(1).max(48),
  prompt: z.string().min(1).max(20_000),
  difficulty: z.enum(["cheap", "standard", "hard"]).default("standard"),
  prefer: z.string().max(200).optional(),
  apiKey: z.string().min(1).max(500).optional(),
});

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Agent 請求格式錯誤。" }, { status: 400 });
  try {
    const identity = verifyIdentity(request, parsed.data.roomId);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await executeRoomAgent({ ...parsed.data, identity });
          controller.enqueue(encoder.encode("data: {\"ok\":true}\n\n"));
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "執行失敗。" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "未授權。" }, { status: 401 });
  }
}
