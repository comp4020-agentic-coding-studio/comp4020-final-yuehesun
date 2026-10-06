# Process overview

This crit's app is a laundry-room queue —
[`docs/adr/0001-app-concept.md`](docs/adr/0001-app-concept.md) explains why,
chosen over three agent-suggested directions and a rejected card-swap idea,
both grounded in real everyday problems rather than invented ones.

**Stack.** Hono + TypeScript on Node 24, SQLite via Drizzle/`better-sqlite3`,
migrations applied at server boot rather than Fly's `release_command` (no
separate machine can see the volume), htmx for interactivity with almost
no hand-written JavaScript. What was ruled out and why:
[`docs/adr/0003-tech-stack.md`](docs/adr/0003-tech-stack.md).

**What the agent is and isn't good for.** An agent can help build specific
features, but only once there's an actual idea to build — it doesn't
originate a good one. At the start I asked the agent what we could build,
and it suggested three median ideas (see ADR 0001): reasonable, but
obviously uninteresting, because none of them came from a real problem.
Even once I had a vague laundry-room idea of my own, talking through the
details stayed bumpy — until I'd worked out for myself exactly what the
system in my head looked like, and explained it back step by step as a
real situation: a specific person, in a specific room, doing a specific
thing. Only then did the plans the agent wrote start matching what I
actually meant.

**Overall first, then the parts.** Once that full vision was worked out,
a single `plan.md` got big enough to scatter attention across stages
instead of focusing it. `plan.md` now holds just the whole-project vision
— the mechanism, a numbered feature list, what's deliberately deferred —
grown, never rewritten. Each crit gets its own `plans/crit-N.md` with that
crit's concrete scope and stages, linking back to `plan.md` for background
instead of repeating it. Every non-trivial decision gets its own numbered
record in `docs/adr/`.

**A correction landing in the harness, not just code.** Identity started
as a self-declared name or room number
([`docs/adr/0002-identity.md`](docs/adr/0002-identity.md)). Building
Stage 1 surfaced the problem: a name isn't unique, and both the fairness
rule's position-tracking and reservation ownership depend on it being
unique. Rather than patch around it,
[`docs/adr/0004-identity-format.md`](docs/adr/0004-identity-format.md)
supersedes 0002 outright — identity is now room-number-only, enforced in
code
([`4456a3a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4456a3a)),
checked in `spec/identity-format.test.ts`
([`849202c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/849202c)),
and logged in `process-notes.md` as this crit's one real fork.
