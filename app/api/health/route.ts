import { listPublicRooms } from "@/lib/server/rooms";
import { isTokenRouterConfigured } from "@/lib/server/tokenrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    runtime: "node",
    rooms: listPublicRooms().length,
    tokenRouterConfigured: isTokenRouterConfigured(),
    mem0Configured: Boolean(process.env.MEM0_API_KEY),
  });
}
