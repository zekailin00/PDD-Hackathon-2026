import { verifyIdentity } from "@/lib/server/auth";
import { getRoom } from "@/lib/server/rooms";
import { evaluateQuorum } from "@/pdd/approval-quorum";
import { can, voters } from "@/pdd/role-policy";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    const room = getRoom(roomId);
    if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
    if (!can(identity.role, "open_pr", room.roleOverrides)) {
      return Response.json({ error: "Your role cannot export a PDD Issue." }, { status: 403 });
    }
    const run = [...room.runs].reverse().find((item) => item.status === "proposed");
    if (!run) return Response.json({ error: "There is no proposal available to export." }, { status: 409 });
    const electorate = voters(room.participants, room.roleOverrides);
    const quorum = evaluateQuorum(electorate, room.votes.filter((vote) => vote.runId === run.id));
    if (!quorum.canOpenPr) return Response.json({ error: quorum.reason, quorum }, { status: 409 });

    const token = process.env.GITHUB_TOKEN;
    const configuredRepo = process.env.GITHUB_REPO || "";
    const [legacyOwner, legacyRepo] = configuredRepo.split("/", 2);
    const owner = process.env.GITHUB_OWNER || legacyOwner;
    const repo = legacyRepo || configuredRepo;
    if (!token || !owner || !repo) {
      return Response.json({ error: "The server has not configured GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO." }, { status: 503 });
    }
    const criteria = [...room.artifacts].reverse().find((item) => item.kind === "criteria")?.content;
    const body = `## Goal
${room.intent}

## Acceptance criteria
${criteria || "- Validate against the shared intent document."}

## Must not
- Do not bypass room approval.
- Do not expose provider secrets.

## Evidence
- Co-authored live by ${room.participants.map((person) => `${person.name} (${person.role})`).join(", ")}
- Room: ${room.id}
- Run: ${run.id}
- Model chosen automatically by TokenRouter policy: ${run.model || "unknown"}

## Validation
- Tests cover the positive case and important forbidden outcomes.
- The issue, generated artifact, tests, and docs agree.
- The linked PR must pass CI and PDD checkup.`;
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title: room.title, body, labels: ["pdd-issue"] }),
    });
    const result = await response.json() as { html_url?: string; message?: string };
    if (!response.ok) return Response.json({ error: result.message || "GitHub issue creation failed." }, { status: response.status });
    return Response.json({ url: result.html_url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed." }, { status: 400 });
  }
}
