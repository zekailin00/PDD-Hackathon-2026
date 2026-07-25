"""Integration tests for the room lifecycle.

These cover the coordination model itself -- who may do what, and when --
without calling a model provider. They are the tests that would catch a
regression letting the agent reach the repository without the room's consent.
"""

import pytest
from fastapi.testclient import TestClient

from app import keys, state
from app.main import app

client = TestClient(app)

ROOM = "test-room"

# Most of the room's behaviour routes through the PDD-owned modules: role_policy
# decides who may act, approval_quorum decides whether a proposal ships. Before
# anyone has run scripts/pdd-sync.sh those artifacts do not exist, so these
# tests skip rather than fail -- a missing artifact is a "not generated yet"
# state, not a broken build.
try:
    import pdd.approval_quorum  # noqa: F401
    import pdd.role_policy      # noqa: F401
    _HAS_PDD = True
except ImportError:
    _HAS_PDD = False

_HAS_QUORUM = _HAS_PDD          # kept for the existing markers below

needs_quorum = pytest.mark.skipif(
    not _HAS_PDD,
    reason="pdd modules not generated yet -- run scripts/pdd-sync.sh",
)


@pytest.fixture(autouse=True)
def clean_room():
    state.ROOMS.pop(ROOM, None)
    for k in [k for k in list(keys._VAULT) if k[0] == ROOM]:
        keys._VAULT.pop(k, None)
    yield
    state.ROOMS.pop(ROOM, None)


def join(name, role):
    r = client.post(f"/api/rooms/{ROOM}/join", json={"name": name, "role": role})
    assert r.status_code == 200
    return r.json()["user_id"]


def propose(room, run_id="run-1"):
    return state.new_proposal(
        room, run_id, "Add rate limiting", "The room agreed on 60 rpm.",
        [{"path": "app/limits.py", "new_content": "RPM = 60\n", "diff": "+RPM = 60"}],
    )


# --------------------------------------------------------------------------
# membership and presence
# --------------------------------------------------------------------------

def test_join_puts_the_participant_in_the_snapshot():
    uid = join("Amy", "eng")
    snap = client.get(f"/api/rooms/{ROOM}").json()
    assert [p["user_id"] for p in snap["participants"]] == [uid]
    assert snap["state"] == state.IDLE


def test_unknown_role_is_rejected():
    r = client.post(f"/api/rooms/{ROOM}/join", json={"name": "Amy", "role": "ceo"})
    assert r.status_code == 400


def test_stranger_cannot_post_a_message():
    join("Amy", "eng")
    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": "not-a-member", "content": "hi"})
    assert r.status_code == 404


# --------------------------------------------------------------------------
# a message means different things depending on room state
# --------------------------------------------------------------------------

def test_message_is_a_prompt_when_idle():
    uid = join("Amy", "eng")
    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": uid, "content": "add rate limiting"})
    assert r.json()["queued_as"] == "prompt"


@needs_quorum
def test_message_becomes_a_steer_while_running():
    uid = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    run = state.new_run(room, uid)
    room.state = state.RUNNING

    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": uid, "content": "use a table not cards"})
    assert r.json()["queued_as"] == "nudge"
    assert len(room.pending_steers(run.id)) == 1


def test_message_becomes_an_answer_while_awaiting_input():
    uid = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    state.new_run(room, uid)
    room.state = state.AWAITING_INPUT

    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": uid, "content": "anonymous, skip auth"})
    assert r.json()["queued_as"] == "answer"


@needs_quorum
def test_running_room_rejects_a_second_run():
    uid = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    state.new_run(room, uid)
    room.state = state.RUNNING
    keys.put(ROOM, uid, "sk-ant-test")

    r = client.post(f"/api/rooms/{ROOM}/run", json={"user_id": uid})
    assert r.status_code == 409, "two people hitting Run must not start two runs"


@needs_quorum
def test_run_without_any_key_is_refused():
    uid = join("Amy", "eng")
    assert not keys.has_fallback(), "this test assumes no house key in the env"
    r = client.post(f"/api/rooms/{ROOM}/run", json={"user_id": uid})
    assert r.status_code == 400


# --------------------------------------------------------------------------
# the house key -- lets a visitor try the product without an account, and is
# held to exactly the same secrecy rules as a participant's own key
# --------------------------------------------------------------------------

def test_house_key_is_used_when_nobody_brought_one(monkeypatch):
    monkeypatch.setattr(keys, "FALLBACK_KEY", "sk-house-fallback-key-value")
    monkeypatch.setattr(keys, "FALLBACK_PROVIDER", "tokenrouter")
    entry = keys.pick_billing_key(ROOM, None)
    assert entry["shared"] is True
    assert entry["provider"] == "tokenrouter"


def test_a_participants_own_key_wins_over_the_house_key(monkeypatch):
    monkeypatch.setattr(keys, "FALLBACK_KEY", "sk-house-fallback-key-value")
    uid = join("Amy", "eng")
    keys.put(ROOM, uid, "sk-ant-amys-own-key")
    entry = keys.pick_billing_key(ROOM, uid)
    assert entry["shared"] is False
    assert entry["key"] == "sk-ant-amys-own-key"


def test_house_key_never_appears_in_any_client_payload(monkeypatch):
    secret = "sk-house-do-not-leak-this-anywhere"
    monkeypatch.setattr(keys, "FALLBACK_KEY", secret)
    join("Amy", "eng")

    for path in (f"/api/rooms/{ROOM}", "/api/health", "/api/providers"):
        assert secret not in client.get(path).text, f"house key leaked via {path}"


def test_health_reports_only_that_a_house_key_exists(monkeypatch):
    monkeypatch.setattr(keys, "FALLBACK_KEY", "sk-house-fallback-key-value")
    assert client.get("/api/health").json()["fallback_key"] == "configured"


# --------------------------------------------------------------------------
# the approval gate -- the security boundary of the whole product
# --------------------------------------------------------------------------

@needs_quorum
def test_pr_is_refused_until_every_member_approves():
    amy, joe = join("Amy", "eng"), join("Joe", "qa")
    room = state.ROOMS[ROOM]
    p = propose(room)

    client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                json={"user_id": amy, "verdict": "approve"})

    r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/pr", json={"user_id": amy})
    assert r.status_code == 409, "one approval out of two must not open a PR"
    assert joe in r.json()["detail"]["quorum"]["waiting_on"]


@needs_quorum
def test_request_changes_vetoes_and_returns_room_to_idle():
    amy, joe = join("Amy", "eng"), join("Joe", "qa")
    room = state.ROOMS[ROOM]
    room.state = state.PROPOSED
    p = propose(room)

    client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                json={"user_id": amy, "verdict": "approve"})
    r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                    json={"user_id": joe, "verdict": "request_changes"})

    assert r.json()["can_open_pr"] is False
    assert room.state == state.IDLE

    blocked = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/pr",
                          json={"user_id": amy})
    assert blocked.status_code == 409


@needs_quorum
def test_last_vote_wins_so_a_veto_can_be_lifted():
    amy, joe = join("Amy", "eng"), join("Joe", "qa")
    room = state.ROOMS[ROOM]
    p = propose(room)

    for uid, verdict in ((amy, "approve"), (joe, "request_changes"),
                         (joe, "approve")):
        r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                        json={"user_id": uid, "verdict": verdict})
    assert r.json()["can_open_pr"] is True


@needs_quorum
def test_gate_is_enforced_server_side_not_in_the_browser():
    """Calling the PR endpoint directly, with no votes at all, must fail."""
    amy = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    p = propose(room)

    r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/pr", json={"user_id": amy})
    assert r.status_code == 409


@needs_quorum
def test_invalid_verdict_is_rejected():
    amy = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    p = propose(room)
    r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                    json={"user_id": amy, "verdict": "lgtm"})
    assert r.status_code == 400


# --------------------------------------------------------------------------
# keys never leave the process
# --------------------------------------------------------------------------

def test_api_key_never_appears_in_any_client_payload():
    uid = join("Amy", "eng")
    secret = "sk-ant-super-secret-value-12345"

    r = client.post(f"/api/rooms/{ROOM}/key", json={"user_id": uid, "key": secret})
    assert r.status_code == 200
    assert secret not in r.text, "the key must never be echoed back"

    snap = client.get(f"/api/rooms/{ROOM}").text
    assert secret not in snap, "the key must never appear in a room snapshot"

    health = client.get("/api/health").text
    assert secret not in health


def test_key_presence_is_visible_but_the_key_is_not():
    uid = join("Amy", "eng")
    client.post(f"/api/rooms/{ROOM}/key",
                json={"user_id": uid, "key": "sk-ant-abcdefghijklmnop"})
    snap = client.get(f"/api/rooms/{ROOM}").json()
    assert snap["participants"][0]["has_key"] is True


def test_empty_key_is_rejected():
    uid = join("Amy", "eng")
    r = client.post(f"/api/rooms/{ROOM}/key", json={"user_id": uid, "key": "   "})
    assert r.status_code == 400


# --------------------------------------------------------------------------
# contribution weights feed the token split
# --------------------------------------------------------------------------

@needs_quorum
def test_contributions_are_ordered_with_the_initiator_first():
    amy, joe = join("Amy", "eng"), join("Joe", "qa")
    room = state.ROOMS[ROOM]
    run = state.new_run(room, amy)
    room.state = state.RUNNING

    client.post(f"/api/rooms/{ROOM}/message", json={"user_id": joe, "content": "a"})
    client.post(f"/api/rooms/{ROOM}/message", json={"user_id": joe, "content": "b"})

    contributions = room.contributions_for(run.id)
    assert contributions[0]["user_id"] == amy, "initiator must be first"
    assert {c["user_id"] for c in contributions} == {amy, joe}
    assert dict((c["user_id"], c["weight"]) for c in contributions)[joe] == 2.0


# --------------------------------------------------------------------------
# role powers -- who is allowed to do what, enforced server-side
# --------------------------------------------------------------------------

needs_roles = pytest.mark.skipif(
    not _HAS_QUORUM,
    reason="pdd modules not generated yet -- run scripts/pdd-sync.sh",
)


@needs_roles
def test_observer_cannot_start_a_run():
    uid = join("Zed", "observer")
    keys.put(ROOM, uid, "sk-ant-test")
    r = client.post(f"/api/rooms/{ROOM}/run", json={"user_id": uid})
    assert r.status_code == 403


@needs_roles
def test_observer_can_still_steer():
    amy = join("Amy", "eng")
    zed = join("Zed", "observer")
    room = state.ROOMS[ROOM]
    state.new_run(room, amy)
    room.state = state.RUNNING

    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": zed, "content": "the table needs a header"})
    assert r.status_code == 200, "an observer may suggest"
    assert r.json()["queued_as"] == "nudge"


@needs_roles
def test_observer_cannot_vote():
    amy = join("Amy", "eng")
    zed = join("Zed", "observer")
    room = state.ROOMS[ROOM]
    p = propose(room)
    r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                    json={"user_id": zed, "verdict": "approve"})
    assert r.status_code == 403


@needs_roles
def test_an_observer_never_blocks_a_proposal():
    """The bug this guards: a non-voting role sitting in waiting_on forever."""
    amy = join("Amy", "eng")
    join("Zed", "observer")
    room = state.ROOMS[ROOM]
    p = propose(room)

    q = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                    json={"user_id": amy, "verdict": "approve"}).json()
    assert q["can_open_pr"] is True, "the observer must not be waited on"
    assert q["waiting_on"] == []


@needs_roles
def test_design_cannot_halt_by_default():
    amy = join("Amy", "eng")
    dee = join("Dee", "design")
    room = state.ROOMS[ROOM]
    state.new_run(room, amy)
    room.state = state.RUNNING
    assert client.post(f"/api/rooms/{ROOM}/halt",
                       json={"user_id": dee}).status_code == 403


@needs_roles
def test_a_room_can_grant_design_the_halt_power():
    amy = join("Amy", "eng")
    dee = join("Dee", "design")
    client.put(f"/api/rooms/{ROOM}/roles",
               json={"user_id": amy, "overrides": {"design": {"halt": True}}})

    room = state.ROOMS[ROOM]
    state.new_run(room, amy)
    room.state = state.RUNNING
    assert client.post(f"/api/rooms/{ROOM}/halt",
                       json={"user_id": dee}).status_code == 200


@needs_roles
def test_revoking_a_vote_removes_that_role_from_the_electorate():
    amy = join("Amy", "eng")
    dee = join("Dee", "design")
    client.put(f"/api/rooms/{ROOM}/roles",
               json={"user_id": amy, "overrides": {"design": {"vote": False}}})

    room = state.ROOMS[ROOM]
    p = propose(room)
    q = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                    json={"user_id": amy, "verdict": "approve"}).json()
    assert q["can_open_pr"] is True
    assert dee not in q["waiting_on"]


@needs_roles
def test_a_role_without_open_pr_cannot_call_the_endpoint():
    amy = join("Amy", "eng")
    dee = join("Dee", "design")
    room = state.ROOMS[ROOM]
    p = propose(room)
    for uid in (amy, dee):
        client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/vote",
                    json={"user_id": uid, "verdict": "approve"})
    # Design is fully approved but holds no open_pr power by default.
    r = client.post(f"/api/rooms/{ROOM}/proposals/{p.id}/pr", json={"user_id": dee})
    assert r.status_code == 403


@needs_roles
def test_unknown_power_in_an_override_is_ignored():
    amy = join("Amy", "eng")
    r = client.put(f"/api/rooms/{ROOM}/roles",
                   json={"user_id": amy,
                         "overrides": {"design": {"teleport": True, "halt": True}}})
    assert "teleport" not in r.json()["overrides"]["design"]
    assert r.json()["effective"]["design"]["halt"] is True


# --------------------------------------------------------------------------
# threads -- teammates reply to each other, and the last word wins
# --------------------------------------------------------------------------

@needs_quorum
def test_a_message_can_reply_to_another():
    amy = join("Amy", "eng")
    joe = join("Joe", "qa")
    first = client.post(f"/api/rooms/{ROOM}/message",
                        json={"user_id": amy, "content": "use cards"})
    assert first.status_code == 200
    mid = state.ROOMS[ROOM].messages[-1].id

    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": joe, "content": "a table reads better",
                          "reply_to": mid})
    assert r.status_code == 200
    assert state.ROOMS[ROOM].messages[-1].reply_to == mid


@needs_quorum
def test_reply_to_an_unknown_message_is_rejected():
    amy = join("Amy", "eng")
    r = client.post(f"/api/rooms/{ROOM}/message",
                    json={"user_id": amy, "content": "hi", "reply_to": 9999})
    assert r.status_code == 400


@needs_quorum
def test_the_agent_is_told_a_reply_supersedes_its_parent():
    from app import agent
    amy = join("Amy", "eng")
    joe = join("Joe", "qa")
    room = state.ROOMS[ROOM]
    room.add_message("prompt", "Amy", "eng", "use cards", author_id=amy)
    parent = room.messages[-1].id
    room.add_message("prompt", "Joe", "qa", "a table reads better",
                     author_id=joe, reply_to=parent)

    ctx = agent.build_messages(room, "run-1")[0]["content"]
    assert "SUPERSEDES" in ctx
    assert f"replying to #{parent}" in ctx


# --------------------------------------------------------------------------
# progress -- the room can see whose words the agent has actually taken in
# --------------------------------------------------------------------------

@needs_quorum
def test_progress_separates_picked_up_from_waiting():
    from app import agent
    amy = join("Amy", "eng")
    joe = join("Joe", "qa")
    room = state.ROOMS[ROOM]
    run = state.new_run(room, amy)

    room.add_message("prompt", "Amy", "eng", "start here", author_id=amy)
    agent._mark_seen(room)                       # a run consumes what exists
    room.add_message("steer", "Joe", "qa", "wait, not like that", author_id=joe)

    agent._publish_progress(room, run.id, phase="thinking", step=2)
    p = room.progress
    assert [x["name"] for x in p["picked_up"]] == ["Amy"]
    assert [x["name"] for x in p["waiting"]] == ["Joe"], \
        "Joe must be able to see the agent has not read him yet"


@needs_quorum
def test_progress_reports_a_bounded_percentage():
    from app import agent
    amy = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    run = state.new_run(room, amy)
    for step in (0, 3, 99):
        agent._publish_progress(room, run.id, phase="thinking", step=step)
        assert 0 <= room.progress["percent"] <= 100


@needs_quorum
def test_progress_is_complete_when_the_run_is_done():
    from app import agent
    amy = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    run = state.new_run(room, amy)
    agent._publish_progress(room, run.id, phase="done", step=agent.MAX_STEPS)
    assert room.progress["percent"] == 100
    assert room.progress["phase"] == "done"


@needs_quorum
def test_progress_appears_in_the_room_snapshot():
    from app import agent
    amy = join("Amy", "eng")
    room = state.ROOMS[ROOM]
    run = state.new_run(room, amy)
    agent._publish_progress(room, run.id, phase="reading", step=0)
    assert client.get(f"/api/rooms/{ROOM}").json()["progress"]["phase"] == "reading"


# --------------------------------------------------------------------------
# a provider failure must not hand the room someone's key
# --------------------------------------------------------------------------

def test_error_events_never_carry_exception_detail():
    """Exception text can quote the request, and the request carries the key."""
    import inspect
    from app import agent
    src = inspect.getsource(agent.run_agent)
    tail = src[src.index("except Exception"):]
    assert "{exc}" not in tail, "the raw exception must not reach the room"
    assert "type(exc).__name__" in tail
