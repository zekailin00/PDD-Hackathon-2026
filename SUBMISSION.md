# CoPrompt Submission Package

## Copy-ready fields

**Project name:** CoPrompt

**50-character description:**

```text
CoPrompt: teams steer one AI and ship it together.
```

Character count includes spaces and punctuation: **50**.

**Long description:**

CoPrompt is a multiplayer prompt-driven development room for product and
engineering teams. Teammates bring role-specific intent into one shared AI run,
see exactly whose input has been consumed, steer at safe checkpoints, review
the same generated artifact, and approve together before exporting a structured
PDD Issue. Prompt-owned decision modules govern token allocation, role powers,
model selection, and quorum, with acceptance tests and a documented iteration
where failed conservation evidence changed the source prompt instead of the
generated artifact.

## Required submission package

| Requirement | Submission |
|---|---|
| Repository | <https://github.com/zekailin00/PDD-Hackathon-2026/tree/new> |
| README | [`README.md`](README.md) |
| PDD evidence | [`PDD_EVIDENCE.md`](PDD_EVIDENCE.md) |
| Demo | <https://coprompt-ai.onrender.com> and [`docs/DEMO.md`](docs/DEMO.md) |
| Disclosures | [Disclosures](#disclosures) below |
| Track selection | Main rubric / overall judging; no unimplemented sponsor track is claimed |

## Repository publication blocker

GitHub currently opens `main` by default, while Render and the latest product
use `new`. Before submission, either merge the verified `new` tree into `main`
or make `new` the default branch. Otherwise a judge following the repository
root may land on an older product and miss this submission package.

## Problem and user

**User:** small product and engineering teams directing AI coding agents.

**Problem:** solo-agent interfaces fragment team intent, hide whether feedback
was consumed, and allow generated work to move forward without shared approval.

**Result:** one room turns team intent into a visible, steerable, reviewable,
approval-gated PDD artifact.

## What was built during the event

- shared rooms, roles, presence, intent, chat, and one streamed AI run;
- mid-run NUDGE/HALT checkpoints and visible contribution pickup;
- browser artifact preview, criteria, tests, versioning, and code download;
- server-enforced role and quorum gates;
- GitHub PDD Issue export after approval;
- optional approved-decision memory with Mem0;
- deterministic TokenRouter model selection;
- prompt → artifact → call site → test chains and deployment on Render.

## Track selection

**Primary judging target:** the main 100-point rubric.

**Sponsor technologies actually used:**

- Render web service for the live Node.js deployment;
- Mem0 for opt-in approved room-decision memory;
- TokenRouter for model catalog and inference routing.

**Do not claim without additional implementation and proof:**

- overall 1st/2nd/3rd prize eligibility—the prize descriptions say **Render
  Workflows is required**, while the current deployment is a Render web service;
- Best Project with Band—Band is not integrated;
- Best Use of MiniMax—no MiniMax-specific path is guaranteed;
- Ophanim—the product is not presented as defense-adjacent.

This conservative selection protects the disclosure and technical-credibility
score. The Render Workflows gap is a prize-eligibility blocker, not a wording
problem. Update this section only if a real workflow is deployed and the demo
can prove it.

## Disclosures

- Codex and Claude Code assisted implementation, migration, PDD prompt
  translation, tests, and documentation.
- The PDD CLI generated decision modules from versioned prompts.
- Humans selected the product direction, CoPrompt name, scope, acceptance
  decisions, and final submission copy.
- Runtime browser artifacts are AI-generated and visibly labeled as such.
- Third-party packages are listed in [`package.json`](package.json) and retain
  their original licenses. The project is published under the [MIT License](LICENSE).
- Git history starts during the event window and preserves the work sequence.
- Known limitations are stated in [`README.md`](README.md#known-limitations).

## Six-gate preflight

| Gate | Status |
|---|---|
| Every teammate registered and team-size compliant | **Manual owner check required** |
| Submission sent before **7:45 PM** | **Manual owner check required—submit early** |
| Public repo, README, demo, and links open for judges | **Repo/demo verified; recheck from logged-out mobile** |
| Version history shows event-day work; pre-existing work disclosed | **Documented in Git history and disclosures** |
| At least one complete PDD artifact chain | **Five complete current chains documented** |
| Conduct, ownership, safety, licenses, and attribution | **Documented; final owner confirmation required** |

## Final submission order

1. Open every link in a logged-out browser.
2. Test the Demo room on cellular, not only venue Wi-Fi.
3. Run `npm run check`.
4. Record a short backup demo.
5. Submit before the deadline and retain the confirmation.
6. Do not add sponsor-track claims after submission unless the deployed product
   and evidence both support them.

If scores tie, the event slides list automated PDD compliance, earlier
submission time, and a documented panel decision as tie-breakers. Submit as
soon as the verified package is ready.
