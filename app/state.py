"""In-process room state.

Deliberately in-memory: a hackathon demo runs on one instance, and this keeps
the whole coordination model readable in one file. Restarting the server
clears every room. See "Known limitations" in the README.
"""

import time
import uuid
from dataclasses import dataclass, field

# Session lifecycle. Prompts never interrupt a run -- they queue as steers.
IDLE = "IDLE"
RUNNING = "RUNNING"
PROPOSED = "PROPOSED"
AWAITING_INPUT = "AWAITING_INPUT"

ROLES = ("pm", "eng", "design", "qa", "observer")

ROLE_LENS = {
    "pm": "Owns scope and acceptance criteria. Final say on WHAT is built.",
    "eng": "Owns implementation and constraints. Final say on HOW.",
    "design": "Owns UX and visual hierarchy. Final say on how it LOOKS.",
    "qa": "Owns verification. Final say on whether it is DONE.",
    "observer": "Watching. May suggest, but holds no decision and no vote.",
}


def _now() -> float:
    return time.time()


def _uid() -> str:
    return uuid.uuid4().hex[:12]


@dataclass
class Participant:
    user_id: str
    name: str
    role: str
    color: str
    has_key: bool = False
    last_seen: float = field(default_factory=_now)


@dataclass
class Message:
    id: int
    kind: str          # prompt | steer | agent | question | answer | system
    author_id: str | None
    author_name: str
    role: str
    content: str
    run_id: str | None = None
    at: float = field(default_factory=_now)


@dataclass
class Steer:
    id: str
    run_id: str
    author_id: str
    author_name: str
    role: str
    kind: str          # nudge | halt
    content: str
    consumed: bool = False
    at: float = field(default_factory=_now)


@dataclass
class Proposal:
    id: str
    run_id: str
    title: str
    rationale: str
    files: list          # [{"path": str, "new_content": str, "diff": str}]
    votes: list = field(default_factory=list)   # append-only vote log
    status: str = "pending"                     # pending | merged | withdrawn
    pr_url: str | None = None
    at: float = field(default_factory=_now)


@dataclass
class Run:
    id: str
    started_by: str
    status: str = "running"       # running | done | halted | error
    steps: list = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    at: float = field(default_factory=_now)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass
class Room:
    id: str
    title: str = "Untitled Room"
    state: str = IDLE
    intent: str = ""
    intent_locked_by: str | None = None
    policy: str = "unanimous"
    role_overrides: dict = field(default_factory=dict)
    participants: dict = field(default_factory=dict)
    messages: list = field(default_factory=list)
    steers: list = field(default_factory=list)
    runs: dict = field(default_factory=dict)
    proposals: dict = field(default_factory=dict)
    active_run_id: str | None = None
    active_proposal_id: str | None = None
    ledger: dict = field(default_factory=dict)   # user_id -> tokens charged
    _seq: int = 0

    # -- messages ---------------------------------------------------------
    def add_message(self, kind, author_name, role, content,
                    author_id=None, run_id=None) -> Message:
        self._seq += 1
        m = Message(id=self._seq, kind=kind, author_id=author_id,
                    author_name=author_name, role=role, content=content,
                    run_id=run_id)
        self.messages.append(m)
        return m

    # -- steering ---------------------------------------------------------
    def pending_steers(self, run_id: str) -> list:
        return [s for s in self.steers if s.run_id == run_id and not s.consumed]

    def has_pending_halt(self, run_id: str) -> bool:
        return any(s.kind == "halt" for s in self.pending_steers(run_id))

    # -- billing ----------------------------------------------------------
    def contributions_for(self, run_id: str) -> list:
        """Who steered this run, and how much, initiator first.

        Weight is the number of prompts and steers a participant contributed.
        Feeds pdd.token_split.split_tokens.
        """
        run = self.runs.get(run_id)
        if run is None:
            return []

        counts: dict[str, int] = {}
        order: list[str] = []
        if run.started_by:
            counts[run.started_by] = 0
            order.append(run.started_by)

        for m in self.messages:
            if m.run_id == run_id and m.kind in ("prompt", "steer", "answer") \
                    and m.author_id:
                if m.author_id not in counts:
                    counts[m.author_id] = 0
                    order.append(m.author_id)
                counts[m.author_id] += 1

        return [{"user_id": u, "weight": float(max(counts[u], 1))} for u in order]


# --------------------------------------------------------------------------

ROOMS: dict[str, Room] = {}

_PALETTE = ["#5B8DEF", "#F2789F", "#57C99A", "#F5A85B",
            "#A78BFA", "#4ECDC4", "#FF6B6B", "#FFD93D"]


def get_or_create_room(room_id: str) -> Room:
    room = ROOMS.get(room_id)
    if room is None:
        room = Room(id=room_id, title=f"Room {room_id}")
        ROOMS[room_id] = room
        # Imported here: seed reads state, so a module-level import would cycle.
        from . import seed
        seed.apply(room)
    return room


def join(room: Room, name: str, role: str) -> Participant:
    if role not in ROLES:
        raise ValueError(f"unknown role: {role!r}")
    user_id = _uid()
    color = _PALETTE[len(room.participants) % len(_PALETTE)]
    p = Participant(user_id=user_id, name=name, role=role, color=color)
    room.participants[user_id] = p
    return p


def new_run(room: Room, started_by: str) -> Run:
    run = Run(id=_uid(), started_by=started_by)
    room.runs[run.id] = run
    room.active_run_id = run.id
    return run


def new_proposal(room: Room, run_id: str, title: str,
                 rationale: str, files: list) -> Proposal:
    p = Proposal(id=_uid(), run_id=run_id, title=title,
                 rationale=rationale, files=files)
    room.proposals[p.id] = p
    room.active_proposal_id = p.id
    return p


def snapshot(room: Room) -> dict:
    """Everything a freshly-joined client needs to render the room."""
    proposal = room.proposals.get(room.active_proposal_id or "")
    return {
        "id": room.id,
        "title": room.title,
        "state": room.state,
        "intent": room.intent,
        "intent_locked_by": room.intent_locked_by,
        "policy": room.policy,
        "role_overrides": room.role_overrides,
        "participants": [vars(p) for p in room.participants.values()],
        "messages": [vars(m) for m in room.messages[-200:]],
        "ledger": room.ledger,
        "active_run": vars(room.runs[room.active_run_id])
        if room.active_run_id in room.runs else None,
        "proposal": _proposal_view(proposal) if proposal else None,
    }


def _proposal_view(p: Proposal) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "rationale": p.rationale,
        "files": p.files,
        "votes": p.votes,
        "status": p.status,
        "pr_url": p.pr_url,
    }
