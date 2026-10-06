# Process notes

Working log of real forks — points where I didn't take the agent's word, or
made a call it couldn't make for me. `PROCESS.md` picks the most important
one(s) of these to write up properly before shipping.

## Identity: room number only, not a name

**What happened:** Stage 1 shipped with identity as a self-declared name or
room number (ADR 0002), picked earlier in the crit. After seeing it
running, I realised a name isn't unique — two residents could type the
same one, and claim/start/cancel ownership plus the fairness rule's
position-tracking both depend on identity actually telling people apart.

**The obvious alternative:** leave it as-is (name or room number, agent's
and my own earlier call) and treat name collisions as an edge case to
maybe handle later.

**What we did instead:** identity is now a room number only, in the format
`roomXXX`. Names are rejected outright.

**Why it helped:** this isn't a hypothetical — a name collision would let
two different people share one queue position, or let one accidentally act
on another's reservation, which breaks the fairness argument the whole app
is built on. A room number is unique per resident where a name isn't.

**Backed by:**
- ADR 0002 superseded by ADR 0004 (`docs/adr/0004-identity-format.md`)
- `CLAUDE.md`'s identity rule updated
- `spec/identity-format.test.ts` enforces the format; `POST /identity`
  actually validates it in code (not just documented)
- Commits (this repo:
  `comp4020-agentic-coding-studio/comp4020-final-yuehesun`, not yet pushed):
  [`277c163`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/277c163) (ADR),
  [`996b3a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/996b3a4) (CLAUDE.md),
  [`948cc4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/948cc4a) (README),
  [`4456a3a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4456a3a) (app code),
  [`849202c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/849202c) (spec)
