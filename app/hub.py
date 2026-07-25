"""Server-Sent-Events fan-out.

Every participant in a room subscribes to the same channel, so the agent's
token stream, step transitions and vote changes land on every screen at the
same time. Nobody "owns" the stream -- the server produces it once and
rebroadcasts.
"""

import asyncio
import json
from collections import defaultdict

# room_id -> set of per-subscriber queues
_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

# Bounded so one stalled browser tab cannot grow without limit.
_QUEUE_MAX = 512


def subscribe(room_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAX)
    _subscribers[room_id].add(q)
    return q


def unsubscribe(room_id: str, q: asyncio.Queue) -> None:
    _subscribers[room_id].discard(q)
    if not _subscribers[room_id]:
        _subscribers.pop(room_id, None)


def publish(room_id: str, event: str, payload: dict) -> None:
    """Fan an event out to every subscriber of a room.

    Never blocks and never raises: a slow subscriber drops the event rather
    than stalling the agent loop that produced it.
    """
    frame = f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"
    for q in list(_subscribers.get(room_id, ())):
        try:
            q.put_nowait(frame)
        except asyncio.QueueFull:
            pass


def subscriber_count(room_id: str) -> int:
    return len(_subscribers.get(room_id, ()))
