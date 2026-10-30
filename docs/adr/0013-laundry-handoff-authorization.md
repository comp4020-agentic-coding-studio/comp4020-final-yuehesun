# 0013: Who may move someone else's finished laundry

## Status

Accepted.

## Context

Stage 8.4 (`plans/3d-walkthrough.md`) builds `plan.md`'s feature #18: if
the next person needs a machine before its previous owner has collected
their finished laundry, the next person can move it to a numbered
drop-off spot instead of waiting indefinitely. Every other action in the
app that touches a reservation goes through `loadOwned`, which only lets
a reservation's own room act on it (`docs/adr/0002`, `docs/adr/0004`).
This feature needs a deliberate, narrow exception to that rule: someone
other than the reservation's owner has to be allowed to change its state.

## Decision

The only room allowed to hand off a `done`, not-yet-`pickedUpAt`
reservation on machine `M` is whoever currently holds the front
`waiting` reservation on that exact machine `M` — i.e. the person the
handoff is *for*, not any room, not staff, and not whoever happens to be
nearby in the 3D scene. `handoffLaundry()` (`src/queue.ts`) checks this
directly (`isFrontWaitingHolder`), the same way the rest of the queue
already determines who is "front" for a machine, before touching
anything.

Once moved, the original owner is the only one who can confirm it was
collected: `acknowledgePickup()` is `loadOwned`-gated exactly like every
other per-reservation action, because that step *is* the owner acting on
their own reservation — no exception needed there, only on the handoff
step itself.

The server also picks which numbered spot to use, not the acting room —
a plain linear scan over the fixed spot list (`src/pickup-spots.ts`) for
the first one with no unacknowledged occupant. A spot picker was
considered and rejected: it reopens the same "two people pick the same
free slot at once" race that `nextJoinedAt`'s own fairness logic already
exists to avoid, for no benefit, since the acting room has no reason to
prefer one physically identical spot over another.

## Consequences

- This is the one place in the app where a room's actions change a
  reservation it doesn't own. It is scoped as tightly as the feature
  allows: exactly the machine's own next-in-line room, exactly once per
  `done` reservation, and the original owner still owns the
  acknowledgement half of the flow.
- `loadOwned`'s general rule is unchanged for every other action — this
  ADR documents an addition next to it, not a weakening of it.
- `src/queue.ts`'s existing exported functions (`join`, `claim`, `cancel`,
  `start`, `finish`, etc.) are untouched; the handoff logic lives in new
  functions alongside them (`handoffLaundry`, `acknowledgePickup`,
  `isFrontWaitingHolder`, `firstFreeSpot`), per Stage 8's own constraint
  that pre-existing behaviour stay provably unchanged.
