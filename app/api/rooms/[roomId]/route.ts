import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import {
  deleteRoom,
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
    memoryEnabled: z.boolean().optional(),
    preferredModel: z.string().max(200).optional(),
    apiKey: z.string().max(500).optional(),
    baseUrl: z.string().url().max(500).optional().or(z.literal("")),
    roleOverrides: z.record(
      z.enum(["pm", "eng", "design", "qa", "observer"]),
      z.object({
        run: z.boolean().optional(),
        steer: z.boolean().optional(),
        halt: z.boolean().optional(),
        edit_intent: z.boolean().optional(),
        vote: z.boolean().optional(),
        open_pr: z.boolean().optional(),
        priority: z.number().int().min(0).max(100).optional(),
      }),
    ).optional(),
  }),
  z.object({ operation: z.literal("presence"), status: z.enum(["online", "away", "offline"]) }),
]);

const deleteSchema = z.object({ operation: z.literal("delete_room").optional() }).optional();

async function readDeleteOperation(request: Request): Promise<z.infer<typeof deleteSchema>> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  const parsed = deleteSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("The room delete request is invalid.");
  return parsed.data;
}

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
      const room = getRoom(roomId);
      if (!room || !can(identity.role, "edit_intent", room.roleOverrides)) {
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
    const operation = await readDeleteOperation(request);
    if (operation?.operation === "delete_room") {
      deleteRoom(roomId, identity.userId);
      return Response.json({ ok: true, deleted: true });
    }
    removeParticipant(roomId, identity.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The room operation failed." }, { status: 400 });
  }
}
