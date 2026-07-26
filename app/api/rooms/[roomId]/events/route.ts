import {
  closePresenceConnection,
  openPresenceConnection,
  subscribe,
} from "@/lib/server/rooms";
import { verifyIdentity, type Identity } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  let identity: Identity;
  try {
    identity = verifyIdentity(request, roomId);
    openPresenceConnection(roomId, identity.userId);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 });
  }
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let closed = false;
  const markClosed = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    closePresenceConnection(roomId, identity.userId);
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
