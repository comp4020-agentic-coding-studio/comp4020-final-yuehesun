# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the full "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from. The
final project runs across three crits in this one repo: crit 8 shipped a
working, persistent app with one machine type and a blunt fairness rule;
crit 9 added real-time sync and a documented decision about what happens
when several people use it at once; crit 10 is logging and the live
multi-user demo.

# Process overview

**What the agent is for, what I'm for.** An agent can build specific
features once there's a real idea, but it doesn't originate one. Asked
what to build, it first suggested three generic, median ideas and a
co-op-game direction, all rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab))
for not coming from a real problem. The laundry queue came from my own
dorm's actual weekend wait, after crit 7 had already pushed me toward
thinking from a real user's situation rather than a generic feature list
— full reasoning in
[`docs/adr/0001-app-concept.md`](docs/adr/0001-app-concept.md). Even once
I had the idea, the agent's plans only started matching what I meant
after I worked out the exact situation myself — one specific person, one
specific room — and gave it back step by step
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`plan.md`'s User story).

**Stack and workflow.** Hono, TypeScript on Node 24, SQLite via
Drizzle/`better-sqlite3`, migrations applied at server boot rather than
Fly's `release_command`, since no separate machine can see the volume
([`docs/adr/0003-tech-stack.md`](docs/adr/0003-tech-stack.md),
[`ff403af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/ff403af)).
The real trade-off was real-time transport: SSE over WebSockets, since
Hono's streaming helper needed no extra library, and the app only ever
pushes server-to-client signals, never the other direction
([`d446436`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/d446436)).
SSE itself carries only change *signals*, never rendered HTML — each
viewer's browser re-fetches its own small, identity-aware fragment with
its own cookie, so one broadcast never leaks what should be a different
view per person. The harder problem crit 9 exposed was passive
expiry: a claim window running out isn't triggered by any request, so a
server-side tick (polling every ~500ms, not request-driven) is the one
mechanism that notices both a button click and a timer lapsing — the
same shape later reused for the cross-machine offer system
([`8a73832`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8a73832)).

**Corrections that changed the harness, not just the code.** Identity
started as a self-declared name or room number
([`312321a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/312321a)).
Building crit 8 showed a name isn't unique, and the fairness rule's
position-tracking depends on it being so — superseded with
room-number-only
([`docs/adr/0004-identity-format.md`](docs/adr/0004-identity-format.md),
[`277c163`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/277c163)),
enforced in code and `spec/`. Separately, I'd overstated "no messaging" as
an outright ban in both README and `CLAUDE.md`; the real position was
always that talking is optional, the queue just has to be enough on its
own — corrected in both files
([`21b90b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/21b90b3),
[`b81fa8b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b81fa8b))
since a rule the agent invents and then enforces against its own
invention isn't the same as my actual position being enforced.

**Crit 9's fairness decision, benchmarked against README's own argument.**
`README.md` argues the app exists to remove the cost of being physically
present to hold a place. Crit 8's rule — miss your claim window, ejected
outright — directly punished the behavior the app is supposed to permit.
Crit 9 replaced it with moving back one place, swapped with whoever's
next, with both sides told why in their own status block
([`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md),
[`8a73832`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8a73832)).
Crit 8's blunt rule is the ADR's named rejected alternative, kept on
record rather than just discarded.

**Mistakes only the running app surfaced.** Crit 8's deployed app exposed
a claimed-but-never-started machine blocking forever, fixed with the same
forfeit the fairness rule already applied elsewhere
([`b70faed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b70faed)).
Crit 9 repeated the pattern twice. First, a reservation detail page crit
8 had built on purpose turned out to be a pointless extra click once the
home page already showed every action directly — cutting it broke a
redirect the "Reserve" button depended on, caught only by clicking the
real button
([`4cae99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4cae99e),
[`b04d236`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b04d236)).
The lesson: planning catches some design mistakes, not all — some only
show up once there's a working version to click on. Second, the
cross-machine offer's eligibility algorithm looks across *every* machine
of one type, so an automated test had to occupy every unrelated machine
for its duration, or a leftover idle one elsewhere would non-deterministically
win the offer instead of the machine the test actually set up
([`76b4b81`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/76b4b81))
— caught by a real failing run, not by inspection.

**A recurring process failure, fixed in the harness.** Verifying crit 9's
real-time work by hand, I repeatedly started throwaway servers for my own
curl testing on port 8080 — the same port the student's own `pnpm dev`
uses — and didn't reliably confirm a stray one was dead before assuming
it was. One outlived a kill I thought had worked, silently serving stale
code; the student saw `pnpm dev` itself fail with `EADDRINUSE` and old
label text no matter how hard they refreshed. Telling the agent to "be
more careful" wouldn't survive the next session, so the fix went into
`CLAUDE.md` directly: never touch port 8080 for verification, and confirm
a port is actually free after cleanup rather than trusting a kill
command's exit code — a harness rule, not a private resolution that
resets at `/clear`.

Automated checks (`pnpm check`) are good at structural consistency — the
app builds, the fairness invariants hold, the offer accept/decline paths
work. They can't judge whether a decision actually honors the project's
own stated argument, whether a page that looks fine on paper is dead
weight in practice, or whether a process mistake is worth a permanent
rule rather than a one-off apology. That judgment happened by hand, every
time — logged as it happened in `process-notes.md`, the most load-bearing
moments promoted here.
