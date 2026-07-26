# Implementation gap audit

Status updated: 2026-07-25.

## Branch consolidation

`new` is the production line. It now contains the current Next.js work from
`main`, the theme/language/brand/ZIP/live-preview work, the Demo and interaction
fixes, and the Mem0 integration. The old `feat/*` and
`wip/python-progress-threads` tips are retained as history only: their unique
trees are obsolete Python or pre-rewrite implementations that would remove the
current Next.js app if merged literally. The useful behavior from those
experiments is already represented by the TypeScript implementation and tests.

## Implemented on `new`

- Next.js 15, Node 22+, TypeScript, server-only credentials, and Render config.
- English-first bilingual UI, light/dark mode, CoPrompt brand assets, favicon,
  keyboard submit, responsive toolbar, and visible presence states.
- Separate room creation and dropdown joining, public/private invites, creator
  settings, confirmed logout, and Demo-only seeded data.
- Optional project ZIP upload with bounded server-only read context.
- Shared intent, reply threads, and Member Chat excluded from AI context and
  token allocation.
- TokenRouter live-catalog model selection; Opus is excluded.
- SSE multiplayer sync, role lanes, three-phase streaming, NUDGE/HALT steering,
  progress attribution, and atomic single-run gate.
- Browser-ready HTML preview/code, tests/criteria artifacts, and versions.
- Unanimous room approval plus GitHub PDD Issue export.
- Opt-in Mem0 room decision memory:
  - server-only `MEM0_API_KEY`;
  - scoped by CoPrompt room id;
  - retrieves up to five relevant approved memories before a run;
  - writes only after quorum;
  - excludes Member Chat, provider secrets, uploaded ZIP source, generated code,
    and unapproved proposals;
  - fails open so Mem0 outages do not stop agent runs.
- PDD prompts, deterministic TypeScript artifacts, and Vitest boundary tests.
- Supabase RLS schema prepared for durable phase two.

## Still required for the full product

### Core product gaps

- Replace the process-local room store with Supabase Postgres, Realtime, and
  Presence so rooms survive restart, scale past one Render instance, and work
  reliably across devices.
- Add stable Supabase Auth identity before implementing personal long-term
  memory. The current Mem0 integration is deliberately room-scoped.
- Add a creator-only memory management view for listing and deleting room
  memories.
- Implement `AWAITING_INPUT`, `ask_room`, first-answer ownership, and the
  10-second +1/contest window.
- Add presence expiry and stronger reconnect semantics.
- Add artifact version picker/diff and a real QA runner/broadcast.
- Add repository read/propose tools and real patch generation.
- Add room-approved branch and PR creation. Current export creates a PDD Issue.

### Sponsor and submission gaps

- Run a live Mem0 retrieval/write smoke test after the rotated production key is
  active.
- Add Respan gateway/dashboard, RocketRide pipeline, ElevenLabs announcements,
  and optional MiniMax path if required for judging.
- Complete public mobile-network testing, QR slide/printout, backup demo video,
  RocketRide submission, and social submission steps.

### “Users are their agents” extension

- The current product has many humans directing one shared agent.
- Per-user agents require delegated identity, scoped authority, provenance,
  conflict resolution, and human confirmation before votes or external
  actions. This remains phase two.
