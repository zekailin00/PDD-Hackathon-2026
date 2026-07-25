# co-prompt

Prompt-driven development is still usually one driver and several reviewers.
co-prompt adds the missing multiplayer control layer: a shared intent document,
role lanes, live execution, checkpoint steering, room approval, and export to a
real PDD Issue.

## Run locally

Requires Node 22 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `TOKENROUTER_API_KEY` on the server. The browser never receives provider
credentials. TokenRouter has no auto alias, so the app reads its live catalog
and chooses an eligible OpenAI-compatible text model deterministically. Opus is
excluded by policy.

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
`supabase/migrations/` contains the RLS-safe durable schema; connecting it is
tracked in `docs/IMPLEMENTATION_GAP_AUDIT.md`.

## AI use disclosure

This repository was migrated and implemented with AI assistance in Codex,
including PDD prompt translation, TypeScript implementation, tests, and
documentation. Product direction, positioning, naming decisions, scope, and
final submission copy remain human-controlled. Git history and PDD prompts are
the reproducible engineering evidence.
