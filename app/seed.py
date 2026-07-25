"""Seed a freshly created room so it does not open empty.

A room nobody has used yet is four blank panels, and a blank panel teaches a
first-time visitor nothing about what this is. Seeding gives a new room a
worked example: an intent written the way the team should write one, a short
exchange showing what steers and role tags look like, and the decisions a
previous session reached.

What is deliberately NOT seeded: participants. A fake member would sit in
`members` forever and the approval gate would wait on a person who cannot
vote, so no proposal could ever open a PR. Seeded messages carry author names
as plain text and no participant record.

Disable with SEED_ROOMS=0.
"""

import os

from . import memory, state

SEED_ENABLED = os.environ.get("SEED_ROOMS", "1") != "0"

SAMPLE_INTENT = """\
## Goal
A signed-in participant can rate limit their own room so one runaway agent
cannot burn the whole team's API budget in a single session.

## Acceptance criteria
1. Given a room at its configured limit, when anyone hits Run, then the run is
   refused with the reason and the time the window resets.
2. Given a room under its limit, when a run starts, then the remaining budget
   is visible to everyone in the room before the first token arrives.
3. Existing steering and approval behaviour still passes its tests.

## Must not
- Must not apply the limit per participant; the budget belongs to the room.
- Must not silently drop a run. A refusal is always explained.

## Validation
- Targeted test: pytest tests/test_rate_limit.py -q
- Manual demo path: open two browsers, exhaust the limit, confirm both see the
  same refusal at the same moment.
"""

SAMPLE_EXCHANGE = [
    ("system", "CoPrompt", "agent",
     "Room created. Seeded with a worked example — edit the Intent and hit Run."),
    ("prompt", "Amy", "pm",
     "We keep blowing the budget in long sessions. Let's cap it per room."),
    ("prompt", "Kai", "eng",
     "Per room, not per person — otherwise whoever steers most gets punished."),
    ("agent", "CoPrompt", "agent",
     "Reading the run lifecycle in app/main.py and app/agent.py to find where a "
     "budget check belongs. The natural place is start_run, before the room "
     "transitions to RUNNING — refusing there costs nothing and keeps the "
     "IDLE→RUNNING transition atomic."),
    ("steer", "Joe", "qa",
     "Whatever you propose, the refusal has to be observable — I want a test "
     "that asserts the reason string, not just the status code."),
    ("agent", "CoPrompt", "agent",
     "Noted. I'll return the reset time in the refusal body so the test has "
     "something concrete to assert on."),
]

SAMPLE_DECISIONS = [
    ("The token budget is scoped to the room, not to individual participants",
     "Per-participant limits punish whoever steers the most, which is the "
     "opposite of what we want from a collaborative session."),
    ("A refused run must always explain itself and say when the window resets",
     "Silent failures are indistinguishable from bugs, and in a shared room "
     "everyone sees the failure at once."),
    ("Anonymous rooms for the demo; no auth before the event",
     "Auth costs hours and adds nothing to what we are demonstrating. The "
     "approval gate is only as strong as who holds the room link, and we say "
     "so in the README."),
]


def apply(room: state.Room) -> None:
    """Populate a brand-new room. Safe to call only on creation."""
    if not SEED_ENABLED or room.messages or room.intent:
        return

    room.intent = SAMPLE_INTENT

    for kind, author, role, content in SAMPLE_EXCHANGE:
        room.add_message(kind, author, role, content)

    for decision, rationale in SAMPLE_DECISIONS:
        memory.record_decision(room.id, decision, rationale, by="a previous session")


def demo_proposal(room: state.Room) -> state.Proposal:
    """A ready-made proposal for rehearsing the vote and PR flow.

    Lets the team practise the approval choreography -- chips turning green,
    Open PR unlocking -- without spending a single token on a real run.
    """

    after = (
        "    allowed, reason = budget.check(room)\n"
        "    if not allowed:\n"
        "        raise HTTPException(429, reason)\n\n"
        "    run = state.new_run(room, uid)\n"
        "    room.state = state.RUNNING\n"
    )
    diff = (
        "--- a/app/main.py\n"
        "+++ b/app/main.py\n"
        "@@ -218,6 +218,10 @@ async def start_run(room_id: str, body: dict = Body(...)):\n"
        "     if not keys.holders(room_id):\n"
        "         raise HTTPException(400, \"No API key loaded in this room.\")\n"
        " \n"
        "+    allowed, reason = budget.check(room)\n"
        "+    if not allowed:\n"
        "+        raise HTTPException(429, reason)\n"
        "+\n"
        "     run = state.new_run(room, uid)\n"
        "     room.state = state.RUNNING\n"
    )
    proposal = state.new_proposal(
        room,
        run_id="seed-run",
        title="Refuse a run when the room is over its token budget",
        rationale=(
            "Checks the room budget in start_run, before the IDLE->RUNNING "
            "transition, so a refusal costs nothing and the transition stays "
            "atomic. The refusal carries the reset time so it is observable, "
            "per Joe's steer."
        ),
        files=[{"path": "app/main.py", "new_content": after, "diff": diff}],
    )
    room.state = state.PROPOSED
    return proposal
