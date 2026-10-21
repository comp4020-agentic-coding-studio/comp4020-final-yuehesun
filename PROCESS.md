# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the full "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from. The
final project runs across three crits in this one repo: crit 8 shipped a
working, persistent app with one machine type and a blunt fairness rule;
crit 9 added real-time sync and a documented decision about what happens
when several people use it at once; crit 10 added server-side logging,
then an extension that made the fairness rules checkable by testing the
system's behaviour at real-world scale with scripted, seeded scenarios,
rather than just argued in words.

# Process overview

**What the agent is for, what I'm for.** An agent can build specific
features once there's a real idea, but it doesn't originate one. Asked
what to build, it first suggested three generic, median ideas and a
co-op-game direction, all rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab))
for not coming from a real problem. The laundry queue came from my own
dorm's actual weekend wait; the agent's plans only started matching what
I meant once I worked out the exact situation myself and gave it back
step by step
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`docs/adr/0001-app-concept.md`).

**Overall vision first, then each crit's own plan — a split that's held
up across all three.** Keeping the app's full mechanism in one plan file
scattered attention across stages instead of focusing it. `plan.md` holds
only the whole-project vision — grown, never rewritten; each crit gets
its own `plans/crit-N.md` with that crit's concrete scope, linking back
for background instead of repeating it. Every non-trivial decision gets
its own numbered ADR. This split, decided in crit 8, is what let crit
10's much larger extension plan grow past 500 lines without swallowing
the whole project's standing vision.

**Crit 9's fairness decision, benchmarked against README's own argument.**
`README.md` argues the app exists to remove the cost of being physically
present to hold a place. Crit 8's
rule — miss your claim window, ejected outright — directly punished the
behavior the app is supposed to permit. Crit 9 replaced it with moving
back one place, swapped with whoever's next, with both sides told why in
their own status block
([`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md),
[`8a73832`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8a73832)).
Crit 8's blunt rule is the ADR's named rejected alternative, kept on
record.

**Deleting something crit 8 deliberately built.** Using the app for real,
the separate reservation detail page crit 8 built on purpose turned out
to be a pointless extra click — the home page already showed every
action directly. Cutting it
broke the "Reserve" button's own redirect, caught only by clicking it for
real
([`4cae99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4cae99e)).
Same commit, same way of finding it: manual testing also showed nothing
let a running wash end early, so I added "end the wash" — but scoped it
tightly, turning down "pause" as unnecessary scope the app doesn't need.

**A `prompt.md`-driven unattended run, and why it beat my usual pace.**
Crit 9's visual pass left the app looking generic even with reference
images, because the agent only ever worked from a text description of
them and never looked at its own result. Watching crit 8 and crit 9's
riff sessions gave me a new idea: for crit 10's extension, write every
decision down first — identity, the harness, in-page alerts, no separate
board — into ADRs and an "Unattended runs" section in `CLAUDE.md`, then
hand the agent one `prompt.md` and let it run for about two hours with
nobody answering questions, verifying its own work with specs and
screenshots instead of asking me
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
The run cost about $48 and produced a home page that actually looks
considered — a real jump from crit 9's looser prompt and no forced
design-review loop
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)).
Spending effort on the brief instead of on steering a live session turned
out cheaper and better this time, not just different.

**Why the simulation exists at all: a hundred-plus people using this app
at once isn't something anyone can click through by hand.** Checking the
fairness rules hold under real-scale, simultaneous use meant running the
real queue code through a large number of randomized, seeded scenarios
instead of a handful of manual clicks — a practice that turned out to
have a name once I checked (deterministic simulation testing, the
technique behind FoundationDB and TigerBeetle: real code, a seeded clock,
a reproducible run), but the point was never the name. It was testing at
a scale manual verification can't reach, and it found something a human
reviewing the diff had already missed: a property test from the same
harness caught a real concurrency bug in Stage 9
([`8118424`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8118424),
[`docs/adr/0010-simulation-as-testing.md`](docs/adr/0010-simulation-as-testing.md)).

**A design bug the simulation's own model had, caught before the batch
ever ran.** Building its behaviour model, the agent first gave each
resident one fixed lateness value, reused every time they missed a
window — under the move-back-one rule, a resident whose number exceeded
the window missed every future chance identically, forever, producing an
endless swap loop and absurd numbers only visible once it actually ran.
That was specific enough a design mistake that "refine the plan before a
stage" wasn't stopping it, so I had the agent add a concrete trigger
instead: before writing code for a new algorithm, timing logic, or
anything randomised, write the design choice and the failure mode it
avoids into the plan first
([`c2abbcd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/c2abbcd)).

**A crash I didn't accept the agent's first explanation for.** Running
the full 50-seed batch hung the whole machine hard enough to need a
restart, twice. The agent's own first explanation was its background-task
handling — I didn't take that at face value, and had it run the identical
simulation in a second terminal with no agent involved at all. It crashed
exactly the same way, which ruled that explanation out and pointed at the
real defect: the whole batch generated and ran its 150 seeds with no
point where it ever yielded control back, keeping the CPU pinned,
uninterruptible, for the full 10-15 minutes — fixed by yielding
periodically between seeds, not by rewriting the model
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).

Automated checks (`pnpm check`) confirm the app builds and the invariants
hold. They can't judge whether a decision honors the project's own
argument, whether a "complete" feature is actually scope creep, or
whether a crash is a code problem or an infrastructure one — that
judgment happened by hand, logged as it happened in `process-notes.md`,
the most load-bearing moments promoted here.
