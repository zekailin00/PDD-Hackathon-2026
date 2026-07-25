import { z } from "zod";
import { verifyIdentity } from "@/lib/server/auth";
import { getRoom, recordVote } from "@/lib/server/rooms";
import { evaluateQuorum } from "@/pdd/approval-quorum";
import { can, voters } from "@/pdd/role-policy";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    if (!can(identity.role, "vote")) return Response.json({ error: "你的角色不能投票。" }, { status: 403 });
    const parsed = z.object({
      runId: z.string().uuid(),
      verdict: z.enum(["approve", "request_changes"]),
    }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "投票格式錯誤。" }, { status: 400 });
    recordVote(roomId, { ...parsed.data, userId: identity.userId });
    const room = getRoom(roomId)!;
    const electorate = voters(room.participants);
    const result = evaluateQuorum(electorate, room.votes.filter((vote) => vote.runId === parsed.data.runId));
    return Response.json({ quorum: result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "投票失敗。" }, { status: 400 });
  }
}
