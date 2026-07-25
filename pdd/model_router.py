import re
from functools import cmp_to_key

MESSAGES_ENDPOINTS = ("anthropic", "anthropic-compatible")


class NoEligibleModel(Exception):
    """Raised when no models in the catalog are eligible for the app."""
    pass


def eligible(catalog: list[dict]) -> list[dict]:
    """Filters the catalog down to models this app can actually call."""
    result = []
    for m in catalog:
        # Must support at least one messages endpoint
        endpoints = m.get("supported_endpoint_types", [])
        if not any(ep in MESSAGES_ENDPOINTS for ep in endpoints):
            continue

        # Must not mention Image, Video, Audio, or Embedding in tags
        tags = m.get("tags", "")
        if not isinstance(tags, str):
            tags = ""
        if any(bad in tags for bad in ("Image", "Video", "Audio", "Embedding")):
            continue

        result.append(m)
    return result


def _parse_version(model_id: str) -> tuple[str, tuple[int, ...]]:
    """Splits a model ID into a base ID and a version tuple for comparison.
    
    Example: 'claude-opus-4.7' -> ('claude-opus', (4, 7))
    """
    match = re.search(r'[-vV](\d+(?:\.\d+)*)', model_id)
    if match:
        version_str = match.group(1)
        version_tuple = tuple(int(x) for x in version_str.split('.'))
        base_id = model_id.replace(match.group(0), '', 1)
        return base_id, version_tuple
    return model_id, (0,)


def _get_rank_group(model_id: str, difficulty: str) -> int:
    """Returns a preference score (lower is better) based on the tier."""
    model_lower = model_id.lower()
    is_fast = any(x in model_lower for x in ("fast", "haiku", "flash", "lite"))
    
    is_opus = "opus" in model_lower
    is_sonnet = "sonnet" in model_lower
    is_haiku = "haiku" in model_lower
    is_other = not (is_opus or is_sonnet or is_haiku)

    if difficulty == "cheap":
        if is_haiku:
            return 1
        if is_other and is_fast:
            return 2
        if is_sonnet and is_fast:
            return 3
        if is_opus and is_fast:
            return 4
        if is_other:
            return 5
        if is_sonnet:
            return 6
        return 7  # is_opus (non-fast)

    elif difficulty == "standard":
        if is_sonnet and not is_fast:
            return 1
        if is_sonnet and is_fast:
            return 2
        if is_opus and is_fast:
            return 3
        if is_opus and not is_fast:
            return 4
        if is_other and not is_fast:
            return 5
        if is_other and is_fast:
            return 6
        return 7  # is_haiku

    elif difficulty == "hard":
        if is_opus and not is_fast:
            return 1
        if is_opus and is_fast:
            return 2
        if is_sonnet and not is_fast:
            return 3
        if is_sonnet and is_fast:
            return 4
        if is_other and not is_fast:
            return 5
        if is_other and is_fast:
            return 6
        return 7  # is_haiku

    raise ValueError(f"Unknown difficulty: {difficulty}")


def choose(
    catalog: list[dict],
    *,
    difficulty: str = "standard",
    prefer: str | None = None,
) -> dict:
    """Selects the best eligible model based on the given difficulty and preferences."""
    if difficulty not in ("cheap", "standard", "hard"):
        raise ValueError(f"Unknown difficulty: {difficulty}")

    eligible_models = eligible(catalog)
    if not eligible_models:
        raise NoEligibleModel("No eligible models found in the catalog.")

    # 1. Handle Preference Match
    if prefer is not None:
        preferred_model = next((m for m in eligible_models if m["id"] == prefer), None)
        if preferred_model:
            return {
                "model": preferred_model["id"],
                "reason": f"Selected {preferred_model['id']} directly as requested by your room's preference.",
                "tier": difficulty
            }

    # Helper comparator for deterministic sorting
    def compare_models(a: dict, b: dict) -> int:
        id_a, id_b = a["id"], b["id"]
        base_a, ver_a = _parse_version(id_a)
        base_b, ver_b = _parse_version(id_b)

        # If they differ only by version, highest version wins
        if base_a == base_b:
            if ver_a != ver_b:
                return -1 if ver_a > ver_b else 1

        # Compare based on difficulty tier logic
        rank_a = _get_rank_group(id_a, difficulty)
        rank_b = _get_rank_group(id_b, difficulty)
        if rank_a != rank_b:
            return -1 if rank_a < rank_b else 1

        # Tie-breaker: alphabetical ascending
        return -1 if id_a < id_b else 1

    # Find the winning model
    winning_model = min(eligible_models, key=cmp_to_key(compare_models))
    win_id = winning_model["id"]

    # Construct the friendly reason
    reasons = {
        "cheap": f"Selected {win_id} for the cheap tier because it is the fastest, most efficient model available.",
        "standard": f"Selected {win_id} for the standard tier because it balances intelligence and speed perfectly.",
        "hard": f"Selected {win_id} for the hard tier because it is the most capable model available for complex tasks."
    }
    reason = reasons[difficulty]

    # If a preference was requested but was not eligible, append that to the reason
    if prefer is not None:
        reason += f" (Note: Your preferred model '{prefer}' is not available or supported)."

    return {
        "model": win_id,
        "reason": reason,
        "tier": difficulty
    }