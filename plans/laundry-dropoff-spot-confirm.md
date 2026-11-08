# Drop-off follow-up plan — "machine is empty once anyone picks up" and the resident confirms the shelf spot

## Read first

- Overall vision and background: [`plan.md`](../plan.md) (feature #18).
- [`plans/laundry-dropoff-flow.md`](laundry-dropoff-flow.md) — the
  pick-up / place state machine (`IN_TRANSIT` sentinel, `carriedBy`).
- [`plans/laundry-handoff-decouple-from-claim.md`](laundry-handoff-decouple-from-claim.md)
  — claim is unconditional; `start()` is where "the drum must be empty"
  is enforced; the home page's "did you move it?" card.
- [`docs/adr/0013-laundry-handoff-authorization.md`](../docs/adr/0013-laundry-handoff-authorization.md)
  — who may move someone else's laundry. **Stage 2 below overrules one
  line of it** ("the server picks the spot"); a new ADR records that.
- `src/queue.ts` — `unacknowledgedLaundryOn`, `doneUnacknowledgedOnMachine`,
  `pickUpLaundry`, `placeLaundry`, `confirmHandoff`, `start`.
- `src/laundry-view.ts` — `openDropoffExamine`, `handleInteract`.
- `src/views.ts` — `handoffPromptCard`.

## Status

All three stages built and verified (specs, plus a Playwright run of the
3D drop-off click and the simulated-phone card). Waiting on the user's
hand-check of Stages 2 and 3. Design confirmed with the user in conversation
(2026-11-09). Each stage ends with a hand-check by the user before the
next begins (CLAUDE.md Workflow).

## Why this plan exists (what was observed)

Real use of the deployed build produced two reports:

1. **Machine looks full when it is empty.** After someone picks the
   previous laundry up and moves it, the next person is still told to
   pick up, and cannot start a wash.
2. **The drop-off table does nothing useful on the phone.** The 3D room
   shows a "shelf X is free" text; the phone shows no matching prompt.

### Diagnosis (checked against the code and the dev database)

**Report 1.** "Laundry is in the machine" is not a physical fact the app
can sense; it is inferred from rows: a `done` reservation on that machine
with `pickedUpAt IS NULL` and `pickupSpot IS NULL`. Two defects follow:

- `pickUpLaundry` / `confirmHandoff` move **one** row (`.get()`, no
  ordering). A machine holding several stale `done` rows (the dev DB has
  two on machine 3) shows the next one as soon as the first is handled —
  "I just picked up and it asks again".
- The 3D room reads a different function
  (`doneUnacknowledgedOnMachine`) that still counts an `IN_TRANSIT` row as
  "laundry on the machine", while `start()` already treats it as gone. So
  the two disagree about the same machine.

**Report 2.** `suggestedHandoff` only returns a card while the laundry is
still untouched in the machine (`pickupSpot IS NULL`). A resident who
picked up in the 3D room is `IN_TRANSIT`, so the card vanishes at exactly
the moment they go to the drop-off table. Separately, the written design
never had the phone show or take a shelf number; the user's intended flow
(below) is a different design, not a missing implementation.

## Stage 1 — "Anyone picked it up" means the machine is empty

**Rule (user's, settled):** once someone has moved the laundry out of the
machine, the machine counts as empty. Whether the owner later collects it
from the shelf is not the machine's business.

**Design choice and the failure it avoids.**

- One definition, used everywhere: *laundry is in the drum* ⇔ some `done`
  reservation on the machine has `pickupSpot IS NULL AND pickedUpAt IS
  NULL`. `start()`, `pickUpLaundry`, `suggestedHandoff`, and the 3D
  `unclaimedLaundry` field all read this one definition. Today the 3D
  field uses a second definition that counts `IN_TRANSIT`; it is switched
  to the shared one. Failure avoided: two readers disagreeing about the
  same machine.
- A successful pick-up (or the phone-only `confirmHandoff` path) **sweeps
  the whole machine**: the newest such row becomes `IN_TRANSIT` (the
  laundry actually being carried), and every older untouched `done` row
  on that machine gets `pickedUpAt = now`. Older rows are history that
  was never going to be tidied; leaving them would re-trigger the prompt.
  Failure avoided: "pick up once, asked again".
- Selection of the carried row is explicit (`ORDER BY id DESC`), not
  whatever `.get()` returns first. Failure avoided: carrying an arbitrary
  stale row and leaving the real latest one.
- Not changed: authorization (ADR 0013), the six spots, claim being
  unconditional, notices.

**Checks.**

- New spec: seed three `done` rows on one machine, one pick-up, then
  `start()` succeeds and the machine's state reports no unclaimed
  laundry. (This is the test that would have caught the bug.)
- New spec: while a row is `IN_TRANSIT`, `/laundry/machines-state` reports
  no `unclaimedLaundry` for that machine.
- Existing `spec/laundry-handoff.test.ts` still passes.

**Hand-check for the user:** in the 3D room, pick up once on a machine
that had stale laundry; the pickup prompt does not come back and Start
works.

## Stage 2 — The resident confirms the shelf spot on the phone

**Flow (user's, settled).**

1. Resident carrying laundry clicks the drop-off table in the 3D room.
2. The server proposes a spot (first free one) and stores it as that
   laundry's *intended spot*. The 3D text shows it.
3. The resident's home page shows a "where did you put it" card with the
   spot already filled in; they can change it to another free spot.
4. Pressing Confirm submits it. Only then is the spot written, and the
   original owner notified (existing `laundry_moved` notice).

**Design choices and the failures they avoid.**

- *The server computes the proposal, not the browser.* The old 3D text
  guessed from the client's last-known occupancy and could disagree with
  what the server later assigned. The propose call returns the spot, so
  the 3D text and the phone card are the same value.
- *Stored on the laundry row* (`reservations.intended_spot`, nullable,
  new migration via `drizzle-kit generate`; no `push`, no edits to
  generated files — CLAUDE.md schema rules). The 3D room and the phone
  can be two devices, so the hand-over must go through the server.
  Cleared when the spot is placed. It reserves nothing: two carriers may
  be proposed the same spot; the loser's Confirm is rejected (409) and
  the card re-renders with a fresh proposal. Failure avoided: a tentative
  reservation table with expiry logic for a collision that costs nothing.
- *The card is a `<select>` of free spots, and the server re-validates.*
  Submitted value must be one of `PICKUP_SPOTS` and currently free,
  otherwise rejected — the same "format or reject" discipline as room
  numbers (ADR 0004). Failure avoided: free text, or a stale/forged spot
  overwriting an occupied one.
- *The card shows in both states:* untouched laundry (phone-only path,
  front holder, no proposal yet — select defaults to the first free spot)
  and `IN_TRANSIT` (the 3D path). This is the fix for report 2's
  disappearing card.
- *`confirmHandoff(machineId, person, spot?)`* — `spot` optional so the
  existing single-call spec keeps working; precedence: explicit spot,
  then intended spot, then first free.
- *Live update:* the propose route triggers the existing SSE refresh so an
  already-open phone page gets the filled-in card without a reload. To
  check by hand: an open `<select>` is not reset while the resident is
  mid-edit.
- ADR 0013's "server picks the spot, never the acting room" is
  overruled for the *final* value: the acting resident confirms it,
  because only they know where the laundry physically went. Recorded in
  new **ADR 0017**; ADR 0013 gets a one-line "partly superseded" status
  pointer, its body untouched. `src/pickup-spots.ts`'s header comment is
  updated to match.

**Checks.**

- Spec: propose returns the first free spot and the phone card shows it;
  Confirm with that spot succeeds and notifies the owner.
- Spec: Confirm with an unlisted value (`A9`, `""`) → 4xx; with an
  occupied spot → 409; nothing written in either case.
- Spec: card is present for an `IN_TRANSIT` carrier (the regression for
  report 2).
- Spec: after Confirm, `intended_spot` is cleared and the spot is
  occupied.

**Hand-check for the user:** pick up in 3D, click the drop-off table,
watch the phone iframe's card appear with the number filled in, press
Confirm, then see the owner's notice.

## Stage 3 — The 3D drop-off text

Replace the two lines in `openDropoffExamine` with one message built from
the server's proposal: *"Laundry placed in slot A3. Tap here to submit
the placement."* The tap target opens the simulated phone (the existing
iframe mechanism) on the home page, where the Stage 2 card is waiting.
If the resident is not carrying anything, the table says so instead of
offering a spot. The pick-up prompt and basket behaviour are not touched.

**Hand-check for the user:** the wording above, and that the iframe lands
on the filled-in card.

## Ordering and notes

- Stages are committed separately; `pnpm check` green before each commit
  (specs need a scratch app on a port ≥ 8090, never 8080, killed and
  confirmed free afterwards).
- Stage 2 changes the schema, so its migration is committed with it.
- After Stage 2, log the decision in `process-notes.md` ("the earlier
  design had the server pick the shelf; I overruled it") — hash filled
  in only from `git log`.
- Update `plan.md`'s state and fold it into each stage's last commit.
