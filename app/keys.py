"""Bring-your-own-key vault.

Every participant supplies their own API key, and the run is billed back to
them by pdd.token_split. That only works if we handle their keys carefully.

Keys live in this process's memory and nowhere else. They are never written to
disk, never logged, never included in a snapshot sent to the browser, and
never sent anywhere except the model provider the key belongs to. Restarting
the server forgets every key.
"""

import os
import time

# (room_id, user_id) -> {"key": str, "provider": str, "expires": float}
_VAULT: dict[tuple[str, str], dict] = {}

TTL_SECONDS = 12 * 60 * 60

# House key. Lets someone join a room and try it without first going off to
# create an account somewhere -- the demo works on arrival.
#
# Read from the environment and never from a file in this repository. This repo
# is public; a key committed here would be scraped within minutes.
FALLBACK_KEY = os.environ.get("FALLBACK_API_KEY", "").strip()
FALLBACK_PROVIDER = os.environ.get("FALLBACK_PROVIDER", "tokenrouter").strip()


def has_fallback() -> bool:
    return bool(FALLBACK_KEY)


def put(room_id: str, user_id: str, key: str, provider: str = "anthropic") -> None:
    key = (key or "").strip()
    if not key:
        raise ValueError("empty key")
    _VAULT[(room_id, user_id)] = {
        "key": key,
        "provider": provider,
        "expires": time.time() + TTL_SECONDS,
    }


def get(room_id: str, user_id: str) -> dict | None:
    entry = _VAULT.get((room_id, user_id))
    if entry is None:
        return None
    if entry["expires"] < time.time():
        _VAULT.pop((room_id, user_id), None)
        return None
    return entry


def drop(room_id: str, user_id: str) -> None:
    _VAULT.pop((room_id, user_id), None)


def has_key(room_id: str, user_id: str) -> bool:
    return get(room_id, user_id) is not None


def holders(room_id: str) -> list[str]:
    """Which participants in a room have a usable key. Ids only, never keys."""
    now = time.time()
    return [uid for (rid, uid), e in _VAULT.items()
            if rid == room_id and e["expires"] >= now]


def fingerprint(room_id: str, user_id: str) -> str:
    """A safe, non-reversible hint so a participant can confirm which key is
    loaded without the key ever leaving this process."""
    entry = get(room_id, user_id)
    if entry is None:
        return ""
    k = entry["key"]
    return f"{k[:7]}...{k[-4:]}" if len(k) > 15 else "..."


def pick_billing_key(room_id: str, preferred_user_id: str | None) -> dict | None:
    """The key a run executes against.

    In order: the participant who started the run, then any member with a key
    loaded, then the house key. A room is never blocked because the initiator
    forgot to add one.

    Note this decides only which key is *spent*. Who is *charged* is a separate
    question, answered by pdd.token_split from contribution weights -- so a run
    on Amy's key steered mostly by Joe still shows most of the cost against Joe.
    """
    if preferred_user_id:
        entry = get(room_id, preferred_user_id)
        if entry:
            return {**entry, "shared": False}
    for uid in holders(room_id):
        entry = get(room_id, uid)
        if entry:
            return {**entry, "shared": False}
    if FALLBACK_KEY:
        return {"key": FALLBACK_KEY, "provider": FALLBACK_PROVIDER, "shared": True}
    return None
