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

## Artifact chain 3 — `role_policy`

*Which role in a room holds which power.*

| Link | File |
|---|---|
| **Prompt** | [`prompts/role_policy_python.prompt`](prompts/role_policy_python.prompt) |
| **Generated module** | `pdd/role_policy.py` |
| **Where it is used** | [`app/main.py`](app/main.py) → `_require()` guards run / steer / halt / edit_intent / vote / open_pr; `_quorum()` uses `voters()` to decide the electorate |
| **Test** | [`tests/test_role_policy.py`](tests/test_role_policy.py) — 35 cases, plus 9 end-to-end |

The failure mode is granting power nobody meant to grant, so the prompt makes
unknown roles fall back to `observer` — a typo fails closed. A role without the
`vote` power never appears in `waiting_on`, which is what stops one observer
from stalling every proposal in the room forever.

---

## Artifact chain 4 — `path_sandbox`

*Whether the agent is allowed to read a path at all.*

| Link | File |
|---|---|
| **Prompt** | [`prompts/path_sandbox_python.prompt`](prompts/path_sandbox_python.prompt) |
| **Generated module** | `pdd/path_sandbox.py` |
| **Where it is used** | [`app/repo_reader.py`](app/repo_reader.py) → `_resolve()`, the single choke point for every file the agent reads |
| **Test** | [`tests/test_path_sandbox.py`](tests/test_path_sandbox.py) — 34 cases, almost all of them attacks |

This is the boundary between *the agent can read your repository* and *the agent
can read your laptop*, so its forbidden outcomes are stated before its happy
path: traversal, absolute paths outside the root, symlinks that land outside,
`~` expansion, null bytes, and the subtle one — a shared string prefix is not
containment, so `/home/app/repo-secrets` is outside `/home/app/repo`.

### The second documented iteration — a real security hole

**What we observed.** The first generation passed 31 of 33 cases and failed
exactly two:

```
FAILED test_escape_is_refused[~/.ssh/id_rsa]     - DID NOT RAISE SandboxViolation
FAILED test_escape_is_refused[~root/.ssh/id_rsa] - DID NOT RAISE SandboxViolation
```

**Why the prompt was at fault.** v1 said *"MUST NOT accept `~` or `~user`
expansion."* The module obeyed it literally: it did not expand `~`, it treated
it as an ordinary directory name, joined it onto the root, landed at
`/repo/~/.ssh/id_rsa` — inside the sandbox — and allowed it. The artifact was
faithful to the words. The words were wrong.

**What we did not do.** Add a `startswith("~")` check to
`pdd/path_sandbox.py`. That would have papered over an ambiguous specification
and lost the fix on the next regeneration.

**What we did.** Rewrote the rule to say what we actually meant:

```diff
- - MUST NOT accept `~` or `~user` expansion.
+ - MUST NOT accept a candidate whose first path component begins with `~`
+   (`~/.ssh/id_rsa`, `~root/.ssh/id_rsa`). REJECT it outright with
+   `SandboxViolation`. Do not expand it, and do not fall back to treating it as
+   an ordinary relative name -- joining `~/.ssh/id_rsa` onto the root lands
+   inside the sandbox and silently allows a path the caller clearly did not
+   intend as a literal directory named `~`.
```

**Result after regeneration:** `34 passed`.

The lesson is the one PDD is built on: the artifact was not buggy, the *intent*
was underspecified. Patching the artifact would have hidden that.

---

## What generation actually cost

Real numbers from this build, not estimates:

| Module | Model | Cost | Time |
|---|---|---|---|
| `token_split` | `gemini/gemini-3.5-flash` | $0.0955 | 52s |
| `approval_quorum` | `gemini/gemini-3.5-flash` | $0.0593 | 29s |
| `role_policy` | `gemini/gemini-3.5-flash` | $0.0893 | 42s |
| `path_sandbox` v1 | `gemini/gemini-3-flash-preview` | $0.0116 | 30s |
| `path_sandbox` v2 | `gemini/gemini-3-flash-preview` | $0.0312 | 28s |

**Total: about $0.29** for four modules and one corrective regeneration, billed
to a Google Gemini key on the `--local` route. The point of the table is the
last row: fixing a security hole *at the source and regenerating* cost three
cents, which is the argument for not hand-patching artifacts.

`--skip-tests` is passed deliberately. `.pddrc` points `test_output_path` at
`tests/`, and those files are hand-written acceptance criteria — what the room
agreed the behaviour must be. Letting PDD regenerate them would let the artifact
grade its own homework.

---

## How to regenerate

```bash
./scripts/pdd-sync.sh
```

This runs `pdd --local sync --no-steer --skip-tests` for each prompt, then the
test suite. `pdd sync` takes a BASENAME, not a path: `pdd sync token_split`
resolves `prompts/token_split_python.prompt` via `.pddrc`. The
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

So we drew the line at consequence. Four decisions carry real weight — **who
pays**, **who decides**, **what ships**, and **what the agent may read** — and
all four are prompt-owned, tested, and regenerable.
The HTTP plumbing around them is ordinary application code, and we say so
rather than dressing it up as a PDD artifact.
