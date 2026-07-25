import { listPublicRooms } from "@/lib/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configuredRepo = process.env.GITHUB_REPO || "";
  const [legacyOwner, legacyRepo] = configuredRepo.split("/", 2);
  const githubOwner = process.env.GITHUB_OWNER || legacyOwner;
  const githubRepo = legacyRepo || configuredRepo;
  return Response.json({
    ok: true,
    runtime: "node",
    rooms: listPublicRooms().length,
    tokenRouterConfigured: Boolean(process.env.TOKENROUTER_API_KEY),
    mem0Configured: Boolean(process.env.MEM0_API_KEY),
    githubConfigured: Boolean(
      process.env.GITHUB_TOKEN
      && githubOwner
      && githubRepo,
    ),
  });
}
