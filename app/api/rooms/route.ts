import { z } from "zod";
import { issueIdentity } from "@/lib/server/auth";
import { readProjectArchive } from "@/lib/server/project-archive";
import { createRoom, joinRoom, listPublicRooms } from "@/lib/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const participant = z.object({
  userId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  role: z.enum(["pm", "eng", "design", "qa", "observer"]),
});

const schema = z.discriminatedUnion("action", [
  participant.extend({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(100),
    visibility: z.enum(["public", "private"]),
    systemPrompt: z.string().max(20_000).optional(),
    preferredModel: z.string().max(200).optional(),
    apiKey: z.string().max(500).optional(),
    baseUrl: z.string().url().max(500).optional().or(z.literal("")),
  }),
  participant.extend({
    action: z.literal("join"),
    roomId: z.string().min(1).max(48),
    inviteCode: z.string().max(200).optional(),
  }),
]);

export async function GET() {
  return Response.json({ rooms: listPublicRooms() });
}

async function readRequest(request: Request): Promise<{ payload: unknown; projectZip?: File }> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return { payload: await request.json() };
  }
  const form = await request.formData();
  const projectZip = form.get("projectZip");
  return {
    payload: Object.fromEntries(
      [...form.entries()].filter(([, value]) => typeof value === "string"),
    ),
    projectZip: projectZip instanceof File && projectZip.size ? projectZip : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const { payload, projectZip } = await readRequest(request);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return Response.json({ error: "房間資料格式錯誤。" }, { status: 400 });
    const member = {
      userId: parsed.data.userId,
      name: parsed.data.name,
      role: parsed.data.role,
    };
    const sourceArchive = parsed.data.action === "create" && projectZip
      ? await readProjectArchive(projectZip)
      : undefined;
    const result = parsed.data.action === "create"
      ? createRoom({
        title: parsed.data.title,
        visibility: parsed.data.visibility,
        systemPrompt: parsed.data.systemPrompt,
        preferredModel: parsed.data.preferredModel,
        apiKey: parsed.data.apiKey,
        baseUrl: parsed.data.baseUrl,
        sourceArchive,
        participant: member,
      })
      : {
        room: joinRoom({
          roomId: parsed.data.roomId,
          inviteCode: parsed.data.inviteCode,
          participant: member,
        }),
        inviteCode: parsed.data.inviteCode,
      };
    const token = issueIdentity({
      roomId: result.room.id,
      userId: member.userId,
      name: member.name,
      role: member.role,
    });
    return Response.json({ room: result.room, token, inviteCode: result.inviteCode });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "房間操作失敗。" },
      { status: 400 },
    );
  }
}
