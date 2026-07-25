# CoPrompt

**One AI session. The whole team. Nobody waits their turn.**

Built at the PDD Hackathon 2026 · Palo Alto · 25 July 2026

---

## The problem

Every AI coding tool today is single-player. One person drives; the rest of the
team watches over a shoulder or waits for a Slack paste.

The PDD field guide says so in its own words:

> *"Keep one person responsible for the issue and run controls while the rest
> of the team reviews behavior, tests the product, and prepares the
> demonstration."*

PDD made prompts the durable source of truth. But prompt capital is still
written by one person at a time.

**CoPrompt makes it multiplayer.**

## Target user

A working software team of 2–6 people — a PM, engineers, a designer, a QA —
who already use an AI agent individually and want to direct one together:
during a spec session, a bug triage, or a pairing block.

Not for solo developers. The whole design assumes disagreement in the room.

---

## What it does

**Everyone prompts the same session.** One shared room, one agent, one token
stream produced by the server and rebroadcast so every screen sees the same
thing at the same moment.

**Prompts never interrupt a run.** While the agent works, what you type queues
as a *steer* and is consumed between steps. A teammate who sees it going wrong
at second 20 doesn't wait three minutes to say so. A halt is checked mid-stream
every 40 deltas, so stopping feels immediate.

**Roles carry configurable power.** Each participant joins as PM / ENG / DESIGN /
QA / OBSERVER, and the room decides what each role may do — start a run, steer
one, halt it, edit the Intent, vote on a proposal, open the PR — plus a priority
that breaks ties between conflicting steers. Defaults are permissive for the four
working roles; `observer` exists so a guest can watch and suggest without a vote.
A role without a vote is never counted as "waiting on", so an observer can never
stall a proposal. Powers are enforced server-side, not by hiding buttons.

**Roles carry weight with the agent.** Each participant joins in a role, and
the agent is told who owns which decision. When two roles genuinely conflict it
calls `ask_room` rather than silently picking a side. This maps onto PDD's
three capitals: PM owns prompt capital, QA owns test capital, ENG owns
grounding capital.

**Everyone brings their own key, and the bill is split.** Keys live in server
memory for the session only. After each run, usage is charged back to the
participants who actually steered it.

**The agent cannot write to your repository.** It reads, searches, and
*proposes*. A proposal becomes a pull request only when the room approves —
and the gate is re-evaluated server-side before a single GitHub call is made.

---

## Architecture

```
browser (static, no build step)
   │  one SSE channel per room
   ▼
FastAPI  ── app/hub.py         fan-out: server streams once, everyone sees it
         ── app/state.py       IDLE → RUNNING → PROPOSED → (approved) → PR
         ── app/agent.py       agent loop, steering queue, read-only tools
         ── app/keys.py        BYO keys, process memory only
         ── app/repo_reader.py read + search, sandboxed to the repo root
         ── app/providers.py   Anthropic · TokenRouter
         ── app/memory.py      mem0, degrades to in-process
         ── app/github_pr.py   the ONLY write path in the project
   │
   ▼
pdd/     PDD-generated modules — the decision logic
         token_split.py      how a shared run is billed
         approval_quorum.py  whether a proposal may become a PR
         role_policy.py      which role holds which power
```

The three decisions that carry real consequences — *who pays*, *who decides*,
and *what ships* — are the modules owned by PDD prompts, not hand-written.

### Session states

| State | What it means |
|---|---|
| `IDLE` | Anyone edits the Intent doc. Anyone hits Run. |
| `RUNNING` | Prompts don't interrupt; they queue as steers. |
| `AWAITING_INPUT` | The agent asked the room; the next message answers. |
| `PROPOSED` | A patch is waiting on approval. |

---

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
```

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

Generate the PDD-owned modules from their prompts — **required, the app
degrades without them**:

```bash
./scripts/pdd-sync.sh
```

Run it:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open <http://localhost:8000>, pick a room name and a role. To share the room
with teammates on the same LAN, use your computer's LAN address instead (for
example, `http://10.10.10.82:8000/r/<room>`). Everyone lands in the same
session.

### Environment

| Variable | Required | What for |
|---|---|---|
| `GITHUB_TOKEN` | for PRs | Opening the approved pull request |
| `GITHUB_REPO` | for PRs | `owner/name` the PR is opened against |
| `GITHUB_BASE_BRANCH` | no | Defaults to `main` |
| `MEM0_API_KEY` | no | Cross-run room memory; falls back in-process |
| `REPO_ROOT` | no | Codebase the agent may read; defaults to this repo |
| `FALLBACK_API_KEY` | no | House key, so a visitor can try a room without bringing one |
| `FALLBACK_PROVIDER` | no | Provider for the house key; defaults to `tokenrouter` |
| `SEED_ROOMS` | no | `0` disables the worked example in new rooms |
| `ALLOW_DEMO_SEED` | no | `1` enables the rehearsal proposal endpoint |

Participants normally supply their own model API key in the UI. If
`FALLBACK_API_KEY` is set, a room that nobody has brought a key to falls back to
it, so the product is usable on arrival — a participant's own key always wins
over the house key.

**Never put a key in a file in this repository.** It is public; set keys in the
deployment platform's environment settings.

### Test

```bash
pytest tests/ -q
```

The approval-gate tests skip until `scripts/pdd-sync.sh` has generated
`pdd/approval_quorum.py` — a missing artifact is "not generated yet", not a
broken build. After generation: **90 passing**.

---

## What we built today

Everything in this repository except the PDD scaffolding (`.pddrc`,
`success_python.prompt`) was written on 25 July 2026 during the event. The
commit history shows the work in sequence, including the prompt-iteration cycle
described in [`PDD_EVIDENCE.md`](PDD_EVIDENCE.md).

## Known limitations

Honest list, in the order we would fix them:

- **Room state is in-process.** One server instance; a restart clears every
  room. Fine for a demo, wrong for production — it wants Postgres or Redis.
- **No authentication.** Anyone with the room URL can join and vote. The
  approval gate is only as strong as who has the link.
- **The Intent doc is last-write-wins** on a 400 ms debounce, not a CRDT.
  Two people typing the same line will clobber each other.
- **Proposals carry whole files, not patches.** Fine for small modules, wrong
  for large files.
- **`search` is a substring scan**, not an index. It will not scale past a
  repository of this size.
- **The PR path assumes a fresh branch.** It does not handle a force-push or a
  conflicting concurrent edit.
- **Band (agent-to-agent) is not wired up.** Design sketched below; we ran out
  of clock.

---

## Sponsor tools used

| Sponsor | Where it lives | What it does for us |
|---|---|---|
| **[TokenRouter](https://www.tokenrouter.com/console/token)** | `app/providers.py` | Fronts leading models behind a Claude-compatible Messages API. This is what makes bring-your-own-key practical: one streaming implementation serves a direct Anthropic key *and* a TokenRouter key covering OpenAI/Gemini/others, so a room does not have to standardise on one vendor for everyone to take part. |
| **[mem0](https://mem0.ai/)** | `app/memory.py` | Room memory across runs. The agent's `log_decision` tool writes decisions to mem0 under `room:<id>`; the next run recalls them, so the room does not re-litigate what it settled an hour ago. Degrades to in-process recall without a key. |
| **[Render](https://render.com/)** | `render.yaml` | Deployment. Chosen for a real technical reason, not only for points: a run holds an SSE connection open for minutes, which a serverless platform would cut off. Render gives us a persistent process. |
| **[Band](https://www.band.ai/)** | *planned* | Agent-to-agent. The natural next step: today a participant is a human with a role, but nothing in the room model requires that. Band would let a teammate delegate their seat to their own agent — it joins as a participant, holds a role, steers mid-run, and **votes on proposals** under the same quorum rules. Not built; see limitations. |

---

## PDD workflow

This project is built the PDD way, and the evidence is in
[`PDD_EVIDENCE.md`](PDD_EVIDENCE.md):

- **Prompts are the source.** `prompts/*.prompt` defines behaviour.
- **`pdd/` holds artifacts.** Never hand-edited. When behaviour must change,
  the prompt changes and the module is regenerated.
- **One documented iteration** where test evidence forced a prompt change — a
  rounding bug that lost a token per split was fixed in the *prompt*, not
  patched in the code.

## Disclosures

- **AI tool usage.** This project was built using prompt-driven development —
  that is the point of the event. The PDD CLI (local/Codex route) generates the
  modules under `pdd/` from the prompts in `prompts/`. Claude Opus was used as
  a pair-programming assistant for the application code in `app/` and
  `static/`, which is hand-reviewed and not PDD-generated. Co-authored commits
  carry a commit trailer.
- **API keys.** No keys are committed. Participant keys are held in process
  memory for the session only — never written to disk, never logged, never
  included in any client payload. There is a test asserting this:
  `test_api_key_never_appears_in_any_client_payload`.
- **Attribution.** Dependencies are FastAPI, uvicorn, httpx and pytest — all
  permissively licensed and unmodified. No third-party code was copied in.
- **Pre-existing work.** None. The repository was empty apart from `pdd setup`
  scaffolding when the event began.

## License

MIT — see [LICENSE](LICENSE).
