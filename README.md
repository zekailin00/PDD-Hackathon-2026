# co-prompt

Prompt-driven development is still usually one driver and several reviewers.
co-prompt adds the missing multiplayer control layer: a shared intent document,
role lanes, live execution, checkpoint steering, room approval, and export to a
real PDD Issue.

Live production: [https://coprompt-ai.onrender.com](https://coprompt-ai.onrender.com)

## Current demo

- Join an existing public room from a dropdown, or use a private invite link.
- Create a separate public/private co-working session with role, model,
  optional room API key, and system prompt settings.
- Use Member Chat without sending those messages to the AI or consuming tokens.
- See online, away, and offline presence; logout removes the member.
- Run one shared TokenRouter agent, steer it with NUDGE/HALT, review artifacts,
  vote, and export an approved PDD Issue.
- Seed data exists only in the public Demo room.

## Run locally

Requires Node 22 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `TOKENROUTER_API_KEY` on the server. A creator can optionally submit a
room-specific key over HTTPS; it is held only in server process memory and is
never returned in room snapshots. TokenRouter has no auto alias, so the app
reads its live catalog and chooses an eligible OpenAI-compatible text model
deterministically. Opus is excluded by policy.

## Validation

```bash
npm run check
```

The PDD source prompts live in `prompts/`; generated decision modules live in
`pdd/`; behavioral tests live in `tests/`.

## Architecture

Browser clients subscribe to a room SSE stream on the Node server. One client
starts the shared agent; every token and step is broadcast to every subscriber.
NUDGE and HALT commands enter a queue and are consumed between the three bounded
agent phases. The server keeps provider and GitHub credentials private.

The current room store is process-local for a reliable single-instance demo.
Keep Render at exactly one instance until Supabase persistence, Realtime, and
Presence are connected. A restart clears non-Demo rooms and room-specific keys.
`supabase/migrations/` contains the RLS-safe durable schema; connecting it is
tracked in `docs/IMPLEMENTATION_GAP_AUDIT.md`.

## AI use disclosure

This repository was migrated and implemented with AI assistance in Codex,
including PDD prompt translation, TypeScript implementation, tests, and
documentation. Product direction, positioning, naming decisions, scope, and
final submission copy remain human-controlled. Git history and PDD prompts are
the reproducible engineering evidence.
