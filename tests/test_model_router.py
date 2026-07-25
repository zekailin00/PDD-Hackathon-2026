"""Acceptance tests for the model_router PDD module.

TokenRouter has no server-side "auto", so this module is CoPrompt's auto. Its
worst failure is silently picking a model the app cannot call -- that surfaces
as a run dying mid-stream in front of the whole room.
"""

import pytest

mr = pytest.importorskip(
    "pdd.model_router",
    reason="pdd/model_router.py not generated yet -- run scripts/pdd-sync.sh",
)


def m(mid, endpoints=("anthropic",), tags="Text"):
    return {"id": mid, "supported_endpoint_types": list(endpoints), "tags": tags}


@pytest.fixture
def catalog():
    return [
        m("anthropic/claude-opus-5"),
        m("anthropic/claude-opus-5-fast"),
        m("anthropic/claude-opus-4.7"),
        m("anthropic/claude-opus-4.8"),
        m("anthropic/claude-sonnet-5"),
        m("anthropic/claude-haiku-4.5"),
        m("x-ai/grok-4.5"),
        m("google/gemini-3.5-flash", endpoints=("openai",)),
        m("openai/gpt-5.4-nano", endpoints=("openai",)),
        m("openai/gpt-5-image-mini", endpoints=("anthropic",), tags="Image"),
        m("bytedance/seedance", endpoints=("video-generation",), tags="Video"),
        m("google/gemini-embedding-2", endpoints=("anthropic",), tags="Embedding"),
    ]


# --------------------------------------------------------------------------
# Eligibility -- never offer something the app cannot call
# --------------------------------------------------------------------------

def test_models_without_a_messages_endpoint_are_excluded(catalog):
    ids = [x["id"] for x in mr.eligible(catalog)]
    assert "google/gemini-3.5-flash" not in ids
    assert "openai/gpt-5.4-nano" not in ids


def test_non_text_models_are_excluded_even_on_the_right_endpoint(catalog):
    ids = [x["id"] for x in mr.eligible(catalog)]
    assert "openai/gpt-5-image-mini" not in ids
    assert "google/gemini-embedding-2" not in ids
    assert "bytedance/seedance" not in ids


def test_anthropic_compatible_counts_as_eligible():
    cat = [m("vendor/thing", endpoints=("anthropic-compatible",))]
    assert [x["id"] for x in mr.eligible(cat)] == ["vendor/thing"]


def test_every_choice_is_eligible(catalog):
    ids = {x["id"] for x in mr.eligible(catalog)}
    for d in ("cheap", "standard", "hard"):
        assert mr.choose(catalog, difficulty=d)["model"] in ids


# --------------------------------------------------------------------------
# Tiers
# --------------------------------------------------------------------------

def test_hard_picks_a_full_size_opus(catalog):
    assert mr.choose(catalog, difficulty="hard")["model"] == "anthropic/claude-opus-5"


def test_cheap_picks_the_fast_end(catalog):
    assert mr.choose(catalog, difficulty="cheap")["model"] == "anthropic/claude-haiku-4.5"


def test_standard_prefers_sonnet(catalog):
    assert mr.choose(catalog, difficulty="standard")["model"] == "anthropic/claude-sonnet-5"


def test_hard_prefers_the_higher_version():
    cat = [m("anthropic/claude-opus-4.7"), m("anthropic/claude-opus-4.8")]
    assert mr.choose(cat, difficulty="hard")["model"] == "anthropic/claude-opus-4.8"


def test_hard_prefers_full_size_over_fast():
    cat = [m("anthropic/claude-opus-5-fast"), m("anthropic/claude-opus-5")]
    assert mr.choose(cat, difficulty="hard")["model"] == "anthropic/claude-opus-5"


def test_unknown_difficulty_raises(catalog):
    with pytest.raises(ValueError):
        mr.choose(catalog, difficulty="extreme")


# --------------------------------------------------------------------------
# An explicit human choice beats the router
# --------------------------------------------------------------------------

def test_prefer_wins_when_eligible(catalog):
    r = mr.choose(catalog, prefer="anthropic/claude-haiku-4.5", difficulty="hard")
    assert r["model"] == "anthropic/claude-haiku-4.5"


def test_prefer_is_ignored_when_not_eligible_and_says_so(catalog):
    r = mr.choose(catalog, prefer="openai/gpt-5-image-mini", difficulty="hard")
    assert r["model"] == "anthropic/claude-opus-5"
    assert "not available" in r["reason"].lower()


def test_prefer_for_a_model_not_in_the_catalog_at_all(catalog):
    r = mr.choose(catalog, prefer="vendor/does-not-exist", difficulty="cheap")
    assert r["model"] in {x["id"] for x in mr.eligible(catalog)}


# --------------------------------------------------------------------------
# Determinism -- two teammates must see the same answer
# --------------------------------------------------------------------------

@pytest.mark.parametrize("difficulty", ["cheap", "standard", "hard"])
def test_choice_is_stable_across_calls(catalog, difficulty):
    first = mr.choose(catalog, difficulty=difficulty)["model"]
    for _ in range(30):
        assert mr.choose(catalog, difficulty=difficulty)["model"] == first


@pytest.mark.parametrize("difficulty", ["cheap", "standard", "hard"])
def test_choice_does_not_depend_on_catalog_order(catalog, difficulty):
    a = mr.choose(catalog, difficulty=difficulty)["model"]
    b = mr.choose(list(reversed(catalog)), difficulty=difficulty)["model"]
    assert a == b


def test_ties_break_by_id_ascending():
    cat = [m("b/claude-sonnet-5"), m("a/claude-sonnet-5")]
    assert mr.choose(cat, difficulty="standard")["model"] == "a/claude-sonnet-5"


# --------------------------------------------------------------------------
# Shape and forbidden outcomes
# --------------------------------------------------------------------------

def test_result_carries_a_readable_reason(catalog):
    r = mr.choose(catalog, difficulty="hard")
    assert isinstance(r["reason"], str) and len(r["reason"]) > 10
    assert "hard" in r["reason"].lower() or "hard" in r["tier"].lower()


def test_result_has_model_reason_and_tier(catalog):
    r = mr.choose(catalog, difficulty="standard")
    assert set(("model", "reason", "tier")) <= set(r)


def test_empty_catalog_raises_no_eligible_model():
    with pytest.raises(mr.NoEligibleModel):
        mr.choose([], difficulty="hard")


def test_catalog_with_nothing_callable_raises_no_eligible_model():
    cat = [m("google/gemini-3.5-flash", endpoints=("openai",)),
           m("x/y", endpoints=("video-generation",), tags="Video")]
    with pytest.raises(mr.NoEligibleModel):
        mr.choose(cat, difficulty="cheap")


def test_does_not_mutate_the_catalog(catalog):
    snapshot = [dict(x, supported_endpoint_types=list(x["supported_endpoint_types"]))
                for x in catalog]
    mr.eligible(catalog)
    mr.choose(catalog, difficulty="hard")
    assert catalog == snapshot
