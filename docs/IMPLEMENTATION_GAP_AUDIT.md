# Implementation gap audit

## Implemented on `new`

- Next.js 15, Node 22+, TypeScript, server-only provider credentials.
- Shared server room with SSE broadcast, role lanes, intent document, room chat.
- Separate room creation and dropdown-based joining, public/private invite
  links, creator settings, presence states, confirmed logout, and Demo-only
  seed data.
- Member Chat is explicitly excluded from agent context and token allocation.
- Optional per-room provider keys stay in server process memory and never
  appear in room snapshots.
- `IDLE`, `RUNNING`, `PROPOSED` lifecycle and atomic single-run gate.
- Steering Queue with `NUDGE` and clean-checkpoint `HALT`.
- TokenRouter live-catalog automatic model selection through OpenAI-compatible
  chat completions; Opus is explicitly excluded.
- Three-step streamed agent execution with bounded room context.
- HTML/tests/criteria artifacts, sandboxed iframe preview, linear versions.
- Role-aware proposal votes and unanimous approval gate.
- GitHub PDD Issue export after approval.
- PDD prompts, deterministic TypeScript artifacts, and Vitest coverage for token
  split, approval quorum, role policy, path sandbox, and model routing.
- Supabase schema migration with RLS enabled and server-only table access.

## Still required for the full product spec

### Core demo gaps

- Connect a real Supabase project and replace in-memory room persistence with
  Postgres plus Realtime Broadcast/Presence. Current SSE works on one Node
  process but does not survive a restart or multiple Render instances.
- Implement `AWAITING_INPUT`, `ask_room`, first-answer ownership, and the 10-second
  +1/contest window.
- Add real presence expiry and reconnect semantics. Current avatars represent
  joined participants, not guaranteed live sockets.
- Add artifact version picker/diff and a real QA test runner/broadcast.
- Add repository read/propose tools. The path sandbox decision exists, but the
  agent currently creates room artifacts rather than a real patch.
- Add room-approved PR creation. The current approved export creates the required
  PDD Issue, not a branch or PR.

### Sponsor and submission gaps

- mem0 decision memory, Respan gateway/dashboard, RocketRide pipeline,
  ElevenLabs announcements, and optional MiniMax path.
- Public mobile-network smoke test after each production deployment.
- Seeded demo room, QR join slide, offline QR printout, and 90-second backup video.
- Public GitHub README architecture/AI disclosure and PDD evidence links.
- RocketRide `/submit`, Discord/Instagram actions, and LinkedIn post.

### “Users are their agents” extension

- The current product has many humans directing one shared agent.
- If each user is represented by their own agent, add delegated-agent identity,
  scoped authority, agent-to-agent provenance, conflict resolution, and human
  confirmation before delegated votes or external actions. This should be a
  second phase; it is not needed to prove the multiplayer PDD wedge.
