# 0017: The resident confirms the shelf spot; the server only proposes

## Status

Accepted. Partly supersedes [`0013`](0013-laundry-handoff-authorization.md)
(only its "the server picks the spot" line).

## Context

`0013` and `plans/laundry-dropoff-flow.md` had the server choose the
shelf spot when laundry was placed, and the resident never touched a spot
number. Real use showed the problem with that: the app cannot sense a
physical shelf, and the only party who knows which cubby the laundry
actually went into is the resident carrying it. The phone also showed
nothing at the drop-off step, because the "did you move it?" card only
existed while the laundry was still untouched in the machine.

## Decision

- Clicking the drop-off table in the 3D room asks the server for a
  **proposal** (`POST /machines/:id/propose-spot`): the first free spot,
  stored as `reservations.intended_spot`. The 3D text shows it.
- The carrier's home page shows a card with a `<select>` of the free
  spots, **pre-filled with that proposal**. Pressing Confirm submits the
  spot (`POST /machines/:id/confirm-handoff`); only then is `pickup_spot`
  written and the original owner notified.
- The submitted spot must be one of `PICKUP_SPOTS` and currently free, or
  it is rejected and nothing is written (the same "valid format or
  reject" rule as room numbers, `0004`). The proposal reserves nothing: if
  two carriers are proposed the same spot, the second to confirm gets a
  409 and the card re-renders with a fresh proposal.
- The server, not the browser, computes the proposal, so the 3D text and
  the phone card cannot disagree.

## Consequences

- Who may move laundry (`0013`) is unchanged; only who decides the final
  spot changed.
- One new nullable column and its generated migration.
- A mis-typed or stale spot cannot overwrite an occupied one.
