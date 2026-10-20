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

## Extension (Stage 14): a recorded playback, not a live trigger

The bar charts above answer "how much," not "what actually happened" —
a reader can't tell from a number that a swap is two specific rooms
trading places at a specific minute. The fix considered first, and
rejected, was a button on the deployed page that runs a fresh simulation
on demand: `src/db.ts`'s `db` and `src/clock.ts`'s clock are both
process-wide singletons with exactly one binding each, so running a
simulation in the same process as production would mean either writing
simulated rooms into the real database or hijacking every real visitor's
clock for the ~10-15 minutes the batch takes — there's no way to make
`queue.join()` write to a fake database on one call and the real one on
the next within a single process. Running it as a genuinely separate
process (its own Fly machine, its own database, its own clock) was also
rejected: it would turn one deployed app (ADR 0003's fixed decision) into
two coordinating services, a real jump in architecture for a testing
page, not a feature residents need live.

**Decision: the button plays back an already-recorded run; it never
triggers a new one.** `scripts/simulate.ts` additionally records one
seed's full day as a `ReplayFrame[]` per policy — the seed closest to
that policy's own mean `movedBackOrEjectedCount` (a typical day, not the
most dramatic one) — committed as part of `sim/results.json`, read
read-only by `/simulation` exactly like the existing numbers. The board
state labels (`src/board-state.ts`'s `boardStateFor`/`boardStateLabel`)
are shared with `src/views.ts`'s real board, extracted into their own
module so the replay and the real page can't silently disagree about
what a given state means — the same discipline this ADR already applies
to the queue rules themselves, applied one layer up to display logic.
Playback is pure client-side JavaScript stepping through the embedded
JSON; it plays once, start to finish, and stops on the last frame rather
than looping — a replay that loops silently becomes exactly the ambient
noise README's calm-technology argument warns against.

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
