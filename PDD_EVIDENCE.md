# PDD evidence

CoPrompt keeps consequential decisions as prompt-owned TypeScript artifacts:

| Decision | Source prompt | Artifact | Acceptance test |
|---|---|---|---|
| Shared token allocation | `prompts/token_split_typescript.prompt` | `pdd/token-split.ts` | `tests/token-split.test.ts` |
| Room approval quorum | `prompts/approval_quorum_typescript.prompt` | `pdd/approval-quorum.ts` | `tests/approval-quorum.test.ts` |
| Role powers | `prompts/role_policy_typescript.prompt` | `pdd/role-policy.ts` | `tests/role-policy.test.ts` |
| Repository read boundary | `prompts/path_sandbox_typescript.prompt` | `pdd/path-sandbox.ts` | `tests/path-sandbox.test.ts` |
| TokenRouter model choice | `prompts/model_router_typescript.prompt` | `pdd/model-router.ts` | `tests/model-router.test.ts` |
| Generated-code JavaScript download | `prompts/generated_code_download_javascript.prompt` | `pdd/generated-code-download.ts` | `tests/generated-code-download.test.ts` |

## Documented prompt iteration

The generated-code download chain initially specified a TypeScript (`.ts`)
download. Submission evidence review identified the need for a directly
executable JavaScript (`.js`) module. The source prompt was updated to require
an ES-module JavaScript artifact; `pdd/generated-code-download.ts` was
regenerated with JavaScript-named APIs, `.js` filename enforcement, and a
`text/javascript` Blob; `app/page.tsx` was updated to call the new API; and
`tests/generated-code-download.test.ts` was updated to assert the JavaScript
identifier contract. This records an evidence-driven change across prompt,
generated artifact, integration, and test.

Production room-boundary tests live in `tests/room-store.test.ts` and
`tests/memory.test.ts`. They verify that private rooms are not publicly listed,
room API keys never appear in client snapshots, Member Chat is excluded from AI
context, logout removes the member, seed content remains isolated to the Demo
room, memory is opt-in, and approved memories exclude chat, ZIP source,
generated code, and credential-looking values.

Run the complete gate with:

```bash
npm run check
```

AI assistance was used for implementation, migration, testing, and
documentation. Product direction, naming, scope, and final submission copy
remain human-controlled.
