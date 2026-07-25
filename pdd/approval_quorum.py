"""
approval_quorum — decide when a room's proposal may become a pull request.
"""

def evaluate(
    members: list[str],
    votes: list[dict],
    policy: str = "unanimous",
) -> dict:
    if policy not in ("unanimous", "majority"):
        raise ValueError(f"Unknown policy: {policy}")

    # Deduplicate and sort members
    unique_members = sorted(list(set(members)))

    # Track only the most recent vote for each user
    latest_votes = {}
    for vote in votes:
        verdict = vote.get("verdict")
        if verdict not in ("approve", "request_changes"):
            raise ValueError(f"Invalid verdict: {verdict}")
        
        user_id = vote.get("user_id")
        if user_id in unique_members:
            latest_votes[user_id] = verdict

    approved_by = []
    blocked_by = []
    waiting_on = []

    for m in unique_members:
        vote = latest_votes.get(m)
        if vote == "approve":
            approved_by.append(m)
        elif vote == "request_changes":
            blocked_by.append(m)
        else:
            waiting_on.append(m)

    # Determine eligibility
    can_open_pr = False
    if unique_members and not blocked_by:
        if policy == "unanimous":
            can_open_pr = len(approved_by) == len(unique_members)
        elif policy == "majority":
            can_open_pr = len(approved_by) > len(unique_members) / 2

    # Formulate reason
    if not unique_members:
        reason = "no members in room"
    elif blocked_by:
        reason = f"blocked by {', '.join(blocked_by)}"
    elif can_open_pr:
        reason = f"{len(approved_by)} of {len(unique_members)} approved"
    elif waiting_on:
        reason = f"waiting on {', '.join(waiting_on)}"
    else:
        reason = "not enough approvals"

    return {
        "can_open_pr": can_open_pr,
        "approved_by": approved_by,
        "blocked_by": blocked_by,
        "waiting_on": waiting_on,
        "reason": reason,
    }