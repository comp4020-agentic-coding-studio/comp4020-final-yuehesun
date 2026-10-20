# 0011: What the simulation's numbers actually show, and don't

## Status

Accepted.

## Context

ADR 0010 explains why `scripts/simulate.ts`/`/simulation` exist and
draws a hard line: the page reports numbers, it never argues which
missed-window policy is fairest — that argument is ADR 0005's, made in
words, and doesn't need a number to be sound. That line raises an
obvious question: if the numbers can't settle the fairness question,
what are they actually for? This ADR reads the real `sim/results.json`
(50 seeds per policy) and says, plainly, what it does and doesn't show —
the analysis `/simulation` itself is not allowed to state.

The three policies' aggregate numbers (mean across 50 seeds):

| metric | wait-forever | eject | move-back-one |
|---|---|---|---|
| join-to-start wait, median (min) | 8.9 | 3.6 | 9.3 |
| join-to-start wait, p90 (min) | 17.7 | 5.3 | 53.2 |
| join-to-start wait, max (min) | 28.2 | 5.5 | 275.6 |
| moved back or ejected (count) | 0 | 49.9 | 417.2 |
| machine idle while someone waited (min) | 1889.3 | 0 | 0 |
| extra wait caused for others (min) | 0 | 179.3 | 1268.4 |
| extra wait paid by self (min) | 0 | 0 | 15561.1 |

## What this does show

**The idle-machine metric is a real, assumption-independent check that
the code does what it's supposed to.** `wait-forever` alone produces
1889 minutes of "a machine sat idle while someone waited behind an
absent front" — `eject` and `move-back-one` both produce exactly 0.
That's not a function of how aggressive the lateness assumptions are;
it's the direct, structural consequence of `eject`/`move-back-one` both
actively resolving a stuck front-of-queue reservation and `wait-forever`
never doing anything about it. This is the simulation doing what ADR
0010 says it's for: a volume of scenarios confirming the real code
behaves the way the rules say it should, not a guess validated by
reading the diff.

**`move-back-one`'s long tail is a structural property of the rule
itself, not an artefact of the aggressive lateness assumptions.** Its
median wait (9.3 min) is close to `wait-forever`'s (8.9 min), but its
p90 (53.2 min) and max (275.6 min) are far beyond either other policy's.
The reason is mechanical: nothing in `moveBackOnePlace` limits how many
times one reservation can be swapped backward in a row. A resident who
keeps missing their (freshly re-rolled, per ADR 0007/Stage 13's own
fix) claim window keeps losing one place at a time, with no cap. Making
the lateness assumptions more realistic would shrink the tail's length,
not remove the mechanism that produces it — the rule has no safeguard
against a long sequence of bad luck, independent of how likely that
sequence is.

**`eject`'s apparently low cost is a measurement gap, not a real
result.** `extraWaitPaidBySelfMinutes` is 0 for `eject` by construction:
`scripts/simulate.ts`'s own comment on this says why — an ejected
reservation is simply gone from the data once it happens, so no further
cost is ever attributed to it. The real cost (losing your place
entirely, needing to rejoin from the back) is exactly what ADR 0005
already argued against in words; this simulation doesn't measure that
cost's size because the metric wasn't built to follow a reservation past
the point it's deleted. Reading "`eject`'s self-cost is 0" as "`eject` is
cheap" would be a direct misread of what the number is counting.

## What this does not show, and isn't being used to show

This data does not settle, and is not being used here to argue, which
policy is fairest. That argument is ADR 0005's, made on grounds the
simulation can't touch (what cost is acceptable to impose on someone for
stepping away, not how many minutes it costs on average). A README or
PROCESS passage citing a conclusion like "the numbers above show
move-back-one is worse" would misuse this data exactly the way ADR 0010
warns against.

## Limitations of this simulation, stated plainly

- **The lateness assumptions are deliberately aggressive** (recorded in
  `MODEL`, shown on `/simulation`): roughly 50-57% chance of missing a
  single claim/start attempt, well above what's plausible for a real
  building. This inflates every metric that compounds over repeated
  attempts (`move-back-one`'s tail, most of all) more than it inflates
  one-shot metrics (`eject`'s numbers, which only ever reflect a single
  attempt per reservation).
- **It measures efficiency, not fairness.** Every metric here is a count
  or a duration. None of them represent "was this an acceptable thing to
  do to someone," which is the actual question ADR 0005 answers.
- **No fault injection.** Per ADR 0010, this isn't the canonical
  FoundationDB/TigerBeetle form of deterministic simulation testing —
  it's volume and randomness over normal use, not deliberate crashes or
  network faults.
- **Only one seed per policy is ever played back** (`/simulation`'s
  replay, the one closest to that policy's own mean swap count) — the
  aggregate table above reflects all 50 seeds per policy; the replay
  shows one representative day, not the full spread.

## A direction this surfaced, not a decision to build it

The long-tail finding above suggests a real, nameable question for a
future iteration of this app: should `moveBackOnePlace` cap how many
consecutive times one reservation can be swapped backward before some
other mechanism takes over (for example, routing it into Stage 3's
existing cross-machine offer instead of an indefinite in-place swap)?
This ADR doesn't answer that — it's recorded as a possible direction for
a second phase of the project, not a scoped feature, in `plan.md`'s
feature list.

## Decision

Keep `/simulation` exactly as scoped by ADR 0010 (numbers only, no
argument on the page); this ADR is where the reading of those numbers —
what they support, what they don't, and what's deliberately left out of
the page itself — lives instead.
