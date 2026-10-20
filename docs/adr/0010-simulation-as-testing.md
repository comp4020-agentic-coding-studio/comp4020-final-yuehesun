# 0010: The behaviour simulation is a testing practice, not a feature

## Status

Accepted.

## Context

ADR 0007 built a harness (virtual clock, seeded PRNG, the real `queue.ts`
functions) for two uses: property-based tests that check the queue's
rules never break, and a simulation that compares the three missed-window
policies (ADR 0005's "move back one place", crit 8's rejected "eject",
and a never-shipped "wait forever"). The simulation itself — a seeded
Saturday in a 100-resident building, run 50 times per policy — needed its
own argument for why it exists, separate from the harness it's built on:
is this a real testing practice, or just a feature added because the
machinery to build it existed?

## What this actually is

The shape — a real clock/randomness seam, a seeded PRNG driving the whole
run, the same seed reproducing the identical execution every time, the
real production code running inside the simulation rather than a copy of
its rules — is a recognised technique called **deterministic simulation
testing (DST)**, used in production by FoundationDB and TigerBeetle:
route every source of non-determinism (clock, randomness) through a
controlled seam, then a seeded PRNG makes an entire run a pure function
of one integer, so any run (and any bug it finds) is exactly
reproducible by reusing its seed. FoundationDB runs its real database
inside the simulator rather than a mock, for the same reason ADR 0007
rejects re-implementing the queue's rules a second time: a copy can
agree with itself while the real code is wrong.

This project's version is narrower than the canonical form. FoundationDB
and TigerBeetle pair DST with deliberate fault injection — killing
processes, dropping network packets, corrupting disk writes — specifically
to hunt for concurrency and crash-recovery bugs. Nothing here injects
faults; `scripts/simulate.ts` generates a large volume of *normal*
randomized use (when residents arrive, how late they are, whether they
take an offer) and measures the fairness rule's *outcomes* under it, not
its robustness against failure. ADR 0008's contention/restart specs are
this project's actual fault-injection-adjacent testing (simultaneous
requests, a real process restart) — that work already existed before
this ADR and isn't superseded by it. What's shared with canonical DST is
the mechanism (virtual clock, seeded PRNG, real code, reproducible runs),
not the full scope of what it's used for.

**Named `/simulation`, not `/fairness`.** The page and this ADR are about
the testing practice itself — a large volume of reproducible, randomized
scenarios run against the real code — not an argument about which
missed-window policy is fairest. The policy comparison is one output of
running it, not the reason it exists; naming it after that output would
overstate what it's actually for.

**What it's for, concretely:** not re-proving ADR 0005's decision — that
argument is already made in words (ejecting punishes the exact
stepping-away behaviour README exists to permit) and doesn't need a
number to be sound. It's for two things words alone can't give:

1. A volume of random, independently-generated scenarios no person would
   hand-write — the same category of result property-based testing is
   known for (John Hughes's work finding 200+ bugs in Erlang systems that
   example-based tests missed). ADR 0007's own property tests already
   demonstrated this directly on this codebase: `spec/fairness-properties.test.ts`
   caught a real concurrency bug in `moveBackOnePlace` (two same-millisecond
   joins tying `joinedAt`, silently turning the fairness swap into a
   no-op) before this simulation, or this ADR, existed — that fix landed
   in commit `8118424`. This ADR's simulation is the same family of
   technique applied at a different scale (one long reproducible run
   instead of many short random ones), not the origin of that particular
   find.
2. An honest order-of-magnitude for a decision already made, instead of
   none at all — `sim/results.json` reports real numbers (e.g. "move back
   one" producing far more swap events than "eject" under this model's
   assumptions), with the caveat stated plainly in the results and on
   `/simulation`: the behaviour model's lateness assumptions are
   deliberately aggressive (around 50-57% chance of missing a window on a
   single attempt), so the specific magnitude is not a measurement of a
   real building, and changing those assumptions changes the numbers.

## Decision

Keep it, framed as a testing practice rather than a user-facing feature:
it ships no route or UI a resident touches except the read-only
`/simulation` results page, and `CLAUDE.md`'s test harness rules already
forbid it from drawing a conclusion in `README.md`/`PROCESS.md` about
which policy is "better" — it reports numbers, the argument stays mine.

## Consequences

- `sim/results.json` and `/simulation` exist to document *how much* the
  existing decision costs, not to relitigate *whether* it was right.
- The behaviour model's assumptions (lateness rates well above what's
  plausible for a real building) are stated next to every number they
  produce, both in `sim/results.json` and on `/simulation` — a number
  without its assumption attached would overstate what this simulation
  actually shows.
- This is scoped as a testing/verification practice for the course's own
  research-note argument (`research-note.md`), not as evidence for
  README's "good" argument — the two are different documents making
  different claims, and this ADR's numbers belong in the former's sense,
  not the latter's.
- Running the full batch (50 seeds × 3 policies, ~126,000 simulated
  minutes total) inside one uninterrupted synchronous call stack hung the
  whole development VM badly enough to need a full restart, twice — fixed
  by yielding control back to the event loop periodically inside the
  simulation loop (`scripts/simulate.ts`'s `yieldToEventLoop`), recorded
  in `plans/crit-10.md`'s Stage 13 detail and `process-notes.md`. A
  genuine testing practice that takes down the machine running it is a
  real cost of this decision, not a reason to discard it, but it's one
  this ADR exists to be honest about alongside the behaviour-model
  caveat above.
