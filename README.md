# CoPrompt

<p align="center">
  <img src="public/coprompt-lockup.png" alt="CoPrompt" width="420">
</p>

CoPrompt is a collaborative AI coding room where a team can shape one shared
request, steer the same AI run, review its output, and approve a result together.

[Live app](https://coprompt-ai.onrender.com) ·
[Health endpoint](https://coprompt-ai.onrender.com/api/health)

## Features

- Public and private collaboration rooms with invite links.
- Shared intent, member chat, and live participant presence.
- Server-side AI runs with mid-run nudge and halt controls.
- Role-based permissions and decision priority.
- Shared progress, generated artifacts, preview, criteria, and tests.
- Unanimous or majority approval tracking.
- Generated JavaScript download.
- Optional Mem0 recall for approved room decisions.
- English and Traditional Chinese interfaces with light and dark themes.

## Project structure

```text
app/                  Next.js UI and API routes
lib/                  Shared domain rules and browser utilities
lib/server/           Server-only integrations and room runtime
public/               Product images
supabase/migrations/  Prepared persistence migration
tests/                Vitest unit and boundary tests
render.yaml           Render deployment configuration
```

Core product rules live in `lib/`:

- `approval.ts` — room approval evaluation;
- `code-download.ts` — generated JavaScript download;
- `model-router.ts` — eligible model selection;
- `roles.ts` — role permissions and voter selection;
- `token-allocation.ts` — deterministic token attribution.

## Run locally

Requires Node.js 22 or newer.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Live AI runs require:

```dotenv
TOKENROUTER_API_KEY=
```

Optional configuration:

```dotenv
MEM0_API_KEY=
ROOM_SIGNING_SECRET=
```

Never commit real credentials.

## Validate

```bash
npm run check
```

This runs TypeScript checking, the Vitest suite, and a production Next.js build.

## Deployment

Production is configured in `render.yaml`:

- branch: `new`;
- Node.js 22;
- build: `npm ci && npm run build`;
- start: `npm start`;
- health check: `/api/health`;
- one application instance.

One instance is required while the room store remains process-local.

## Current limitations

- A restart clears non-demo rooms and room-specific keys.
- Multiple instances do not yet share presence or room state.
- The Supabase migration is prepared, but the runtime still uses process memory.
- Generated tests are review artifacts and are not executed in an isolated
  sandbox.

## License

[MIT](LICENSE)
