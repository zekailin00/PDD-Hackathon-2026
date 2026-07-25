"""Room memory, backed by mem0.

A room outlives a single run. Decisions the team reached an hour ago -- "we
went anonymous, no auth" -- should still be in front of the agent on the next
run, without anyone re-typing them.

mem0 is optional. Without MEM0_API_KEY the room falls back to in-process
recall, so nothing here can break a demo.
"""

import os

_MEM0_KEY = os.environ.get("MEM0_API_KEY", "")
_client = None
_local: dict[str, list[dict]] = {}


def _mem0():
    global _client
    if not _MEM0_KEY:
        return None
    if _client is None:
        try:
            from mem0 import MemoryClient
            _client = MemoryClient(api_key=_MEM0_KEY)
        except Exception:                        # noqa: BLE001 - never fatal
            return None
    return _client


def enabled() -> bool:
    return _mem0() is not None


def record_decision(room_id: str, decision: str, rationale: str = "",
                    by: str = "") -> None:
    entry = {"decision": decision, "rationale": rationale, "by": by}
    _local.setdefault(room_id, []).append(entry)

    client = _mem0()
    if client is None:
        return
    text = f"The room decided: {decision}"
    if rationale:
        text += f" Rationale: {rationale}"
    if by:
        text += f" (raised by {by})"
    try:
        client.add([{"role": "user", "content": text}], user_id=f"room:{room_id}")
    except Exception:                            # noqa: BLE001
        pass


def recall(room_id: str, query: str = "", limit: int = 8) -> list[str]:
    client = _mem0()
    if client is not None:
        try:
            hits = client.search(query or "decisions made by this room",
                                 user_id=f"room:{room_id}", limit=limit)
            out = [h.get("memory", "") for h in (hits or []) if h.get("memory")]
            if out:
                return out
        except Exception:                        # noqa: BLE001
            pass

    return [
        f"The room decided: {e['decision']}"
        + (f" Rationale: {e['rationale']}" if e["rationale"] else "")
        for e in _local.get(room_id, [])[-limit:]
    ]


def local_decisions(room_id: str) -> list[dict]:
    return list(_local.get(room_id, []))
