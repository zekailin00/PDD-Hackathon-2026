import { subscribe } from "@/lib/server/rooms";
import { setPresence } from "@/lib/server/rooms";
import { verifyIdentity, type Identity } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  let identity: Identity;
  try {
    identity = verifyIdentity(request, roomId);
    setPresence(roomId, identity.userId, "online");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "未授權。" }, { status: 401 });
  }
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let closed = false;
  const markClosed = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    setPresence(roomId, identity.userId, "offline");
  };
  const stream = new ReadableStream({
    start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      unsubscribe = subscribe(roomId, send);
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 15_000);
      const close = () => {
        clearInterval(heartbeat);
        markClosed();
        try { controller.close(); } catch {}
      };
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() { markClosed(); },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
