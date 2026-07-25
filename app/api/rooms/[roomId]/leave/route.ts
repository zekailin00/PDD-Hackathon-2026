import { verifyIdentity, verifyIdentityToken } from "@/lib/server/auth";
import { removeParticipant } from "@/lib/server/rooms";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const header = request.headers.get("authorization");
    const body = await request.json().catch(() => ({})) as { token?: string; presenceStamp?: string };
    const identity = header
      ? verifyIdentity(request, roomId)
      : verifyIdentityToken(body.token || "", roomId);
    removeParticipant(roomId, identity.userId, body.presenceStamp);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not leave room." }, { status: 400 });
  }
}
