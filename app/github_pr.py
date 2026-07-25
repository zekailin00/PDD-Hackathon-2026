"""Turn an approved proposal into a real pull request.

This is the only code path in the project that writes anything anywhere, and
it runs exactly once per proposal, only after pdd.approval_quorum says the
room agreed. The agent never reaches it directly.
"""

import base64
import os

import httpx

API = "https://api.github.com"


class GitHubNotConfigured(RuntimeError):
    pass


def _config() -> tuple[str, str, str, str]:
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPO", "")       # "owner/name"
    base = os.environ.get("GITHUB_BASE_BRANCH", "main")
    if not token or "/" not in repo:
        raise GitHubNotConfigured(
            "Set GITHUB_TOKEN and GITHUB_REPO (owner/name) to open pull requests."
        )
    owner, name = repo.split("/", 1)
    return token, owner, name, base


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def open_pull_request(proposal, room, quorum: dict) -> str:
    """Create a branch, commit every proposed file, and open the PR.

    Returns the PR's html_url.
    """
    token, owner, name, base = _config()
    h = _headers(token)
    branch = f"coprompt/{proposal.id}"

    async with httpx.AsyncClient(timeout=60.0, headers=h) as c:
        ref = await c.get(f"{API}/repos/{owner}/{name}/git/ref/heads/{base}")
        ref.raise_for_status()
        base_sha = ref.json()["object"]["sha"]

        created = await c.post(
            f"{API}/repos/{owner}/{name}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": base_sha},
        )
        if created.status_code not in (201, 422):     # 422 == branch exists
            created.raise_for_status()

        for f in proposal.files:
            existing = await c.get(
                f"{API}/repos/{owner}/{name}/contents/{f['path']}",
                params={"ref": branch},
            )
            payload = {
                "message": f"{proposal.title}\n\nProposed in CoPrompt room {room.id}.",
                "content": base64.b64encode(
                    f["new_content"].encode("utf-8")
                ).decode("ascii"),
                "branch": branch,
            }
            if existing.status_code == 200:
                payload["sha"] = existing.json()["sha"]
            put = await c.put(
                f"{API}/repos/{owner}/{name}/contents/{f['path']}", json=payload
            )
            put.raise_for_status()

        pr = await c.post(
            f"{API}/repos/{owner}/{name}/pulls",
            json={
                "title": proposal.title,
                "head": branch,
                "base": base,
                "body": _pr_body(proposal, room, quorum),
            },
        )
        pr.raise_for_status()
        return pr.json()["html_url"]


def _pr_body(proposal, room, quorum: dict) -> str:
    members = {p.user_id: p for p in room.participants.values()}

    def names(ids):
        return ", ".join(
            f"{members[i].name} ({members[i].role.upper()})"
            for i in ids if i in members
        ) or "-"

    return f"""\
## What

{proposal.rationale or proposal.title}

## How this was produced

Co-authored live in an CoPrompt room by
{names(list(members))}.

The agent had **read-only** access to this repository. It could read, search,
and propose; it could not write a file, run a command, or touch git. This
branch exists because the room approved the proposal, not because the agent
decided to ship it.

## Approval

- Policy: `{room.policy}`
- Approved by: {names(quorum['approved_by'])}
- Verdict: {quorum['reason']}

Gate logic: `pdd/approval_quorum.py`, generated from
`prompts/approval_quorum_python.prompt`.

## Files

{chr(10).join(f'- `{f["path"]}`' for f in proposal.files)}

---
Opened from CoPrompt room `{room.id}` · proposal `{proposal.id}`
"""
