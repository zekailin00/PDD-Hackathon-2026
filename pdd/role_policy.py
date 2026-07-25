"""
Module: role_policy
Provides pure decision logic for managing role permissions and priorities in CoPrompt rooms.
"""

POWERS = ("run", "steer", "halt", "edit_intent", "vote", "open_pr")

DEFAULT_POLICY = {
    "pm": {
        "run": True, "steer": True, "halt": True, "edit_intent": True, "vote": True, "open_pr": True,
        "priority": 80
    },
    "eng": {
        "run": True, "steer": True, "halt": True, "edit_intent": True, "vote": True, "open_pr": True,
        "priority": 70
    },
    "design": {
        "run": True, "steer": True, "halt": False, "edit_intent": True, "vote": True, "open_pr": False,
        "priority": 50
    },
    "qa": {
        "run": True, "steer": True, "halt": True, "edit_intent": False, "vote": True, "open_pr": True,
        "priority": 60
    },
    "observer": {
        "run": False, "steer": True, "halt": False, "edit_intent": False, "vote": False, "open_pr": False,
        "priority": 10
    }
}


def resolve(role: str, overrides: dict | None = None) -> dict:
    """
    Returns the full effective policy entry for a single role.
    Unknown roles default to the exact power/priority structure of 'observer'.
    """
    is_known = role in DEFAULT_POLICY
    role_key = role if is_known else "observer"
    
    # Start with a copy of the default policy for the target role
    res = {k: v for k, v in DEFAULT_POLICY[role_key].items()}
    
    # Apply overrides only if the role is known to guarantee unknown roles 
    # never gain extra permissions beyond the default observer limits.
    if overrides and is_known and role in overrides:
        role_overrides = overrides[role]
        for k, v in role_overrides.items():
            if k in POWERS:
                res[k] = bool(v)
            elif k == "priority":
                res[k] = int(v)
                
    return res


def can(role: str, power: str, overrides: dict | None = None) -> bool:
    """
    Returns whether a given role is allowed to perform a specific action.
    Raises ValueError if the power is not recognized.
    """
    if power not in POWERS:
        raise ValueError(f"Unknown power: {power!r}. Must be one of {POWERS}")
    return resolve(role, overrides)[power]


def voters(participants: list[dict], overrides: dict | None = None) -> list[str]:
    """
    Extracts and returns a sorted list of unique user_ids who have voting power.
    """
    voter_ids = set()
    for p in participants:
        uid = p.get("user_id")
        role = p.get("role")
        if uid is not None and role is not None:
            if can(role, "vote", overrides):
                voter_ids.add(uid)
    return sorted(list(voter_ids))


def outranks(role_a: str, role_b: str, overrides: dict | None = None) -> bool:
    """
    Compares the priority of two roles. Returns True if role_a has a higher priority.
    """
    p_a = resolve(role_a, overrides)["priority"]
    p_b = resolve(role_b, overrides)["priority"]
    return p_a > p_b