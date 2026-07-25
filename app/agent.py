"""The shared agent loop.

One agent, many directors. Two properties make this different from a group
chat with a bot attached:

1. Prompts never interrupt a run. While the agent is working, everything the
   room types lands in the steering queue, and the agent consumes it between
   steps -- so a teammate who sees it going wrong at second 20 does not have
   to wait three minutes to say so.

2. The agent cannot write to the repository. It reads, it searches, and it
   proposes. Turning a proposal into a pull request is the room's decision,
   gated by pdd.approval_quorum.
"""

import asyncio
import json

import httpx

from . import hub, keys, memory, providers, repo_reader, state

ANTHROPIC_VERSION = "2023-06-01"
MAX_STEPS = 10
FLUSH_INTERVAL = 0.06        # seconds between token broadcasts
HALT_CHECK_EVERY = 40        # deltas between mid-stream halt checks

SYSTEM_PROMPT = """\
You are Ensemble, the shared agent for a team room. Several people direct you
at the same time, each in a declared role.

Rules of the room:
- The Intent document is the source of truth. Chat steers; Intent decides.
- When two roles conflict, defer to whichever role OWNS that decision.
- If a conflict is genuine and you cannot resolve it from the Intent, call
  ask_room. Never silently pick a side.
- You have READ-ONLY access to the codebase. You cannot write files, run
  commands, or touch git. To change anything, call propose_patch and let the
  room approve it.
- Messages tagged [STEER from ...] arrive mid-run. Treat them as corrections
  to your current direction and acknowledge what changed.
- Prefer one small, reviewable, well-scoped patch over a sprawling one.
"""

TOOLS = [
    {
        "name": "list_files",
        "description": "List text files in the repository, optionally under a subdirectory.",
        "input_schema": {
            "type": "object",
            "properties": {"subdir": {"type": "string"}},
        },
    },
    {
        "name": "read_file",
        "description": "Read one file from the repository. Read-only.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "search",
        "description": "Case-insensitive substring search across the repository.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "ask_room",
        "description": (
            "Ask the whole room a product decision you must not invent. "
            "Blocks the run until a participant answers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["question"],
        },
    },
    {
        "name": "log_decision",
        "description": (
            "Record a decision the room reached, so later runs in this room "
            "remember it without anyone re-typing it."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "decision": {"type": "string"},
                "rationale": {"type": "string"},
            },
            "required": ["decision"],
        },
    },
    {
        "name": "propose_patch",
        "description": (
            "Propose a change for the room to approve. This does NOT write to "
            "the repository. Provide the complete new content of each file."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "rationale": {"type": "string"},
                "files": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "new_content": {"type": "string"},
                        },
                        "required": ["path", "new_content"],
                    },
                },
            },
            "required": ["title", "files"],
        },
    },
]


# --------------------------------------------------------------------------
# context
# --------------------------------------------------------------------------

def build_messages(room: state.Room, run_id: str) -> list[dict]:
    lines = []
    if room.intent.strip():
        lines.append(f"# Shared Intent (the room's source of truth)\n\n{room.intent.strip()}")
    else:
        lines.append("# Shared Intent\n\n(empty -- the room has not written one yet)")

    roster = ", ".join(
        f"{p.name} ({p.role.upper()} -- {state.ROLE_LENS[p.role]})"
        for p in room.participants.values()
    )
    lines.append(f"\n# Who is in the room\n\n{roster or '(nobody)'}")

    remembered = memory.recall(room.id, room.intent[:200])
    if remembered:
        lines.append("\n# What this room already decided\n\n"
                     + "\n".join(f"- {r}" for r in remembered))

    convo = [m for m in room.messages
             if m.kind in ("prompt", "steer", "agent", "question", "answer")][-40:]
    if convo:
        lines.append("\n# Room conversation\n")
        for m in convo:
            if m.kind == "agent":
                lines.append(f"[Ensemble]: {m.content}")
            elif m.kind == "question":
                lines.append(f"[Ensemble asked]: {m.content}")
            else:
                tag = "STEER" if m.kind == "steer" else m.kind.upper()
                lines.append(f"[{tag} from {m.author_name} ({m.role.upper()})]: {m.content}")

    return [{"role": "user", "content": "\n".join(lines)}]


# --------------------------------------------------------------------------
# tools
# --------------------------------------------------------------------------

async def _run_tool(room: state.Room, run_id: str, name: str, args: dict) -> tuple[str, bool]:
    """Execute one tool. Returns (result_text, should_stop)."""
    try:
        if name == "list_files":
            files = repo_reader.list_files(args.get("subdir", "") or "")
            return json.dumps(files), False

        if name == "read_file":
            return repo_reader.read_file(args["path"]), False

        if name == "search":
            return json.dumps(repo_reader.search(args["query"])), False

        if name == "ask_room":
            return await _ask_room(room, run_id, args), False

        if name == "log_decision":
            memory.record_decision(room.id, args["decision"],
                                   args.get("rationale", ""), by="Ensemble")
            hub.publish(room.id, "decision", {
                "decision": args["decision"],
                "rationale": args.get("rationale", ""),
            })
            return "Decision recorded in room memory.", False

        if name == "propose_patch":
            return _propose_patch(room, run_id, args), True

        return f"unknown tool: {name}", False

    except repo_reader.ReadOnlyViolation as exc:
        return f"REFUSED (read-only sandbox): {exc}", False
    except FileNotFoundError as exc:
        return f"file not found: {exc}", False
    except Exception as exc:                     # noqa: BLE001 - surface to model
        return f"{type(exc).__name__}: {exc}", False


async def _ask_room(room: state.Room, run_id: str, args: dict) -> str:
    question = args["question"]
    options = args.get("options") or []
    room.state = state.AWAITING_INPUT
    msg = room.add_message("question", "Ensemble", "agent", question, run_id=run_id)
    hub.publish(room.id, "question", {
        "run_id": run_id, "question": question,
        "options": options, "message_id": msg.id,
    })
    hub.publish(room.id, "state", {"state": room.state})

    for _ in range(90):                          # ~3 minutes
        await asyncio.sleep(2)
        answers = [m for m in room.messages
                   if m.run_id == run_id and m.kind == "answer" and m.id > msg.id]
        if answers:
            a = answers[-1]
            room.state = state.RUNNING
            hub.publish(room.id, "state", {"state": room.state})
            return f"{a.author_name} ({a.role.upper()}) answered: {a.content}"
        if room.has_pending_halt(run_id):
            return "The room halted the run while you were waiting."

    room.state = state.RUNNING
    hub.publish(room.id, "state", {"state": room.state})
    return "No answer within the timeout. Use your best judgment and state the assumption."


def _propose_patch(room: state.Room, run_id: str, args: dict) -> str:
    files = []
    for f in args.get("files", []):
        path, new_content = f["path"], f["new_content"]
        files.append({
            "path": path,
            "new_content": new_content,
            "diff": repo_reader.unified_diff(path, new_content),
        })

    proposal = state.new_proposal(
        room, run_id, args["title"], args.get("rationale", ""), files
    )
    room.state = state.PROPOSED
    hub.publish(room.id, "proposal", state._proposal_view(proposal))
    hub.publish(room.id, "state", {"state": room.state})
    return (
        f"Proposal {proposal.id} created with {len(files)} file(s). "
        "It is NOT applied. The room must approve it before it can become a PR."
    )


# --------------------------------------------------------------------------
# the loop
# --------------------------------------------------------------------------

async def run_agent(room: state.Room, run_id: str, model: str | None = None) -> None:
    run = room.runs[run_id]
    entry = keys.pick_billing_key(room.id, run.started_by)
    if entry is None:
        run.status = "error"
        room.state = state.IDLE
        hub.publish(room.id, "error", {
            "message": "No API key loaded. Each participant brings their own key -- "
                       "add one to start a run.",
        })
        hub.publish(room.id, "state", {"state": room.state})
        return

    provider = entry.get("provider", providers.DEFAULT_PROVIDER)
    endpoint = providers.endpoint(provider)
    model = model or providers.default_model(provider)
    hub.publish(room.id, "provider", {
        "run_id": run_id,
        "provider": providers.resolve(provider)["label"],
        "model": model,
    })

    messages = build_messages(room, run_id)
    transcript = ""

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            for step in range(MAX_STEPS):

                # -- drain the steering queue between steps -----------------
                pending = room.pending_steers(run_id)
                if pending:
                    for s in pending:
                        s.consumed = True
                    if any(s.kind == "halt" for s in pending):
                        halter = next(s for s in pending if s.kind == "halt")
                        run.status = "halted"
                        room.state = state.IDLE
                        hub.publish(room.id, "halted", {"by": halter.author_name})
                        hub.publish(room.id, "state", {"state": room.state})
                        return
                    nudges = "\n".join(
                        f"[STEER from {s.author_name} ({s.role.upper()})]: {s.content}"
                        for s in pending
                    )
                    messages.append({"role": "user", "content": nudges})
                    hub.publish(room.id, "steer_applied", {
                        "run_id": run_id,
                        "steers": [{"author": s.author_name, "role": s.role,
                                    "content": s.content} for s in pending],
                    })

                run.steps.append({"step": step, "label": "thinking"})
                hub.publish(room.id, "step", {"run_id": run_id, "step": step,
                                              "label": "thinking"})

                text, tool_calls, halted = await _stream_step(
                    client, entry["key"], endpoint, model, messages, room, run
                )
                if halted:
                    run.status = "halted"
                    room.state = state.IDLE
                    hub.publish(room.id, "halted", {"by": "the room"})
                    hub.publish(room.id, "state", {"state": room.state})
                    return

                transcript += text
                assistant_content = []
                if text.strip():
                    assistant_content.append({"type": "text", "text": text})
                for call in tool_calls:
                    assistant_content.append({
                        "type": "tool_use", "id": call["id"],
                        "name": call["name"], "input": call["input"],
                    })
                if assistant_content:
                    messages.append({"role": "assistant", "content": assistant_content})

                if not tool_calls:
                    break

                results, stop = [], False
                for call in tool_calls:
                    hub.publish(room.id, "tool", {"run_id": run_id,
                                                  "name": call["name"]})
                    out, should_stop = await _run_tool(
                        room, run_id, call["name"], call["input"]
                    )
                    stop = stop or should_stop
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": call["id"],
                        "content": out[:100_000],
                    })
                messages.append({"role": "user", "content": results})
                if stop:
                    break

        run.status = "done"
        if transcript.strip():
            room.add_message("agent", "Ensemble", "agent", transcript.strip(),
                             run_id=run_id)

    except httpx.HTTPStatusError as exc:
        run.status = "error"
        hub.publish(room.id, "error", {
            "message": f"Model provider returned {exc.response.status_code}. "
                       "Check the API key that was loaded.",
        })
    except Exception as exc:                     # noqa: BLE001
        run.status = "error"
        hub.publish(room.id, "error", {"message": f"{type(exc).__name__}: {exc}"})

    finally:
        _settle_ledger(room, run_id)
        if room.state != state.PROPOSED:
            room.state = state.IDLE
        hub.publish(room.id, "state", {"state": room.state})
        hub.publish(room.id, "done", {
            "run_id": run_id, "status": run.status,
            "input_tokens": run.input_tokens, "output_tokens": run.output_tokens,
        })


async def _stream_step(client, api_key, endpoint, model, messages, room, run):
    """One model turn, rebroadcast token by token. Returns (text, calls, halted)."""
    body = {
        "model": model,
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        "tools": TOOLS,
        "messages": messages,
        "stream": True,
    }
    headers = {
        # Anthropic authenticates with x-api-key; routers fronting the same
        # Messages API generally accept a bearer token. Sending both keeps one
        # streaming implementation working against either.
        "x-api-key": api_key,
        "authorization": f"Bearer {api_key}",
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    }

    text_parts: list[str] = []
    blocks: dict[int, dict] = {}
    buf, last_flush, deltas = "", 0.0, 0

    def flush(force=False):
        nonlocal buf, last_flush
        now = asyncio.get_event_loop().time()
        if not buf or (not force and now - last_flush < FLUSH_INTERVAL):
            return
        hub.publish(room.id, "token", {"run_id": run.id, "chunk": buf})
        buf, last_flush = "", now

    async with client.stream("POST", endpoint, json=body, headers=headers) as resp:
        if resp.status_code >= 400:
            detail = (await resp.aread()).decode("utf-8", "replace")[:400]
            raise httpx.HTTPStatusError(detail, request=resp.request, response=resp)

        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            try:
                ev = json.loads(line[6:])
            except json.JSONDecodeError:
                continue

            etype = ev.get("type")

            if etype == "message_start":
                usage = ev.get("message", {}).get("usage", {})
                run.input_tokens += usage.get("input_tokens", 0)

            elif etype == "content_block_start":
                blocks[ev["index"]] = {"block": ev["content_block"], "json": ""}

            elif etype == "content_block_delta":
                delta = ev.get("delta", {})
                if delta.get("type") == "text_delta":
                    chunk = delta["text"]
                    text_parts.append(chunk)
                    buf += chunk
                    flush()
                    deltas += 1
                    if deltas % HALT_CHECK_EVERY == 0 and room.has_pending_halt(run.id):
                        flush(force=True)
                        return "".join(text_parts), [], True
                elif delta.get("type") == "input_json_delta":
                    blocks[ev["index"]]["json"] += delta["partial_json"]

            elif etype == "message_delta":
                run.output_tokens += ev.get("usage", {}).get("output_tokens", 0)

    flush(force=True)

    calls = []
    for b in blocks.values():
        if b["block"].get("type") == "tool_use":
            try:
                parsed = json.loads(b["json"]) if b["json"].strip() else {}
            except json.JSONDecodeError:
                parsed = {}
            calls.append({"id": b["block"]["id"], "name": b["block"]["name"],
                          "input": parsed})

    return "".join(text_parts), calls, False


def _settle_ledger(room: state.Room, run_id: str) -> None:
    """Charge the run back to whoever steered it, using the PDD module."""
    run = room.runs.get(run_id)
    if run is None or run.total_tokens == 0:
        return
    try:
        from pdd.token_split import split_tokens
    except ImportError:
        hub.publish(room.id, "ledger_unavailable", {
            "message": "pdd/token_split.py has not been generated yet -- "
                       "run scripts/pdd-sync.sh",
        })
        return

    share = split_tokens(run.total_tokens, room.contributions_for(run_id))
    for uid, tokens in share.items():
        room.ledger[uid] = room.ledger.get(uid, 0) + tokens
    hub.publish(room.id, "ledger", {
        "run_id": run_id, "run_total": run.total_tokens,
        "run_split": share, "ledger": room.ledger,
    })
