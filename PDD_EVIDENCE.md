# PDD Evidence

The operating rule we worked under: **prompts, acceptance criteria and tests
are the durable source. Generated code is an artifact.** When behaviour had to
change, we changed the prompt and regenerated — we did not patch the artifact.

---

## Artifact chain 1 — `token_split`

*How a shared run is billed back to the people who steered it.*

| Link | File |
|---|---|
| **Prompt** (source) | [`prompts/token_split_python.prompt`](prompts/token_split_python.prompt) |
| **Generated module** | `pdd/token_split.py` — via `./scripts/pdd-sync.sh` |
| **Where it is used** | [`app/agent.py`](app/agent.py) → `_settle_ledger()`, called at the end of every run |
| **Test** | [`tests/test_token_split.py`](tests/test_token_split.py) — 54 cases |

Contribution weights are assembled in
[`app/state.py`](app/state.py) → `Room.contributions_for()`, which counts each
participant's prompts, steers and answers for that run and puts the initiator
first.

### The documented iteration — evidence changed the source

**What we observed.** The acceptance suite failed 23 conservation cases against
the v1 artifact:

```
$ pytest tests/test_token_split.py -q
23 failed, 31 passed

AssertionError: 100 tokens split 3 ways summed to 99
assert 99 == 100
 +  where 99 = sum(dict_values([33, 33, 33]))
```

Reproduced directly:

```
split_tokens(100, 3 users) -> {'amy': 33, 'joe': 33, 'kai': 33} | sum = 99
split_tokens(1000, 5:3:1)  -> {'amy': 555, 'joe': 333, 'kai': 111} | sum = 999
```

**Why it mattered.** Participants are billed against their own API keys from
this number. A dropped token is dropped money, and the loss compounds once per
run, silently.

**What we did *not* do.** We did not open `pdd/token_split.py` and add a
remainder line. That would have made the artifact correct and left the source
wrong — the next regeneration would have reintroduced the bug.

**What we did.** The v1 prompt never said what to do with the rounding
remainder, so the generated module dropped it. The gap was in the *intent*, so
the fix went in the intent. v2 adds to `## MUST`:

```diff
+ - MUST conserve the total: `sum(result.values()) == total_tokens` exactly, for
+   every mode and every combination of weights. Integer division alone does not
+   satisfy this -- 100 tokens split three ways is 34/33/33, never 33/33/33.
+ - MUST distribute the rounding remainder deterministically: give each
+   participant their floored share, then hand out the remaining tokens one at a
+   time, in descending order of the fractional part that was dropped, breaking
+   ties by `user_id` ascending. The result MUST NOT depend on dict iteration
+   order or on the order of `contributions`.
```

...plus two worked examples showing the remainder landing.

**Result after regeneration.**

```
$ pytest tests/test_token_split.py -q
54 passed

split_tokens(100, 3 users) -> {'amy': 34, 'joe': 33, 'kai': 33} | sum = 100
split_tokens(1000, 5:3:1)  -> {'amy': 556, 'joe': 333, 'kai': 111} | sum = 1000
```

**Commit trail.**

| Commit | What it records |
|---|---|
| `1d368dc` | `feat(pdd): token_split prompt v1 — proportional usage split` |
| `04b4544` | `test(pdd): conservation and determinism acceptance tests` |
| `3debc17` | `fix(pdd): token_split prompt v2 — specify deterministic remainder distribution` |

The determinism requirement came from the same pass: a remainder rule that
depends on dict ordering means two teammates see different bills for the same
run. `test_remainder_does_not_depend_on_input_order` pins that down.

---

## Artifact chain 2 — `approval_quorum`

*Whether a proposal may become a pull request.*

| Link | File |
|---|---|
| **Prompt** (source) | [`prompts/approval_quorum_python.prompt`](prompts/approval_quorum_python.prompt) |
| **Generated module** | `pdd/approval_quorum.py` — via `./scripts/pdd-sync.sh` |
| **Where it is used** | [`app/main.py`](app/main.py) → `_quorum()`, called by `/vote`, `/quorum`, and — critically — by `/pr` **before any GitHub call** |
| **Test** | [`tests/test_approval_quorum.py`](tests/test_approval_quorum.py) — 22 cases, plus 4 end-to-end in [`tests/test_room_flow.py`](tests/test_room_flow.py) |

This module is the security boundary of the product. The agent is read-only;
`app/github_pr.py` is the only code path that writes anything, and it is
unreachable until this module returns `can_open_pr`.

The prompt therefore specifies **forbidden outcomes before happy paths**:

- a single `request_changes` vetoes under *every* policy, including majority
- silence is never approval
- votes from non-members are ignored entirely, so an outsider can neither
  approve nor veto
- the three result buckets must partition the member list exactly, so a client
  cannot render a state where someone has silently vanished

`test_gate_is_enforced_server_side_not_in_the_browser` calls the PR endpoint
directly with zero votes and asserts it is refused — the gate does not depend
on the button being disabled.

---

## How to regenerate

```bash
./scripts/pdd-sync.sh
```

This runs `pdd --local sync` for each prompt and then the test suite. The
`--local` flag matches this repository's setup (Codex subscription route, no
API key — see `.pddrc` and PDD's setup summary).

To change behaviour: **edit the prompt, re-run the script.** If you find
yourself editing a file under `pdd/`, stop — the change belongs in
`prompts/`.

---

## What is *not* PDD-generated, and why

`app/` and `static/` are hand-written and hand-reviewed. Per the field guide,
PDD is a strong fit for "work with clear behavioural outcomes, repeatable
tests, and modules that will evolve", and a weaker fit for glue, wiring and
framework scaffolding.

So we drew the line at consequence: the two decisions that carry real weight —
**who pays** and **what ships** — are prompt-owned, tested, and regenerable.
The HTTP plumbing around them is ordinary application code, and we say so
rather than dressing it up as a PDD artifact.
