# Process overview

This crit's app is a shared laundry-room queue — see
[`README.md`](README.md) for the full argument.

**App concept - What the agent is for, and what I'm for.** 
An agent can help build
specific features, but only once there's an actual idea to build — it
doesn't originate a good one. At the start I asked the agent what we
could build, and it suggested three median ideas
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab)):
reasonable, but obviously uninteresting, because none of them came from a
real problem.
Rejected three agent-suggested generic directions and a
rejected co-op-game idea
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab)).
The final idea's inspiration came from crit 7: after reworking an ANU
system, I became more inclined to think about problems from the user's
own point of view, and to solve a real problem I'd actually run into
myself. Full decision process:
[`docs/adr/0001-app-concept.md`](docs/adr/0001-app-concept.md).

**Needs-driven, design-first.** Even once I had a vague laundry-room idea
of my own, talking through the details stayed bumpy — until I'd worked out
for myself exactly what the system in my head looked like, and explained
it back step by step as a real situation: a specific person, in a specific
room, doing a specific thing
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
[plan.md's "User story"](plan.md#user-story)). Only then did the plans the
agent wrote start matching what I actually meant.

**Stack choice.** Full decision process:
[`docs/adr/0003-tech-stack.md`](docs/adr/0003-tech-stack.md).
Hono + TypeScript on Node 24, SQLite via Drizzle/`better-sqlite3`,
migrations applied at server boot rather than Fly's `release_command`, since
no separate machine can see the volume
([`ff403af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/ff403af)).
Built out in
[`396b760`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/396b760),
[`5e8983a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/5e8983a)
and
[`5e08452`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/5e08452);
deployed with a real Dockerfile at
[`d073088`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/d073088).


**Overall first, then the parts.** Once that full vision was worked out, a
single `plan.md` got big enough to scatter attention across stages instead
of focusing it, so it was split into the whole-project vision plus a
per-crit plan with that crit's concrete scope
([`a0723c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/a0723c1),
[`f4c9edc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f4c9edc)).

**Corrections landing in the harness, not just code.**
- Identity started as a self-declared name or room number
  ([`312321a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/312321a)).
  Building Stage 1 showed a name isn't unique, and both the fairness rule's
  position-tracking and reservation ownership depend on it being unique, so
  that decision was superseded outright with room-number-only
  ([`277c163`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/277c163)),
  enforced in code
  ([`4456a3a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4456a3a))
  and checked in `spec/`
  ([`849202c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/849202c)),
  logged at
  ([`6a8a778`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/6a8a778)).
- Testing the *deployed* app surfaced three more: a 14-digit test identity
  had reached the live site, fixed by tightening the format and making
  tests clean up their own reservations
  ([`6db64ac`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/6db64ac),
  [`73cf5e8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/73cf5e8));
  a claimed-but-never-started machine blocked forever, fixed with the same
  forfeit the fairness rule already applied elsewhere
  ([`b70faed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b70faed));
  and times were rendering in the server's UTC instead of Canberra's
  ([`937e7ff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/937e7ff)).
- README and `CLAUDE.md` had overstated "no messaging" as a permanent ban;
  the actual position was always that talking is optional, not forbidden —
  corrected in both
  ([`21b90b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/21b90b3),
  [`b81fa8b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b81fa8b)),
  logged at
  ([`d5f774e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/d5f774e)).

**A fairness rule added after shipping.** A room can hold at most 2 active
reservations per machine type at once — enough to wash darks and lights
separately, not enough to tie up every washer — added to the schema and
enforced in `join()`
([`2fc9dd0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2fc9dd0),
[`6a67020`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/6a67020))
and checked in `spec/`
([`ffbce49`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/ffbce49)).
