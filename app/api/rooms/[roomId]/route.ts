import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import {
  getRoom,
  removeParticipant,
  setPresence,
  updateIntent,
  updateRoomSettings,
} from "@/lib/server/rooms";
import { can } from "@/pdd/role-policy";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("intent"), intent: z.string().max(50_000) }),
  z.object({
    operation: z.literal("settings"),
    title: z.string().max(100).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    systemPrompt: z.string().max(20_000).optional(),
    preferredModel: z.string().max(200).optional(),
    apiKey: z.string().max(500).optional(),
    baseUrl: z.string().url().max(500).optional().or(z.literal("")),
  }),
  z.object({ operation: z.literal("presence"), status: z.enum(["online", "away", "offline"]) }),
]);

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    verifyIdentity(request, roomId);
    const room = getRoom(roomId);
    return room ? Response.json({ room }) : Response.json({ error: "Room not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status: 401 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "The room update is invalid." }, { status: 400 });
    if (parsed.data.operation === "presence") {
      setPresence(roomId, identity.userId, parsed.data.status);
      return Response.json({ ok: true });
    }
    if (parsed.data.operation === "intent") {
      if (!can(identity.role, "edit_intent")) {
        return Response.json({ error: "Your role cannot edit the shared intent." }, { status: 403 });
      }
      return Response.json({ room: updateIntent(roomId, parsed.data.intent) });
    }
    const result = updateRoomSettings(roomId, identity.userId, parsed.data);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The update failed." }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    removeParticipant(roomId, identity.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Logout failed." }, { status: 400 });
  }
}
