# CoPrompt Demo

## One-line pitch

PDD makes prompts durable source; CoPrompt makes that source team-owned.

## Five-minute judge script

### 0:00–0:25 — Problem

“AI coding tools assume one operator. Product decisions do not. CoPrompt lets a
whole team direct one AI run and ship only what the room approves.”

Show the public Demo room and the live participant roster.

### 0:25–0:55 — Join and assign authority

Open a second browser or phone, join the same room, and choose a different role.
Point out that PM, ENG, DESIGN, QA, and observer have different server-enforced
powers and creator-configurable decision priorities.

### 0:55–1:25 — Shared intent

Make one small, visible edit to the shared intent. Explain that the intent—not
Member Chat—is the durable direction for the run.

### 1:25–2:20 — One shared run, live steering

Start one short run. In the second client, send a NUDGE while it is running.
Pause on:

- identical streamed progress in both clients;
- “picked up” versus “waiting” contribution state;
- the named steering checkpoint;
- every submitted prompt and action appearing in room activity;
- Member Chat remaining separate from AI-visible context.

### 2:20–3:05 — Review the result

Show that the middle is a non-technical, conversation-first transcript. Then
open the generated HTML preview, code, and tests on the right. Show versioning
and download the generated JavaScript module if time allows.

### 3:05–3:50 — Agreement becomes a gate

Open the approval panel and show every eligible member's current vote. Submit a
request-changes vote and point out that its feedback immediately appears in the
room activity feed. Then update it to approval.

Line: “The browser button is not the security boundary; the API re-evaluates
role power and quorum before it calls GitHub.”

### 3:50–4:35 — Prove PDD

Open [`PDD_EVIDENCE.md`](../PDD_EVIDENCE.md). Show the token allocation chain:

```text
prompt → generated module → live call site → test
```

Then show commits `1d368dc`, `04b4544`, and `3debc17`:

“Tests found that 100 tokens became 99. We changed the prompt to require exact,
deterministic conservation, regenerated, and got 34/33/33. We never patched the
generated artifact.”

### 4:35–5:00 — Honest close

“Today this runs as one Render instance with process-local rooms; durable
Supabase rooms are next. The core is live now: multi-human steering, visible
agent pickup, shared review, and approval-gated PDD export.”

Close with:

“Prompt capital is a team asset. CoPrompt is where the team builds it.”

## Demo safety plan

Before presenting:

- open the live app and `/api/health`;
- confirm TokenRouter, Mem0, and GitHub show configured;
- keep the seeded Demo room open in two clients;
- verify GitHub export permission with a disposable rehearsal run;
- use a short deterministic prompt;
- keep [`PDD_EVIDENCE.md`](../PDD_EVIDENCE.md) open in another tab;
- record a backup video of the full flow;
- test once from a phone on cellular.

If the live model is slow, show the seeded room history and explain the same
flow, then use the remaining time on quorum export and PDD evidence. Do not hide
the failure or spend the whole demo waiting on a model.

## Suggested short prompt

```text
Create a single-page launch checklist with three stages and a visible completion
counter. Keep it mobile-friendly. Return complete HTML plus acceptance criteria
and tests.
```

Suggested mid-run NUDGE:

```text
Make the three stages visually distinct and keep the primary action above the
fold on mobile.
```
