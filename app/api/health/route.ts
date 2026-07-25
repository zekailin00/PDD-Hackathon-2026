import { listPublicRooms } from "@/lib/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    runtime: "node",
    rooms: listPublicRooms().length,
    tokenRouterConfigured: Boolean(process.env.TOKENROUTER_API_KEY),
    githubConfigured: Boolean(
      process.env.GITHUB_TOKEN
      && process.env.GITHUB_OWNER
      && process.env.GITHUB_REPO,
    ),
  });
}
