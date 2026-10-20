# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the full "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from. The
final project runs across three crits in this one repo: crit 8 shipped a
working, persistent app with one machine type and a blunt fairness rule;
crit 9 added real-time sync and a documented decision about what happens
when several people use it at once; crit 10 added server-side logging,
then an extension that made the fairness rules themselves checkable
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

**Catching the agent quietly settling on its own word for the goal, not
mine.** Crit 8's README framed the app around "fair, and seen to be
fair" as one virtue among several. That wasn't actually what I meant —
the real goal was saving people the cost of standing there with nothing
to do, not fairness for its own sake — and it had drifted that way
without either of us deciding it on purpose. I'd watched this exact kind
of drift happen once before, on a different assignment, so this time I
caught it myself before it calcified into every later file: README got
rewritten around one throughline instead of a checklist of virtues, each
source now supporting one concrete design decision instead of just
reading well
([`754949a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/754949a)).
`plan.md` is supposed to let a new session pick up cold, but only if its
words still mean what I meant — an agent can hold a plan's letter while
drifting its spirit, and nothing catches that automatically.

**Crit 9's fairness decision, benchmarked against README's own argument,
once it said the real thing.** `README.md` now argues the app exists to
remove the cost of being physically present to hold a place. Crit 8's
rule — miss your claim window, ejected outright — directly punished the
behavior the app is supposed to permit. Crit 9 replaced it with moving
back one place, swapped with whoever's next, with both sides told why in
their own status block
([`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md),
[`8a73832`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8a73832)).
Crit 8's blunt rule is the ADR's named rejected alternative, kept on
record rather than just discarded.

**A `prompt.md`-driven unattended run, and why it beat my usual pace.**
Crit 9's visual pass left the app looking generic even with reference
images, because the agent only ever worked from a text description of
them and never looked at its own result. For crit 10's extension I
changed the method instead of asking harder: write every decision down
first (ADRs 0007–0009, an "Unattended runs" section in `CLAUDE.md`), then
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
out cheaper and better, not just different.

**A 100-resident simulation that paid for itself twice over, and three
times I said no to a bigger "complete" version of something proposed.**
Running the real queue code through thousands of randomized actions is
the only way to check an app meant for a hundred-plus people actually
holds up at that scale. It paid off before it was even finished: a
property test from the same harness caught a real concurrency bug (two
same-millisecond joins silently breaking a fairness swap) in Stage 9
([`8118424`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8118424)).
Building the simulation's own behaviour model, the agent first gave each
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
Running the full 50-seed batch later hung the whole machine hard enough
to need a restart, twice — once with no agent involved at all, which
ruled out my first guess and pointed at the real cause: 126,000 simulated
minutes in one uninterruptible loop, fixed by yielding control
periodically rather than rewriting the model
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).
Once it worked, the agent's instincts kept reaching too far: a live
button to re-run it against the real deployed site, rejected since
`src/db.ts`/`src/clock.ts` are process-wide singletons and this would
mean writing fake rooms into the real database; a one-line verdict on
which fairness policy "wins," rejected since that argument belongs to
`README.md`/ADR 0005 on grounds a simulation can't measure; a link to a
separate ADR instead of an answer, rejected since a reader shouldn't have
to leave the page — the real analysis now lives directly on `/simulation`
([`4a27566`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4a27566),
[`2736235`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2736235)).

Automated checks (`pnpm check`) confirm the app builds and the invariants
hold. They can't judge whether a decision honors the project's own
argument, whether a "complete" feature is actually scope creep, or
whether a crash is a code problem or an infrastructure one — that
judgment happened by hand, logged as it happened in `process-notes.md`,
the most load-bearing moments promoted here.
