# CoPrompt

CoPrompt is a multiplayer prompt-driven development room: several people edit
one shared intent, guide one shared agent, review browser-ready artifacts, and
ship only after the room approves.

Live production: [https://coprompt-ai.onrender.com](https://coprompt-ai.onrender.com)

## Current product

- English-first interface with Traditional Chinese switch and light/dark mode.
- Separate Join Room and Create Co-working Session flows.
- Public room dropdown, private invite links, creator settings, and role lanes.
- Optional starting project ZIP, loaded as server-side read-only agent context.
- Server-only TokenRouter keys and live-catalog model selection; Opus is excluded.
- Shared intent plus Member Chat that is never sent to AI and uses zero tokens.
- Online/away/offline presence, confirmed logout, and reply threads.
- Three-phase streamed execution with NUDGE/HALT checkpoint steering.
- Complete HTML preview/code, acceptance criteria, tests, and room quorum.
- Approved PDD Issue export to GitHub.
- Optional Mem0 room memory. It retrieves relevant approved decisions before a
  run and writes only approved intent/criteria after quorum. Member Chat,
  credentials, uploaded source, and generated code are excluded.
- Seeded content exists only in the public Demo room.

## Run locally

Requires Node 22 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required for live AI runs:

```dotenv
TOKENROUTER_API_KEY=
```

Optional integrations:

```dotenv
MEM0_API_KEY=
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
```

All integration keys are server-only. Never prefix them with `NEXT_PUBLIC_`.
A room creator may optionally provide a room-specific TokenRouter key over
HTTPS; it remains in server process memory and is never returned in snapshots.

## Render production settings

- Branch: `new`
- Runtime: Node
- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- Instances: exactly `1`

Set `TOKENROUTER_API_KEY`, `MEM0_API_KEY`, and the GitHub variables in Render
Environment. The current room store is process-local, so a restart clears
non-Demo rooms and room-specific keys. Keep one instance until Supabase
Postgres, Realtime, and Presence replace the in-memory store.

## Validation

```bash
npm run check
```

The PDD source prompts live in `prompts/`; generated decision modules live in
`pdd/`; behavior and security-boundary tests live in `tests/`.

## PDD artifact chain: generated-code download

This commit includes a complete PDD artifact chain for the **Download generated
code** action in the room artifact panel. It is deliberately kept as a small,
reviewable library rather than embedding browser-download details in the React
screen.

| Chain stage | File | What it proves |
|---|---|---|
| Prompt source of truth | [`prompts/generated_code_download_typescript.prompt`](prompts/generated_code_download_typescript.prompt) | Defines the public API, lossless escaping requirements, browser-only download contract, validation rules, and forbidden behavior. |
| Generated TypeScript artifact | [`pdd/generated-code-download.ts`](pdd/generated-code-download.ts) | Implements the prompt contract: arbitrary generated code becomes a self-contained `.ts` module with a named and default export, then downloads through a UTF-8 Blob and browser anchor. The file header identifies the prompt it was generated from. |
| Product integration | [`app/page.tsx`](app/page.tsx) | Imports `downloadGeneratedTypeScript`, finds the latest generated HTML artifact, and invokes the PDD module when the user presses **Download generated code**. The UI never implements its own Blob or anchor-download logic. |
| Behavioral test | [`tests/generated-code-download.test.ts`](tests/generated-code-download.test.ts) | Verifies lossless embedding of code containing backticks and Unicode, and verifies rejection of blank source and invalid TypeScript export names. |

The generated download is intentionally a TypeScript module, not a raw HTML
file: it exports the generated browser artifact as a string, so judges or other
developers can import it, inspect it, or use it in another application without
depending on CoPrompt at runtime.

To regenerate or review the artifact, start with the prompt above and compare
the resulting implementation against the tests. To run the same repository gate
used by this commit:

```bash
npm run check
```

## Architecture

Browser clients subscribe to one room SSE stream on the Node server. One client
starts the agent; tokens, steps, presence, steering, artifacts, votes, and
memory status are broadcast to the room.

The agent context is assembled on the server in this order:

1. shared System Prompt and role ownership;
2. shared intent;
3. optional uploaded ZIP context;
4. relevant approved Mem0 room decisions;
5. recent AI-visible conversation, excluding Member Chat.

Mem0 is a long-term decision layer, not the room database. Room persistence and
cross-device identity remain planned Supabase work; see
[`docs/IMPLEMENTATION_GAP_AUDIT.md`](docs/IMPLEMENTATION_GAP_AUDIT.md).

## AI use disclosure

This repository was migrated and implemented with AI assistance in Codex,
including PDD prompt translation, TypeScript implementation, tests, and
documentation. Product direction, positioning, naming decisions, scope, and
final submission copy remain human-controlled. Git history and PDD prompts are
the reproducible engineering evidence.
