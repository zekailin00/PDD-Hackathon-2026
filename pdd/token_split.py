import math

def split_tokens(
    total_tokens: int,
    contributions: list[dict],
    mode: str = "weighted",
) -> dict[str, int]:
    if total_tokens < 0:
        raise ValueError("total_tokens must be non-negative")
    if mode not in ("weighted", "equal", "initiator"):
        raise ValueError(f"Invalid mode: {mode}")
    if not contributions:
        return {}

    initiator = contributions[0]["user_id"]
    
    # 1. Aggregate unique users and their total weights
    unique_users = []
    user_weights = {}
    for c in contributions:
        uid = c["user_id"]
        weight = c["weight"]
        if uid not in user_weights:
            unique_users.append(uid)
            user_weights[uid] = 0.0
        user_weights[uid] += weight

    # 2. Determine weights according to mode
    if mode == "initiator":
        weights = {uid: 1.0 if uid == initiator else 0.0 for uid in unique_users}
    elif mode == "equal":
        weights = {uid: 1.0 for uid in unique_users}
    else:  # "weighted"
        total_w = sum(user_weights.values())
        if total_w == 0.0:
            weights = {uid: 1.0 for uid in unique_users}
        else:
            weights = user_weights.copy()

    # 3. Calculate shares and fractional parts
    total_weight = sum(weights.values())
    allocated = {}
    fractional_parts = {}

    for uid in unique_users:
        w = weights[uid]
        if total_weight == 0:
            exact_share = total_tokens / len(unique_users)
        else:
            exact_share = total_tokens * (w / total_weight)
        
        floor_share = math.floor(exact_share)
        allocated[uid] = floor_share
        fractional_parts[uid] = exact_share - floor_share

    # 4. Distribute the remaining tokens deterministically
    remaining_tokens = total_tokens - sum(allocated.values())
    
    # Sort primarily by fractional part descending, breaking ties by user_id ascending
    sorted_users = sorted(unique_users, key=lambda uid: (-fractional_parts[uid], uid))
    
    for i in range(remaining_tokens):
        uid = sorted_users[i % len(sorted_users)]
        allocated[uid] += 1

    return allocated