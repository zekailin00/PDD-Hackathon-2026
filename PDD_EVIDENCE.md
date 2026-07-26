# PDD Evidence

## Judge summary

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

CoPrompt follows one operating rule:

> Prompts, acceptance criteria, and tests are the durable source. Generated
> code is an artifact.

The repository contains six complete current chains from prompt to generated
artifacts, production use, and acceptance tests. It also preserves a
documented iteration where failing evidence changed the source prompt rather
than triggering a manual patch to generated code.

## Current artifact chains

| Decision | Prompt source | Generated artifact | Production call site | Acceptance evidence |
|---|---|---|---|---|
| Split one run across contributors without losing tokens | [`prompts/token_split_typescript.prompt`](prompts/token_split_typescript.prompt) | [`pdd/token-split.ts`](pdd/token-split.ts) | [`lib/server/run-agent.ts`](lib/server/run-agent.ts) calls `splitTokens` after a run | [`tests/token-split.test.ts`](tests/token-split.test.ts) |
| Decide whether a proposal has room approval | [`prompts/approval_quorum_typescript.prompt`](prompts/approval_quorum_typescript.prompt) | [`pdd/approval-quorum.ts`](pdd/approval-quorum.ts) | vote and export API routes call `evaluateQuorum` | [`tests/approval-quorum.test.ts`](tests/approval-quorum.test.ts) |
| Enforce what each role may do | [`prompts/role_policy_typescript.prompt`](prompts/role_policy_typescript.prompt) | [`pdd/role-policy.ts`](pdd/role-policy.ts) | run, steer, vote, and export paths call `can`/`voters` | [`tests/role-policy.test.ts`](tests/role-policy.test.ts) and room boundary tests |
| Choose an eligible TokenRouter model deterministically | [`prompts/model_router_typescript.prompt`](prompts/model_router_typescript.prompt) | [`pdd/model-router.ts`](pdd/model-router.ts) | [`lib/server/tokenrouter.ts`](lib/server/tokenrouter.ts) calls `chooseModel` | [`tests/model-router.test.ts`](tests/model-router.test.ts) |
| Export arbitrary generated code losslessly | [`prompts/generated_code_download_javascript.prompt`](prompts/generated_code_download_javascript.prompt) | [`pdd/generated-code-download.ts`](pdd/generated-code-download.ts) | [`app/page.tsx`](app/page.tsx) calls `downloadGeneratedJavaScript` | [`tests/generated-code-download.test.ts`](tests/generated-code-download.test.ts) |

[`prompts/path_sandbox_typescript.prompt`](prompts/path_sandbox_typescript.prompt)
→ [`pdd/path-sandbox.ts`](pdd/path-sandbox.ts) →
[`tests/path-sandbox.test.ts`](tests/path-sandbox.test.ts) is an additional
prompt/artifact/test chain. It is intentionally **not** claimed as a complete
production chain because the current agent does not expose repository-reading
tools. The active ZIP boundary is implemented separately in
[`lib/server/project-archive.ts`](lib/server/project-archive.ts).

## Documented iteration: evidence changed the prompt

### 1. Prompt v1 defined proportional token allocation

Commit `1d368dc` introduced the original `token_split` prompt. It required
non-negative integer allocations, repeated-user handling, and three allocation
modes, but it did not define how integer rounding remainders should be handled.

```bash
git show 1d368dc:prompts/token_split_python.prompt
```

### 2. Acceptance tests exposed a source-level gap

Commit `04b4544` added human-reviewed conservation and determinism tests. The v1
artifact failed 23 cases:

```text
100 tokens / 3 equal users → 33 + 33 + 33 = 99
1000 tokens at 5:3:1      → 555 + 333 + 111 = 999
```

That evidence mattered because allocation is shown as the contribution cost of
a shared run. Silent rounding loss would make the ledger internally
inconsistent.

```bash
git show --stat 04b4544
```

### 3. The team fixed the source, not the artifact

Commit `3debc17` changed the prompt to require:

- exact conservation: `sum(result.values()) == totalTokens`;
- largest-remainder distribution;
- deterministic `userId` tie-breaking;
- input-order independence;
- the explicit `100 → 34/33/33` example.

The generated module was then regenerated. The team did **not** hand-edit the
generated implementation because that would leave the source wrong and allow
the defect to return on the next generation.

```bash
git show 3debc17 -- prompts/token_split_python.prompt
```

### 4. The proven behavior survived the TypeScript production migration

Commit `ec4da49` ported the prompt, generated artifact, and tests into the
current TypeScript application. The current contract still requires exact
conservation and deterministic remainder handling:

- source: [`prompts/token_split_typescript.prompt`](prompts/token_split_typescript.prompt);
- artifact: [`pdd/token-split.ts`](pdd/token-split.ts);
- live use: [`lib/server/run-agent.ts`](lib/server/run-agent.ts);
- regression test: [`tests/token-split.test.ts`](tests/token-split.test.ts).

## Security and forbidden-outcome evidence

The suite is not limited to happy paths. It pins the outcomes that must never
occur:

- outsiders and duplicate members cannot manipulate quorum;
- `request_changes` vetoes approval;
- observers cannot become voters by typo or unknown role;
- private rooms are not publicly listed;
- room keys never appear in client snapshots;
- Member Chat never enters model context;
- uploaded ZIPs reject traversal, secrets, excessive size, and binary files;
- Mem0 writes exclude chat, source archives, generated code, and credentials;
- model routing rejects ineligible catalogs and all Opus-family IDs;
- generated-code export rejects blank input and invalid identifiers.

The relevant boundary suites are:

- [`tests/room-store.test.ts`](tests/room-store.test.ts);
- [`tests/project-archive.test.ts`](tests/project-archive.test.ts);
- [`tests/memory.test.ts`](tests/memory.test.ts);
- [`tests/tokenrouter-config.test.ts`](tests/tokenrouter-config.test.ts).

## Regenerate and verify

PDD-managed modules:

```bash
./scripts/pdd-sync.sh
```

Complete repository gate:

```bash
npm run check
```

The gate runs:

1. TypeScript compile checking;
2. all Vitest acceptance and boundary tests;
3. a production Next.js build.

## External PDD trail

- [Original PDD issue #3](https://github.com/zekailin00/PDD-Hackathon-2026/issues/3)
  records the goal, acceptance criteria, MUST NOT constraints, evidence, and
  validation path.
- [Production PR #1](https://github.com/zekailin00/PDD-Hackathon-2026/pull/1)
  records the initial prompt-driven application chain.
- [Role-policy PR #2](https://github.com/zekailin00/PDD-Hackathon-2026/pull/2)
  records the third artifact chain and the observer/quorum forbidden outcome.

The historical issue describes the first Python implementation. The current
production tree is TypeScript; commit `ec4da49` is the explicit migration link.

## What is generated and what is not

Generated, prompt-owned decision logic lives under `pdd/`. Framework wiring,
HTTP routes, room storage, UI, and integration adapters are hand-reviewed
application code.

That boundary is deliberate. PDD is used where behavior is consequential,
testable, and likely to evolve: who may act, what may ship, how cost is
allocated, which model is eligible, and whether generated code is exported
losslessly. Ordinary framework glue is not presented as generated evidence.
