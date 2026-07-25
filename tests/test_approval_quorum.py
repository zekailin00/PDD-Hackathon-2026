"""Acceptance tests for the approval_quorum PDD module.

This gate is the only thing standing between a read-only agent and a real
pull request. Its forbidden outcomes matter more than its happy path, so the
negative cases are tested first and hardest.
"""

import pytest

pdd_quorum = pytest.importorskip(
    "pdd.approval_quorum",
    reason="pdd/approval_quorum.py not generated yet -- run scripts/pdd-sync.sh",
)
evaluate = pdd_quorum.evaluate


def approve(uid):
    return {"user_id": uid, "verdict": "approve"}


def block(uid):
    return {"user_id": uid, "verdict": "request_changes"}


# --------------------------------------------------------------------------
# Forbidden outcomes -- a PR must never open when it should not
# --------------------------------------------------------------------------

def test_single_request_changes_vetoes_unanimous():
    r = evaluate(["amy", "joe"], [approve("amy"), block("joe")])
    assert r["can_open_pr"] is False
    assert r["blocked_by"] == ["joe"]


def test_single_request_changes_vetoes_majority():
    r = evaluate(["a", "b", "c"], [approve("a"), approve("b"), block("c")],
                 policy="majority")
    assert r["can_open_pr"] is False, "a veto must outrank a majority"
    assert r["blocked_by"] == ["c"]


def test_silence_is_not_approval():
    r = evaluate(["amy", "joe", "kai"], [approve("amy"), approve("joe")])
    assert r["can_open_pr"] is False
    assert r["waiting_on"] == ["kai"]


def test_empty_room_cannot_open_pr():
    r = evaluate([], [])
    assert r["can_open_pr"] is False


def test_no_votes_at_all_cannot_open_pr():
    r = evaluate(["amy", "joe"], [])
    assert r["can_open_pr"] is False
    assert r["waiting_on"] == ["amy", "joe"]


def test_outsider_votes_are_ignored():
    r = evaluate(["amy"], [approve("amy"), approve("intruder"), block("intruder")])
    assert r["can_open_pr"] is True
    for key in ("approved_by", "blocked_by", "waiting_on"):
        assert "intruder" not in r[key]


def test_outsider_cannot_veto():
    r = evaluate(["amy", "joe"], [approve("amy"), approve("joe"), block("intruder")])
    assert r["can_open_pr"] is True


def test_duplicate_member_is_not_counted_twice():
    r = evaluate(["amy", "amy", "joe"], [approve("amy"), approve("joe")])
    assert r["can_open_pr"] is True
    assert r["approved_by"] == ["amy", "joe"]


# --------------------------------------------------------------------------
# Last vote wins
# --------------------------------------------------------------------------

def test_last_vote_wins_lifting_a_veto():
    r = evaluate(["amy", "joe"], [approve("amy"), block("joe"), approve("joe")])
    assert r["can_open_pr"] is True
    assert r["blocked_by"] == []


def test_last_vote_wins_imposing_a_veto():
    r = evaluate(["amy", "joe"], [approve("amy"), approve("joe"), block("joe")])
    assert r["can_open_pr"] is False
    assert r["blocked_by"] == ["joe"]


# --------------------------------------------------------------------------
# Happy paths
# --------------------------------------------------------------------------

def test_unanimous_approval_opens_the_gate():
    r = evaluate(["amy", "joe"], [approve("amy"), approve("joe")])
    assert r["can_open_pr"] is True
    assert r["approved_by"] == ["amy", "joe"]
    assert r["waiting_on"] == []


def test_majority_policy_does_not_need_everyone():
    r = evaluate(["a", "b", "c"], [approve("a"), approve("b")], policy="majority")
    assert r["can_open_pr"] is True
    assert r["waiting_on"] == ["c"]


def test_majority_needs_more_than_half():
    r = evaluate(["a", "b", "c", "d"], [approve("a"), approve("b")],
                 policy="majority")
    assert r["can_open_pr"] is False, "2 of 4 is not more than half"


# --------------------------------------------------------------------------
# Shape and determinism -- two clients must render the same thing
# --------------------------------------------------------------------------

def test_buckets_are_sorted():
    r = evaluate(["kai", "amy", "joe"], [block("kai"), approve("amy")])
    assert r["approved_by"] == sorted(r["approved_by"])
    assert r["blocked_by"] == sorted(r["blocked_by"])
    assert r["waiting_on"] == sorted(r["waiting_on"])


def test_buckets_partition_the_members_exactly():
    members = ["amy", "joe", "kai", "sam"]
    r = evaluate(members, [approve("amy"), block("joe")])
    buckets = r["approved_by"] + r["blocked_by"] + r["waiting_on"]
    assert sorted(buckets) == sorted(members)
    assert len(buckets) == len(set(buckets)), "buckets must be mutually exclusive"


def test_result_has_a_reason_string():
    r = evaluate(["amy"], [])
    assert isinstance(r["reason"], str) and r["reason"]


def test_does_not_mutate_inputs():
    members = ["amy", "joe"]
    votes = [approve("amy")]
    m_snapshot, v_snapshot = list(members), [dict(v) for v in votes]
    evaluate(members, votes)
    assert members == m_snapshot
    assert votes == v_snapshot


def test_unknown_policy_raises():
    with pytest.raises(ValueError):
        evaluate(["amy"], [approve("amy")], policy="consensus")


def test_unknown_verdict_raises():
    with pytest.raises(ValueError):
        evaluate(["amy"], [{"user_id": "amy", "verdict": "lgtm"}])
