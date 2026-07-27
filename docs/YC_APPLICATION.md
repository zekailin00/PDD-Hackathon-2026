# CoPrompt — YC Application Draft

This document separates verified product facts from information that only the
founder can provide. It is written as a working draft, not as a source of
invented traction.

## Company in one sentence

CoPrompt is a multiplayer workspace where product teams build and approve
software with one shared AI agent.

## What is the company going to make?

CoPrompt gives product teams a shared room for building software with AI. A PM,
engineer, designer, and QA lead can define one intent, guide the same AI run,
see which feedback the agent has picked up, review the generated result, and
approve or reject it together.

Instead of each person running a separate prompt and reconciling the outputs
later, the team works through one visible decision process from scope to
approval.

## What problem does it solve?

AI coding products are mostly single-player, while software decisions are made
by teams.

Teams currently spread context across meetings, chat, documents, AI sessions,
and pull requests. This creates three recurring problems:

- The AI receives incomplete or conflicting instructions.
- Team members cannot easily tell which feedback has been included.
- There is no shared approval boundary between generated output and a result
  the team is willing to use.

CoPrompt keeps the team’s intent, role ownership, AI activity, artifact review,
and approval status in one room.

## Who is it for?

The initial target users are small product teams that already use AI to
prototype or ship software:

- early-stage startup teams;
- product agencies;
- internal product squads;
- technical founders working with design, product, or QA collaborators.

The narrow initial use case is a team producing and approving a browser-ready
prototype together.

## What is different?

Existing AI coding tools optimize the output of an individual user. Teams then
coordinate around those tools with chat, documents, and code review.

CoPrompt starts from the team:

- one shared intent instead of competing prompts;
- explicit decision rights for product, engineering, design, and QA;
- visible pickup status for each contributor’s AI-visible input;
- live steering of one shared run;
- a room-level approval decision attached to the generated artifact;
- private Member Chat that is never passed to the model.

The product is not another model or code editor. It is the collaboration and
decision layer around AI-generated software.

## What is built?

The working MVP currently supports:

- public and private rooms with invite links;
- live participant presence and room events;
- role-based intent editing, run, steer, halt, and voting permissions;
- automatic model routing through TokenRouter;
- browser-previewable generated artifacts;
- generated code, criteria, and test review;
- unanimous approval across eligible room members;
- ZIP project context;
- optional memory for approved decisions;
- English and Traditional Chinese interfaces.

The public product is available at
[`coprompt-ai.onrender.com`](https://coprompt-ai.onrender.com).

## Current technical status

The room workflow works end to end, but the infrastructure is still MVP-stage.
Room state is process-local, so the deployment runs as one instance and a
server restart clears non-demo rooms. The repository includes a prepared
Supabase migration, but durable storage is not connected to the runtime yet.

Generated artifacts run in a sandboxed preview. Generated tests are currently
review material and are not executed in an isolated code runner.

## Why now?

AI can now produce useful software artifacts quickly. As more people inside a
company participate in prompting and reviewing that work, the bottleneck moves
from generation to coordination: agreeing on the task, resolving competing
feedback, and deciding whether the output is accepted.

CoPrompt is built for that shift from one person using an AI assistant to a team
working with a shared AI collaborator.

## Product demo outline

Keep the demo focused on one complete workflow:

1. Create a private co-working room.
2. Join from a second browser using the invite link.
3. Show two people with different roles.
4. Add a goal to the shared intent.
5. Start one AI run and show contributor pickup status.
6. Send a mid-run nudge from the second participant.
7. Review the generated preview, code, criteria, and tests.
8. Approve from both participants and show the room approval state.

Avoid spending demo time on settings or infrastructure. The core moment is two
people steering and approving the same AI-generated result.

## One-minute founder video bullets

YC asks for founders speaking directly to the camera rather than a product
demo. Use these as prompts, not a script:

- Founder name and current role.
- “We are building CoPrompt, a multiplayer workspace where product teams build
  and approve software with one shared AI agent.”
- The first-hand moment that revealed the problem.
- Why this founder or founding team is unusually suited to solve it.
- What has been built and learned from real users so far.
- Why the founders want to spend the next several years on this problem.

## Founder-only facts to complete before submission

Replace this section with specific, verifiable answers:

- Founder names, locations, roles, and equity split.
- How the founders met and how long they have worked together.
- The most impressive thing each founder has built or achieved.
- Current full-time or part-time commitment.
- Product start date and launch date.
- Number of active users and teams.
- Weekly or monthly growth.
- Revenue and pricing, if any.
- User interview count and the strongest repeated insight.
- Company incorporation and fundraising status.
- Competitors users mention in interviews.
- The exact acquisition channel for the first ten active teams.

If a number is zero, say zero. A precise early-stage answer is stronger than an
unsupported claim.

## Questions the next product cycle should answer

- Which team role feels the coordination pain most strongly?
- Do teams return for a second room without founder assistance?
- Which roles need a vote before a team treats an artifact as approved?
- Does shared steering reduce duplicate AI sessions or review time?
- Will teams pay per seat, per room, or for AI usage?
- What existing workflow does CoPrompt replace first?

## Official YC references

- [How to Apply to Y Combinator](https://www.ycombinator.com/howtoapply.html)
- [YC Application Video Instructions](https://www.ycombinator.com/video/)
- [YC Application FAQ](https://www.ycombinator.com/faq/)
