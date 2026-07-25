"""CoPrompt -- HTTP surface for the shared room."""

import asyncio
import os
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import agent, github_pr, hub, keys, memory, providers, seed, state

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="CoPrompt", docs_url="/api/docs")


def _room(room_id: str) -> state.Room:
    return state.get_or_create_room(room_id)


def _participant(room: state.Room, user_id: str) -> state.Participant:
    p = room.participants.get(user_id)
    if p is None:
        raise HTTPException(404, "You are not in this room. Rejoin.")
    return p


def _role_policy():
    try:
        from pdd import role_policy
    except ImportError as exc:
        raise HTTPException(503, {
            "error": "pdd/role_policy.py has not been generated yet.",
            "fix": "Run scripts/pdd-sync.sh to generate it from its prompt.",
        }) from exc
    return role_policy


def _require(room: state.Room, p: state.Participant, power: str) -> None:
    """Refuse an action the participant's role does not hold.

    Enforced here rather than by hiding a button, so a role without a power
    cannot exercise it by calling the API directly.
    """
    rp = _role_policy()
    if not rp.can(p.role, power, room.role_overrides):
        raise HTTPException(403, f"{p.role.upper()} cannot {power} in this room")


def _quorum(room: state.Room, proposal: state.Proposal) -> dict:
    """Evaluate the approval gate via the PDD-generated modules.

    role_policy decides WHO holds a vote; approval_quorum decides whether the
    votes cast are enough. Roles without the vote power are never counted as
    "waiting on", so an observer in the room cannot stall a proposal forever.
    """
    try:
        from pdd.approval_quorum import evaluate
    except ImportError as exc:
        raise HTTPException(503, {
            "error": "pdd/approval_quorum.py has not been generated yet.",
            "fix": "Run scripts/pdd-sync.sh to generate it from its prompt.",
        }) from exc

    rp = _role_policy()
    electorate = rp.voters(
        [{"user_id": u, "role": pt.role} for u, pt in room.participants.items()],
        room.role_overrides,
    )
    return evaluate(electorate, proposal.votes, room.policy)


# --------------------------------------------------------------------------
# room membership
# --------------------------------------------------------------------------

@app.post("/api/rooms/{room_id}/join")
async def join(room_id: str, body: dict = Body(...)):
    room = _room(room_id)
    name = (body.get("name") or "").strip()[:40]
    role = body.get("role", "eng")
    if not name:
        raise HTTPException(400, "name is required")
    try:
        p = state.join(room, name, role)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    room.add_message("system", name, role, f"{name} joined as {role.upper()}")
    hub.publish(room_id, "presence", {"participants": [vars(x) for x
                                                       in room.participants.values()]})
    return {"user_id": p.user_id, "color": p.color, "room": state.snapshot(room)}


@app.post("/api/rooms/{room_id}/leave")
async def leave(room_id: str, body: dict = Body(...)):
    room = _room(room_id)
    uid = body.get("user_id", "")
    room.participants.pop(uid, None)
    keys.drop(room_id, uid)
    hub.publish(room_id, "presence", {"participants": [vars(x) for x
                                                       in room.participants.values()]})
    return {"ok": True}


@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    return state.snapshot(_room(room_id))


@app.get("/api/rooms/{room_id}/events")
async def events(room_id: str, request: Request):
    """SSE channel. Everyone in the room sees the same stream."""
    _room(room_id)
    q = hub.subscribe(room_id)

    async def gen():
        try:
            yield "retry: 2000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    frame = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield frame
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            hub.unsubscribe(room_id, q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


# --------------------------------------------------------------------------
# bring-your-own key
# --------------------------------------------------------------------------

@app.post("/api/rooms/{room_id}/key")
async def put_key(room_id: str, body: dict = Body(...)):
    """Accept a participant's own API key.

    Held in process memory only. Never persisted, never logged, never returned
    to any client -- only a truncated fingerprint goes back, to the owner.
    """
    room = _room(room_id)
    uid = body.get("user_id", "")
    p = _participant(room, uid)
    try:
        keys.put(room_id, uid, body.get("key", ""), body.get("provider", "anthropic"))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    p.has_key = True
    hub.publish(room_id, "presence", {"participants": [vars(x) for x
                                                       in room.participants.values()]})
    return {"ok": True, "fingerprint": keys.fingerprint(room_id, uid)}


@app.delete("/api/rooms/{room_id}/key")
async def delete_key(room_id: str, user_id: str):
    room = _room(room_id)
    keys.drop(room_id, user_id)
    if user_id in room.participants:
        room.participants[user_id].has_key = False
    hub.publish(room_id, "presence", {"participants": [vars(x) for x
                                                       in room.participants.values()]})
    return {"ok": True}


# --------------------------------------------------------------------------
# shared intent
# --------------------------------------------------------------------------

@app.put("/api/rooms/{room_id}/intent")
async def set_intent(room_id: str, body: dict = Body(...)):
    room = _room(room_id)
    uid = body.get("user_id", "")
    _participant(room, uid)
    if room.intent_locked_by and room.intent_locked_by != uid:
        holder = room.participants.get(room.intent_locked_by)
        raise HTTPException(409, f"Intent is being edited by "
                                 f"{holder.name if holder else 'someone else'}")
    _require(room, _participant(room, uid), "edit_intent")
    room.intent = body.get("intent", "")
    hub.publish(room_id, "intent", {"intent": room.intent, "by": uid})
    return {"ok": True}


@app.post("/api/rooms/{room_id}/intent/lock")
async def lock_intent(room_id: str, body: dict = Body(...)):
    room = _room(room_id)
    uid = body.get("user_id", "")
    _participant(room, uid)
    if body.get("release"):
        if room.intent_locked_by == uid:
            room.intent_locked_by = None
    elif room.intent_locked_by in (None, uid):
        room.intent_locked_by = uid
    else:
        raise HTTPException(409, "Someone else holds the intent lock")
    hub.publish(room_id, "intent_lock", {"locked_by": room.intent_locked_by})
    return {"locked_by": room.intent_locked_by}


# --------------------------------------------------------------------------
# prompts, runs, steering
# --------------------------------------------------------------------------

@app.post("/api/rooms/{room_id}/message")
async def post_message(room_id: str, body: dict = Body(...)):
    """One entry point for everything a participant types.

    What it becomes depends on the room's state, not on which button was
    pressed: IDLE -> prompt, RUNNING -> steer, AWAITING_INPUT -> answer.
    """
    room = _room(room_id)
    uid = body.get("user_id", "")
    p = _participant(room, uid)
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "content is required")

    if room.state == state.RUNNING and room.active_run_id:
        _require(room, p, "steer")
        s = state.Steer(id=state._uid(), run_id=room.active_run_id, author_id=uid,
                        author_name=p.name, role=p.role,
                        kind=body.get("kind", "nudge"), content=content)
        room.steers.append(s)
        m = room.add_message("steer", p.name, p.role, content,
                             author_id=uid, run_id=room.active_run_id)
        hub.publish(room_id, "message", vars(m))
        hub.publish(room_id, "steer_queued", {
            "author": p.name, "role": p.role, "kind": s.kind, "content": content,
        })
        return {"queued_as": s.kind}

    kind = "answer" if room.state == state.AWAITING_INPUT else "prompt"
    m = room.add_message(kind, p.name, p.role, content,
                         author_id=uid, run_id=room.active_run_id)
    hub.publish(room_id, "message", vars(m))
    return {"queued_as": kind}


@app.post("/api/rooms/{room_id}/run")
async def start_run(room_id: str, body: dict = Body(...)):
    room = _room(room_id)
    uid = body.get("user_id", "")
    p = _participant(room, uid)

    _require(room, p, "run")

    # Whoever gets here first wins; everyone else is told who started it.
    if room.state != state.IDLE:
        starter = room.runs.get(room.active_run_id or "")
        who = room.participants.get(starter.started_by) if starter else None
        raise HTTPException(409, f"Room is {room.state}"
                                 + (f" -- {who.name} started a run" if who else ""))

    if not keys.holders(room_id) and not keys.has_fallback():
        raise HTTPException(400, "No API key loaded in this room. "
                                 "Each participant brings their own.")

    run = state.new_run(room, uid)
    room.state = state.RUNNING
    room.add_message("system", p.name, p.role, f"{p.name} started a run",
                     author_id=uid, run_id=run.id)
    hub.publish(room_id, "run_started", {"run_id": run.id, "by": p.name})
    hub.publish(room_id, "state", {"state": room.state})

    asyncio.create_task(agent.run_agent(room, run.id))
    return {"run_id": run.id}


@app.post("/api/rooms/{room_id}/halt")
async def halt(room_id: str, body: dict = Body(...)):
    room = _room(room_id)
    uid = body.get("user_id", "")
    p = _participant(room, uid)
    _require(room, p, "halt")
    if not room.active_run_id or room.state != state.RUNNING:
        raise HTTPException(409, "Nothing is running")
    room.steers.append(state.Steer(
        id=state._uid(), run_id=room.active_run_id, author_id=uid,
        author_name=p.name, role=p.role, kind="halt", content="halt requested",
    ))
    return {"ok": True}


# --------------------------------------------------------------------------
# proposals and the approval gate
# --------------------------------------------------------------------------

@app.post("/api/rooms/{room_id}/proposals/{proposal_id}/vote")
async def vote(room_id: str, proposal_id: str, body: dict = Body(...)):
    room = _room(room_id)
    uid = body.get("user_id", "")
    p = _participant(room, uid)
    proposal = room.proposals.get(proposal_id)
    if proposal is None:
        raise HTTPException(404, "No such proposal")
    if proposal.status != "pending":
        raise HTTPException(409, f"Proposal is already {proposal.status}")

    _require(room, p, "vote")
    verdict = body.get("verdict")
    if verdict not in ("approve", "request_changes"):
        raise HTTPException(400, "verdict must be approve or request_changes")

    # Append-only log; approval_quorum takes each participant's last vote.
    proposal.votes.append({"user_id": uid, "verdict": verdict})
    q = _quorum(room, proposal)

    hub.publish(room_id, "vote", {
        "proposal_id": proposal_id, "by": p.name, "role": p.role,
        "verdict": verdict, "quorum": q,
    })
    if verdict == "request_changes":
        room.state = state.IDLE
        hub.publish(room_id, "state", {"state": room.state})
    return q


@app.get("/api/rooms/{room_id}/proposals/{proposal_id}/quorum")
async def get_quorum(room_id: str, proposal_id: str):
    room = _room(room_id)
    proposal = room.proposals.get(proposal_id)
    if proposal is None:
        raise HTTPException(404, "No such proposal")
    return _quorum(room, proposal)


@app.post("/api/rooms/{room_id}/proposals/{proposal_id}/pr")
async def open_pr(room_id: str, proposal_id: str, body: dict = Body(...)):
    """The only write path in the project, and the gate is checked here --
    not in the browser."""
    room = _room(room_id)
    _require(room, _participant(room, body.get("user_id", "")), "open_pr")
    proposal = room.proposals.get(proposal_id)
    if proposal is None:
        raise HTTPException(404, "No such proposal")
    if proposal.status == "merged":
        return {"pr_url": proposal.pr_url}

    q = _quorum(room, proposal)
    if not q["can_open_pr"]:
        raise HTTPException(409, {"error": "Room has not approved this proposal",
                                  "quorum": q})

    try:
        url = await github_pr.open_pull_request(proposal, room, q)
    except github_pr.GitHubNotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(502, f"GitHub rejected the request: {exc}") from exc

    proposal.status = "merged"
    proposal.pr_url = url
    room.state = state.IDLE
    hub.publish(room_id, "pr_opened", {"proposal_id": proposal_id, "pr_url": url})
    hub.publish(room_id, "state", {"state": room.state})
    return {"pr_url": url}


# --------------------------------------------------------------------------
# health + static
# --------------------------------------------------------------------------

@app.post("/api/rooms/{room_id}/demo-proposal")
async def create_demo_proposal(room_id: str):
    """Drop a ready-made proposal into the room for rehearsing the vote flow.

    Lets the team practise the approval choreography without spending tokens
    on a real run. Off unless ALLOW_DEMO_SEED=1, so it cannot be triggered
    against a live room by accident.
    """
    if os.environ.get("ALLOW_DEMO_SEED", "0") != "1":
        raise HTTPException(404, "Not enabled. Set ALLOW_DEMO_SEED=1.")
    room = _room(room_id)
    proposal = seed.demo_proposal(room)
    hub.publish(room_id, "proposal", state._proposal_view(proposal))
    hub.publish(room_id, "state", {"state": room.state})
    return {"proposal_id": proposal.id}


@app.get("/api/rooms/{room_id}/roles")
async def get_roles(room_id: str):
    """The effective powers of every role in this room."""
    room = _room(room_id)
    rp = _role_policy()
    return {
        "powers": list(rp.POWERS),
        "overrides": room.role_overrides,
        "effective": {r: rp.resolve(r, room.role_overrides) for r in state.ROLES},
        "lenses": state.ROLE_LENS,
    }


@app.put("/api/rooms/{room_id}/roles")
async def set_roles(room_id: str, body: dict = Body(...)):
    """Change what a role may do.

    Any participant who can edit the Intent can also shape the room's rules --
    this is a team tool, not an admin console. The change is broadcast so
    everyone sees the rules shift under them rather than discovering it when a
    button stops working.
    """
    room = _room(room_id)
    uid = body.get("user_id", "")
    p = _participant(room, uid)
    _require(room, p, "edit_intent")

    rp = _role_policy()
    incoming = body.get("overrides") or {}
    if not isinstance(incoming, dict):
        raise HTTPException(400, "overrides must be an object")

    clean: dict = {}
    for role, patch in incoming.items():
        if role not in state.ROLES or not isinstance(patch, dict):
            continue
        entry = {k: bool(v) for k, v in patch.items() if k in rp.POWERS}
        if "priority" in patch:
            try:
                entry["priority"] = int(patch["priority"])
            except (TypeError, ValueError):
                raise HTTPException(400, "priority must be an integer") from None
        if entry:
            clean[role] = entry

    room.role_overrides = clean
    effective = {r: rp.resolve(r, clean) for r in state.ROLES}
    hub.publish(room_id, "roles", {"overrides": clean, "effective": effective,
                                   "by": p.name})
    room.add_message("system", p.name, p.role,
                     f"{p.name} changed the room's role powers")
    return {"overrides": clean, "effective": effective}


@app.get("/api/providers")
async def list_providers():
    """Which vendors a participant may bring a key for. Never returns keys."""
    return {"providers": providers.public_catalog()}


@app.get("/api/rooms/{room_id}/memory")
async def room_memory(room_id: str):
    return {
        "backend": "mem0" if memory.enabled() else "in-process",
        "decisions": memory.local_decisions(room_id),
        "recalled": memory.recall(room_id),
    }


@app.get("/api/health")
async def health():
    generated = {}
    for mod in ("token_split", "approval_quorum", "role_policy",
                "path_sandbox"):
        try:
            __import__(f"pdd.{mod}")
            generated[mod] = "generated"
        except ImportError:
            generated[mod] = "missing -- run scripts/pdd-sync.sh"
    return {
        "ok": True,
        "rooms": len(state.ROOMS),
        "pdd_modules": generated,
        "github_configured": bool(os.environ.get("GITHUB_TOKEN")
                                  and os.environ.get("GITHUB_REPO")),
        "memory_backend": "mem0" if memory.enabled() else "in-process",
        "fallback_key": "configured" if keys.has_fallback() else "none",
        "providers": [p["id"] for p in providers.public_catalog()],
    }


if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    async def index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/r/{room_id}")
    async def room_page(room_id: str):
        return FileResponse(STATIC_DIR / "index.html")
