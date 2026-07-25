"""Acceptance tests for the role_policy PDD module.

This module decides who holds which power in a room, including who gets a vote
on whether a proposal ships. Its failure mode is granting power that was not
intended, so the forbidden outcomes are tested hardest.
"""

import pytest

rp = pytest.importorskip(
    "pdd.role_policy",
    reason="pdd/role_policy.py not generated yet -- run scripts/pdd-sync.sh",
)


# --------------------------------------------------------------------------
# Forbidden outcomes -- power must never be granted by accident
# --------------------------------------------------------------------------

def test_unknown_role_falls_back_to_observer():
    assert rp.resolve("nonsense") == rp.resolve("observer")


def test_unknown_role_cannot_vote_or_run():
    for role in ("nonsense", "admin", "ceo", "", "PM "):
        p = rp.resolve(role)
        assert p["vote"] is False, f"{role!r} must not get a vote"
        assert p["run"] is False, f"{role!r} must not start runs"
        assert p["open_pr"] is False


def test_observer_cannot_vote():
    assert rp.can("observer", "vote") is False


def test_observer_is_never_waited_on():
    ids = rp.voters([
        {"user_id": "amy", "role": "pm"},
        {"user_id": "zed", "role": "observer"},
        {"user_id": "joe", "role": "qa"},
    ])
    assert ids == ["amy", "joe"]
    assert "zed" not in ids


def test_override_cannot_invent_a_new_power():
    p = rp.resolve("pm", {"pm": {"teleport": True}})
    assert "teleport" not in p


def test_misspelled_power_raises_rather_than_denying_silently():
    with pytest.raises(ValueError):
        rp.can("pm", "teleport")


def test_does_not_mutate_inputs():
    overrides = {"design": {"vote": False}}
    participants = [{"user_id": "amy", "role": "pm"}]
    o_snapshot = {k: dict(v) for k, v in overrides.items()}
    p_snapshot = [dict(x) for x in participants]

    rp.resolve("design", overrides)
    rp.voters(participants, overrides)

    assert overrides == o_snapshot
    assert participants == p_snapshot


# --------------------------------------------------------------------------
# Shape
# --------------------------------------------------------------------------

@pytest.mark.parametrize("role", ["pm", "eng", "design", "qa", "observer"])
def test_resolve_returns_every_power_as_a_bool(role):
    p = rp.resolve(role)
    for power in rp.POWERS:
        assert power in p, f"{role} missing {power}"
        assert isinstance(p[power], bool), f"{role}.{power} is not a bool"
    assert isinstance(p["priority"], int)


# --------------------------------------------------------------------------
# Defaults -- permissive for working roles, restricted for observers
# --------------------------------------------------------------------------

@pytest.mark.parametrize("role", ["pm", "eng", "design", "qa"])
def test_working_roles_can_vote_by_default(role):
    assert rp.can(role, "vote") is True


@pytest.mark.parametrize("role", ["pm", "eng", "design", "qa"])
def test_working_roles_can_steer_by_default(role):
    assert rp.can(role, "steer") is True


def test_design_cannot_halt_by_default():
    assert rp.can("design", "halt") is False


def test_qa_cannot_edit_the_intent_by_default():
    assert rp.can("qa", "edit_intent") is False


def test_observer_can_steer_but_nothing_else_consequential():
    p = rp.resolve("observer")
    assert p["steer"] is True
    assert (p["run"], p["halt"], p["vote"], p["open_pr"]) == (False, False, False, False)


# --------------------------------------------------------------------------
# Overrides merge per power, not per role
# --------------------------------------------------------------------------

def test_override_one_power_leaves_the_others_alone():
    p = rp.resolve("design", {"design": {"vote": False}})
    assert p["vote"] is False
    assert p["steer"] is True, "overriding vote must not clear steer"
    assert p["run"] is True


def test_override_can_grant_a_power():
    assert rp.can("design", "halt", {"design": {"halt": True}}) is True


def test_override_can_revoke_a_power():
    assert rp.can("pm", "open_pr", {"pm": {"open_pr": False}}) is False


def test_override_for_one_role_does_not_touch_another():
    overrides = {"design": {"vote": False}}
    assert rp.can("eng", "vote", overrides) is True


def test_revoking_a_vote_removes_that_person_from_the_voter_list():
    people = [{"user_id": "amy", "role": "pm"},
              {"user_id": "dee", "role": "design"}]
    assert rp.voters(people) == ["amy", "dee"]
    assert rp.voters(people, {"design": {"vote": False}}) == ["amy"]


# --------------------------------------------------------------------------
# voters()
# --------------------------------------------------------------------------

def test_voters_is_sorted_and_deduplicated():
    people = [{"user_id": "zoe", "role": "pm"},
              {"user_id": "amy", "role": "qa"},
              {"user_id": "amy", "role": "qa"}]
    assert rp.voters(people) == ["amy", "zoe"]


def test_voters_of_an_empty_room_is_empty():
    assert rp.voters([]) == []


def test_a_room_of_only_observers_has_no_voters():
    assert rp.voters([{"user_id": "a", "role": "observer"},
                      {"user_id": "b", "role": "observer"}]) == []


# --------------------------------------------------------------------------
# priority / outranks
# --------------------------------------------------------------------------

def test_pm_outranks_design_by_default():
    assert rp.outranks("pm", "design") is True
    assert rp.outranks("design", "pm") is False


def test_priority_can_be_overridden():
    assert rp.outranks("qa", "pm", {"qa": {"priority": 99}}) is True


def test_a_role_does_not_outrank_itself():
    assert rp.outranks("pm", "pm") is False


def test_every_working_role_outranks_an_observer():
    for role in ("pm", "eng", "design", "qa"):
        assert rp.outranks(role, "observer") is True
