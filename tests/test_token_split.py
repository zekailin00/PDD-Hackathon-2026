"""Acceptance tests for the token_split PDD module.

These are TEST CAPITAL: they encode what the room agreed the behaviour must
be, independently of whatever the current prompt happens to generate. When a
test here fails, the fix goes into prompts/token_split_python.prompt and the
module is regenerated -- never into pdd/token_split.py by hand.
"""

import pytest

pdd_token_split = pytest.importorskip(
    "pdd.token_split",
    reason="pdd/token_split.py not generated yet -- run scripts/pdd-sync.sh",
)
split_tokens = pdd_token_split.split_tokens


# --------------------------------------------------------------------------
# Conservation -- the property that actually matters when real money is
# attached to the result. Every token charged to the run must land on exactly
# one participant's bill.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("total", [0, 1, 2, 7, 99, 100, 1_000, 999_983])
@pytest.mark.parametrize("n_users", [1, 2, 3, 4, 7])
def test_split_conserves_every_token(total, n_users):
    contributions = [{"user_id": f"u{i}", "weight": 1.0} for i in range(n_users)]
    result = split_tokens(total, contributions)
    assert sum(result.values()) == total, (
        f"{total} tokens split {n_users} ways summed to {sum(result.values())}"
    )


def test_split_conserves_with_uneven_weights():
    contributions = [
        {"user_id": "amy", "weight": 5.0},
        {"user_id": "joe", "weight": 3.0},
        {"user_id": "kai", "weight": 1.0},
    ]
    result = split_tokens(1_000, contributions)
    assert sum(result.values()) == 1_000


def test_equal_mode_conserves():
    contributions = [{"user_id": f"u{i}", "weight": 9.0} for i in range(3)]
    result = split_tokens(100, contributions, mode="equal")
    assert sum(result.values()) == 100


# --------------------------------------------------------------------------
# Determinism -- two people looking at the same ledger must see the same
# numbers. Remainder handling may not depend on dict or set ordering.
# --------------------------------------------------------------------------

def test_split_is_deterministic_across_calls():
    contributions = [{"user_id": u, "weight": 1.0} for u in ("kai", "amy", "joe")]
    first = split_tokens(100, contributions)
    for _ in range(50):
        assert split_tokens(100, contributions) == first


def test_remainder_does_not_depend_on_input_order():
    a = split_tokens(100, [{"user_id": "amy", "weight": 1.0},
                           {"user_id": "joe", "weight": 1.0},
                           {"user_id": "kai", "weight": 1.0}])
    b = split_tokens(100, [{"user_id": "kai", "weight": 1.0},
                           {"user_id": "joe", "weight": 1.0},
                           {"user_id": "amy", "weight": 1.0}])
    assert a == b


# --------------------------------------------------------------------------
# Proportionality
# --------------------------------------------------------------------------

def test_weighted_split_is_proportional():
    result = split_tokens(90, [{"user_id": "amy", "weight": 2.0},
                               {"user_id": "joe", "weight": 1.0}])
    assert result == {"amy": 60, "joe": 30}


def test_equal_mode_ignores_weights():
    result = split_tokens(50, [{"user_id": "amy", "weight": 3.0},
                               {"user_id": "joe", "weight": 1.0}], mode="equal")
    assert result == {"amy": 25, "joe": 25}


def test_initiator_mode_charges_the_starter():
    result = split_tokens(50, [{"user_id": "amy", "weight": 1.0},
                               {"user_id": "joe", "weight": 1.0}], mode="initiator")
    assert result == {"amy": 50, "joe": 0}


def test_repeated_user_is_summed_into_one_entry():
    result = split_tokens(100, [{"user_id": "amy", "weight": 1.0},
                                {"user_id": "joe", "weight": 1.0},
                                {"user_id": "amy", "weight": 2.0}])
    assert set(result) == {"amy", "joe"}
    assert result == {"amy": 75, "joe": 25}


# --------------------------------------------------------------------------
# Forbidden outcomes
# --------------------------------------------------------------------------

def test_empty_contributions_returns_empty_dict():
    assert split_tokens(100, []) == {}


def test_all_zero_weights_falls_back_to_even_split():
    result = split_tokens(100, [{"user_id": "amy", "weight": 0.0},
                                {"user_id": "joe", "weight": 0.0}])
    assert sum(result.values()) == 100
    assert result == {"amy": 50, "joe": 50}


def test_never_returns_negative_values():
    result = split_tokens(7, [{"user_id": f"u{i}", "weight": 1.0} for i in range(9)])
    assert all(v >= 0 for v in result.values())


def test_does_not_mutate_input():
    contributions = [{"user_id": "amy", "weight": 1.0}]
    snapshot = [dict(c) for c in contributions]
    split_tokens(100, contributions)
    assert contributions == snapshot


def test_negative_total_raises():
    with pytest.raises(ValueError):
        split_tokens(-1, [{"user_id": "amy", "weight": 1.0}])


def test_unknown_mode_raises():
    with pytest.raises(ValueError):
        split_tokens(100, [{"user_id": "amy", "weight": 1.0}], mode="proportional")
