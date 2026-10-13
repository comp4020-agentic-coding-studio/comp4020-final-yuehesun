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

## Messaging: optional, not banned

**What happened:** I'd written README's "what we chose not to build" as
"No chat, messages... This isn't 'not yet' — it's the point," and
CLAUDE.md's rule as an outright ban. After the site was live, I was told
that overstated the actual position: the goal was always that talking is
*optional* — the queue should be enough on its own — not that messaging is
forbidden from ever existing.

**The obvious alternative:** leave it, since nothing about the app's
current behaviour was technically wrong — no messaging is built either
way.

**What we did instead:** reworded README (moved it into the roadmap
bullet, not the exclusions list; fixed the matching judged claim) and
CLAUDE.md's rule (no feature may *require* a person-to-person channel,
rather than no such feature may exist) to say what was actually meant.

**Why it helped:** the three-part harness is supposed to agree with the
author's real argument, not just with itself — a rule the agent invented
and then enforced against its own invention isn't the same as the
student's own position being enforced.

**Backed by:**
- [`21b90b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/21b90b3) (README)
- [`b81fa8b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b81fa8b) (CLAUDE.md)

## Agent's own verification servers clobbering my dev server

**What happened:** I kept running `pnpm dev` myself to check the agent's
UI wording fixes, and kept seeing the old text no matter how hard I
refreshed — then `pnpm dev` itself failed outright with "address already
in use." Turned out the agent had been starting its own throwaway servers
on the same port 8080 my dev server uses, to curl-test its changes
without bothering me for a browser check each time. One of those leftover
servers didn't actually die when the agent thought it had killed it, kept
squatting on the port, and kept serving the app from before its latest
code change — so what I was looking at wasn't stale browser cache or a
mistake on my end, it was a different, older process answering the same
port.

**The obvious alternative:** let the agent just "be more careful" next
time and move on — it already found and explained the exact mechanism
once asked.

**What I decided instead:** a mistake the agent has already repeated more
than once in one session isn't fixed by it trying harder next time —
"try harder" doesn't survive a `/clear`. I told it to put a real rule in
`CLAUDE.md`: never touch port 8080 for its own verification, and actually
check the port is free after cleanup instead of trusting a `kill`
command's exit code.

**Why it helped:** a rule the agent has to re-derive from scratch every
session is worth less than one written into the harness once — this is
exactly the kind of recurring failure `CLAUDE.md` is supposed to catch,
not a one-off I should have to keep catching by hand.

**Backed by:**
- `CLAUDE.md`'s Workflow section (pending: not yet committed — lands with
  this crit's next commit)
