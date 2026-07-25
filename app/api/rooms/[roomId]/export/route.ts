import { verifyIdentity } from "@/lib/server/auth";
import { getRoom } from "@/lib/server/rooms";
import { evaluateQuorum } from "@/pdd/approval-quorum";
import { can, voters } from "@/pdd/role-policy";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  try {
    const identity = verifyIdentity(request, roomId);
    if (!can(identity.role, "open_pr")) return Response.json({ error: "你的角色不能匯出 PDD Issue。" }, { status: 403 });
    const room = getRoom(roomId);
    if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
    const run = [...room.runs].reverse().find((item) => item.status === "proposed");
    if (!run) return Response.json({ error: "目前沒有可匯出的提案。" }, { status: 409 });
    const electorate = voters(room.participants);
    const quorum = evaluateQuorum(electorate, room.votes.filter((vote) => vote.runId === run.id));
    if (!quorum.canOpenPr) return Response.json({ error: quorum.reason, quorum }, { status: 409 });

    const token = process.env.GITHUB_TOKEN;
    const configuredRepo = process.env.GITHUB_REPO || "";
    const [legacyOwner, legacyRepo] = configuredRepo.split("/", 2);
    const owner = process.env.GITHUB_OWNER || legacyOwner;
    const repo = legacyRepo || configuredRepo;
    if (!token || !owner || !repo) {
      return Response.json({ error: "伺服器尚未設定 GITHUB_TOKEN、GITHUB_OWNER、GITHUB_REPO。" }, { status: 503 });
    }
    const criteria = [...room.artifacts].reverse().find((item) => item.kind === "criteria")?.content;
    const body = `## Goal
${room.intent}

## Acceptance criteria
${criteria || "- 依共同意圖文件驗收。"}

## Must not
- 不得繞過房間核准。
- 不得洩漏 provider secrets。

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
    return Response.json({ error: error instanceof Error ? error.message : "匯出失敗。" }, { status: 400 });
  }
}
