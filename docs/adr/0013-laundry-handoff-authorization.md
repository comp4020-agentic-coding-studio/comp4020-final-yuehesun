# 0013: Who may move someone else's finished laundry

## Status

Accepted. Partly superseded by [`0017`](0017-resident-confirms-shelf-spot.md): the
line "the server picks the spot" no longer holds — the resident confirms
it. The authorization boundary below is unchanged.

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
  functions alongside them (`isFrontWaitingHolder`, `firstFreeSpot`), per
  Stage 8's own constraint that pre-existing behaviour stay provably
  unchanged.

## Addendum: split into pick up / place (`plans/laundry-dropoff-flow.md`)

The original single `handoffLaundry()` is split into `pickUpLaundry()`
and `placeLaundry()` — this does not reopen the decision above, only
changes *when*, across how many requests, it takes effect. The front-
waiting-holder check above still gates pick up exactly as it gated the
old one-shot handoff. Place adds one more real authorization question
this ADR didn't need before, since there was no in-between state to ask
it about: who may place something that's already been picked up. The
answer is whoever is currently recorded (`reservations.carriedBy`) as
carrying it — not "whoever is still the machine's front waiting holder,"
since that may have changed by the time it's placed. The original
owner's acknowledgement step is unaffected either way.

## Addendum: `isFrontWaitingHolder` widened to include `claimed`
(`plans/laundry-handoff-decouple-from-claim.md`)

Claiming a machine used to be forced through the pickup flow first
(the 3D scene's own interaction made `canHandoffOn` override the
claim/QR overlay entirely whenever unclaimed laundry was present) —
`isFrontWaitingHolder`'s original `front.status === "waiting"` check
matched that: a resident was only ever asked to pick up laundry *before*
claiming, while still `waiting`. That ordering was reversed: claiming is
now always unconditional (never gated on this machine's laundry state),
and the pickup prompt is surfaced to the claiming resident only *after*
their own claim succeeds — by which point their own status has already
moved from `waiting` to `claimed`.

`isFrontWaitingHolder` now accepts `"waiting" | "claimed"` for the same
reservation/person that's front of the machine's queue. The underlying
authorization question is unchanged from the original decision above —
"is this the room the handoff is for" — only the statuses that still
count as "is this room" are widened to match what claiming itself does
to that status. Deliberately excludes `"running"`: `start()` gained its
own new precondition in the same plan (rejecting the start attempt
outright if `unacknowledgedLaundryOn` still finds a row on that
machine), so by the time a reservation is genuinely `running`, the
machine is already confirmed empty — a running resident has no
remaining reason to ever need `isFrontWaitingHolder` to return true for
this purpose.
