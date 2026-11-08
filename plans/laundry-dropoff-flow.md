# Laundry drop-off flow plan — making the carry-and-place a real two-step process

## Read first

- Overall vision: [`plan.md`](../plan.md) — feature #18 ("Unclaimed
  laundry handed off to a numbered pickup spot") is marked done there,
  from `plans/3d-walkthrough.md` Stage 8.4. This plan is the rework of
  that feature once real use (3D-room feedback, 2026-11-08) showed its
  carry-and-place animation doesn't correspond to any real two-step
  server state.
- [`plans/3d-walkthrough.md`](3d-walkthrough.md) Stage 8.4 — the original
  design: one-shot `handoffLaundry()`, a carried-basket prop, a
  proximity-triggered drop-off examine overlay. Read before touching
  `src/laundry-view.ts`'s basket code; this plan changes its state
  machine, not its visual shape (the wicker-frustum mesh, its scale, its
  clearance-from-body math — all from Stage 10 — are unaffected).
- [`docs/adr/0013-laundry-handoff-authorization.md`](../docs/adr/0013-laundry-handoff-authorization.md)
  — **the authorization decision this plan must not relitigate**: only
  whoever holds the front `waiting` reservation on the machine may act on
  someone else's `done` reservation; the original owner is the only one
  who can acknowledge pickup; the server picks the spot, never the acting
  room. Every change below keeps this boundary — it only changes *when*,
  across how many requests, the handoff takes effect.
- `src/queue.ts` — `handoffLaundry`, `acknowledgePickup`,
  `isFrontWaitingHolder`, `firstFreeSpot`, `unacknowledgedLaundryOn`,
  `doneUnacknowledgedOnMachine`, `doneUnacknowledgedFor`. This plan adds
  new functions alongside these; per Stage 8's own constraint (restated
  in `plans/3d-walkthrough.md`'s "What I check after this stage"), every
  *existing* exported function's behaviour must stay provably unchanged,
  covered by `spec/*.test.ts` continuing to pass unmodified wherever
  possible.
- `src/schema.ts` — `reservations.pickupSpot`/`pickedUpAt` columns, and
  the comment documenting their current one-step meaning (`pickupSpot`
  set = "handed off"; `pickedUpAt` set = "owner confirmed collection").
  This plan adds a new column; `CLAUDE.md`'s schema rule applies
  (`drizzle-kit generate`, commit the migration, never edit a committed
  one after the fact).
- `spec/laundry-handoff.test.ts` — the two existing tests drive the
  current one-shot flow end to end, including the six-spot-pool/reuse
  cycle. Both will need real changes once "handoff" becomes two steps;
  read them fully before changing `src/queue.ts`'s handoff functions, so
  the new tests keep covering what they already cover (pool exhaustion,
  reuse after acknowledgement, the authorization boundary) and don't just
  replace coverage with something narrower.
- `src/laundry-view.ts` — `buildBasket`/`setBasketVisible`/`setBasketKind`,
  `openHandoffExamine`/`openDropoffExamine`, `applyBasketState`,
  `/laundry/machines-state`'s `myBasketVisible` field (computed in
  `src/app.ts`). This is where the real, diagnosed bug lives (see
  Background below) — read the whole flow before writing a line of the
  new design, since the fix changes which side (server state vs. local
  JS variable) is authoritative for basket visibility.

## Background

**What prompted this.** Prompted by trying the deployed Stage 8.4/Stage
10 build and asking, directly: does the carried-basket-to-shelf animation
actually correspond to two real server-side steps (pick up, then place),
or is it one database write with a 3D performance bolted in front of it?
Investigated before writing anything below, not assumed:

- `handoffLaundry()` (`src/queue.ts`) is a single, atomic server call.
  The moment `POST /machines/:id/handoff` succeeds, `pickupSpot` is
  already written to the database and the original owner already has a
  notice (`notice: "laundry_moved"`) waiting for them — the handoff is
  **complete** at that instant, machine-wise and database-wise.
- `openHandoffExamine()` (`src/laundry-view.ts`) is what the 3D scene
  calls when a resident interacts with a machine holding someone's
  unclaimed laundry. It calls `POST /machines/:id/handoff` immediately —
  so the real handoff (spot assignment, owner notification) has already
  happened by the time the resident even sees "Picked up, carry this to
  the drop-off table."
- `openDropoffExamine()`'s own "Confirm placed" button — the moment that
  visually completes the carry — calls **no API at all**. It only clears
  a local JS variable (`pendingHandoffSpot = null`) and flips
  `setBasketKind("own")`, then calls `refetchMachineState()` to resync
  the basket's visibility from the server's own `myBasketVisible` field.

**Root cause of "the basket disappears/reappears unpredictably" and
"nothing shows up on the shelf visually."** Two separate, real bugs, not
one:

1. There is no third state between "holding someone else's laundry" and
   "done carrying it" as far as the server is concerned — `pickupSpot`
   was set the instant the laundry was picked up, not when it's placed.
   The shelf's own visual occupancy (`applySpotOccupancy`,
   `GET /laundry/machines-state`'s `occupiedSpots`) therefore already
   shows that spot as occupied from the moment of pickup, regardless of
   whether the resident's character has walked anywhere near the shelf
   yet — there's no moment where "picked up but not yet placed" is a
   real, distinguishable, server-known state. The 3D carry sequence is
   cosmetic from the server's point of view.
2. `setBasketKind`/`setBasketVisible`, called directly inside
   `openHandoffExamine`/`openDropoffExamine`, write to the exact same
   local variables `applyBasketState(myBasketVisible)` — driven by the
   server's own `/laundry/machines-state` response, refetched on every
   SSE `changed`/`machine-N` event — also writes to. Whichever one runs
   last wins. Since a handoff already changed real server state
   (`pickupSpot` set) the instant it started, the very next SSE-triggered
   refetch (which can arrive within the existing 500ms tick, independent
   of anything the resident does in the 3D scene) recomputes
   `myBasketVisible` from the real, already-updated database — and that
   server truth already says "not carrying anything," because as far as
   the server knows, the handoff already finished. The local
   "still carrying it until Confirm Placed" fiction loses the race
   essentially immediately, which is the real cause of the "basket is
   there, then it's gone" report: it's not timing jitter, it's two
   sources of truth for the same fact, and the server-derived one always
   eventually overwrites the client-only one.

**What the user asked for, restated precisely.** A real five-state
journey for one piece of laundry: owner's machine → (next person) picks
it up → carried → placed on a numbered shelf spot → owner collects it —
matching the real physical action more closely than today's "one click,
instantly done" shape. Plus two UI moments that don't exist today: a
confirmation prompt before picking up ("place the previous resident's
laundry on the shelf?"), and a confirmation/link after placing it ("you
placed it on Shelf A3 — open the app to let them know" — though per the
root-cause finding above, "let them know" already has to happen
somewhere in this sequence, so where exactly that notification fires is
one of this plan's real design decisions, not a detail).

## What this plan does NOT relitigate

- **Who may act.** `docs/adr/0013`'s authorization boundary (front
  waiting holder may initiate; only the original owner may acknowledge)
  is unchanged. The new "pick up" step keeps today's `isFrontWaitingHolder`
  check exactly as it is now.
- **How a spot is chosen.** The server still picks the first free spot —
  per-resident spot choice was already rejected in ADR 0013's own
  reasoning (the same race `nextJoinedAt` avoids), and nothing about
  splitting pickup from placement changes that argument.
- **The fixed six-spot list itself** (`PICKUP_SPOTS`). Not revisited —
  six was sized to the shelf model's own real capacity (Stage 9.2), and
  nothing here changes how many a resident might need at once.
- **The basket's visual shape** (Stage 10's tapered-frustum geometry,
  scale, body clearance). This plan only changes *when* the basket is
  visible and *what data* decides that, not what it looks like.
- **Scanning a machine's QR code itself** or the scan-to-home-page
  redirect (Stage 10, item 8) — the drop-off flow is reached by walking
  up to a machine/the shelf in the already-loaded 3D scene, the same way
  it is today, not via a new scan target.

## The real state machine

Today's two-value model (`pickupSpot: string | null`,
`pickedUpAt: number | null`) only distinguishes three states: in the
machine (`pickupSpot = null`), on a shelf (`pickupSpot` set,
`pickedUpAt = null`), and collected (`pickedUpAt` set). There is no slot
for "someone is currently carrying it, not yet placed anywhere." This
plan adds exactly one new state in between, rather than inventing a
wider scheme:

```
done, in machine         pickupSpot = NULL,        pickedUpAt = NULL
  |  (pick up — front waiting holder only, per ADR 0013)
in transit, being carried pickupSpot = 'IN_TRANSIT', pickedUpAt = NULL, carriedBy = <room>
  |  (place — same room who picked it up, at the shelf)
on a numbered shelf spot  pickupSpot = 'A3' (etc),   pickedUpAt = NULL, carriedBy = NULL
  |  (acknowledge — original owner only, unchanged from today)
collected                 pickupSpot = 'A3' (kept),  pickedUpAt = <time>
```

`'IN_TRANSIT'` is a sentinel value distinct from every real
`PICKUP_SPOTS` entry (`A1`-`A6`) — never collides with a real spot name,
and `occupiedPickupSpots()`/`firstFreeSpot()` must treat it as "not a
real spot" (excluded from both the occupied set and the free-spot scan),
since nothing is actually sitting in a numbered shelf cubby while it's
in transit. A new `carriedBy` column (nullable text, same `roomXXX`
format as `personName`) records who is currently carrying it — needed so
a "place" action can verify the carrier is the same room who picked it
up (not re-running `isFrontWaitingHolder`, since by the time it's placed
this room may no longer literally be the front waiting holder if, say,
their own reservation also progressed in the meantime — the real
authorization question for "place" is "are you the one currently
carrying this," not "are you still front of this machine's queue").

**Why a sentinel string on the existing `pickupSpot` column, not a new
enum/status column.** Considered and rejected: a separate
`handoffStatus` column (`'none' | 'in_transit' | 'placed'`) would need to
stay in sync with `pickupSpot` at every write (three states to keep
consistent with two columns instead of one), for no real benefit — every
existing reader of `pickupSpot` (`occupiedPickupSpots`, the 2D board,
`doneUnacknowledgedOnMachine`) already treats "is this column set" as the
meaningful question, and `'IN_TRANSIT'` fits that exact shape as long as
every reader excludes it from "this is a real occupied spot." The one
place this needs an explicit `!== 'IN_TRANSIT'` check added is
`occupiedPickupSpots()`/`firstFreeSpot()` — everywhere else (e.g.
`doneUnacknowledgedOnMachine`'s own `pickupSpot IS NOT NULL` exclusion,
written to also cover an already-handed-off reservation) the existing
"is it still waiting on this machine" semantics are unaffected, since
`pickupSpot` being set at all (in-transit or on a real shelf) already
correctly means "this reservation's laundry has left the machine."

## Server-side changes (`src/schema.ts`, `src/queue.ts`)

1. **Migration** (`drizzle-kit generate`, per `CLAUDE.md`): add
   `carriedBy: text("carried_by")` to `reservations`. Nullable, same
   shape/comment style as the existing `pickupSpot`/`pickedUpAt` columns.
   No change to any existing column's type or constraint — this is a
   pure addition, so the existing migration-tracking table reconciles
   cleanly (per `CLAUDE.md`'s own warning about never regenerating an
   already-applied migration).

2. **`pickUpLaundry(machineId, personName)`** (new function, replacing
   what `handoffLaundry` used to do in one step): keeps
   `isFrontWaitingHolder` exactly as today. Instead of calling
   `firstFreeSpot()` and writing a real spot immediately, it checks a
   free spot *exists* (reject with 409 if the pool is genuinely full —
   same user-visible failure as today, just checked one step earlier)
   but does **not** reserve one yet; a reservation forced to in-transit
   before a spot is actually assigned is the simplest way to avoid a
   spot being "claimed" by someone who never finishes the carry (see
   "Abandoned carries" below for what happens if they never place it).
   Sets `pickupSpot = 'IN_TRANSIT'`, `carriedBy = personName`. **Does
   NOT set `notice: "laundry_moved"` yet** — the original owner is not
   told until the laundry is actually placed somewhere, matching the
   real-world fact ("someone picked it up" isn't information the owner
   needs; "it's on Shelf A3" is).

3. **`placeLaundry(machineId, personName)`** (new function): finds the
   `done` reservation on this machine with `pickupSpot = 'IN_TRANSIT'`
   AND `carriedBy = personName` (not just "any in-transit reservation on
   this machine" — this is the real authorization check for this step,
   per the `carriedBy` design note above: only the person who actually
   has it can place it). 404 if nothing matches (nothing of this room's
   own is in transit here — covers both "never picked anything up" and
   "someone else already placed it," the same "stale state" class of
   case `handoffLaundry`'s own 404 already covers today). Picks a real
   spot via `firstFreeSpot()` (now first called at *this* step, with
   `'IN_TRANSIT'` excluded from the occupied set) — 409 if genuinely full
   (the pool could have filled between pickup and placement; this is the
   one new failure mode this split introduces, handled explicitly, see
   below). Writes the real spot, clears `carriedBy`, and **now** sets
   `notice: "laundry_moved"` on the original owner's reservation —
   deferred to exactly this point, unchanged in every other respect from
   today's single `handoffLaundry` write.

4. **Abandoned carries** (picked up, never placed — tab closed, or the
   resident just walks away in the 3D scene without visiting the shelf).
   Decision: **no server-side timeout/auto-release for this plan.**
   Considered an auto-revert-to-done-in-machine after some delay (mirror
   the existing `JOIN_DEDUP_WINDOW_MS`-style time constants elsewhere in
   `queue.ts`) and rejected for now — it adds a second background sweep
   (alongside the realtime tick) for a case that, in the worst case,
   leaves one reservation stuck "in transit" with nobody else blocked by
   it (the machine itself isn't held up; a `done` reservation isn't
   occupying the machine's active queue either way). The one real
   consequence is that the original owner never gets notified their
   laundry moved, because it technically never finished moving — matches
   reality (it didn't). If this turns out to matter in practice, a future
   pass can add a sweep the same way `settleMachine()`'s own tick already
   handles other time-based transitions, rather than guessing a timeout
   value now with no real usage data to tune it against.

5. **`unacknowledgedLaundryOn`/`doneUnacknowledgedOnMachine`/
   `doneUnacknowledgedFor`**: re-check each against the new `'IN_TRANSIT'`
   sentinel. `doneUnacknowledgedOnMachine` (used by the handoff-indicator
   logic to decide "does this machine still have someone's laundry
   waiting to be moved") should now also return the laundry while it's
   in transit — a machine's indicator shouldn't flip off the instant
   someone picks the laundry up, since from every other viewer's
   perspective the machine's own situation ("someone needs to deal with
   this") hasn't actually resolved yet; only placement does that.

## Client-side changes (`src/laundry-view.ts`, `src/app.ts`)

1. **`GET /laundry/machines-state`**: `myBasketVisible`'s own derivation
   (`src/app.ts`) needs a new case — carrying someone *else's* laundry
   in transit is now a real, separate, queryable server fact
   (`reservations.carriedBy = identity AND pickupSpot = 'IN_TRANSIT'`),
   not a client-only flag. This is the actual fix for the "basket
   flickers" bug: once this is true server-side for the whole duration of
   the carry, `applyBasketState`'s own SSE-driven refetch agrees with the
   3D scene's local state instead of racing it, because there's no longer
   a period where the server thinks the handoff is "done" while the
   resident is still notionally carrying it in the 3D scene. The server
   also needs to report **which kind** of basket-worthy state this is
   (own clothes vs. someone else's, in transit) so `setBasketKind` can be
   driven from the same server payload `applyBasketState` already reads,
   not set ad hoc inside the click handlers — removes the whole "two
   sources of truth" bug class, not just patches this one instance of it.

2. **`openHandoffExamine(machineId)`**: calls the new
   `POST /machines/:id/pickup` (renamed from `/handoff`, since it's no
   longer the whole handoff) instead of doing the spot assignment
   immediately. Per the user's own request, add a confirm step before
   this fires at all — an overlay asking "Move room123's finished laundry
   to the shelf?" with a real confirm button, not an immediate action on
   interact. (The existing `showExamineOverlay` mechanism already
   supports an overlay with a button and a callback — `openDropoffExamine`
   already does exactly this shape for "Confirm placed"; the new pickup
   confirm reuses the same pattern, not a new one.)

3. **`openDropoffExamine()`**: on "Confirm placed," calls the new
   `POST /machines/:id/place` (the machine id of the *source* machine the
   laundry came from — needed since `placeLaundry` looks up the
   in-transit reservation by machine, matching how `pickUpLaundry` is
   already scoped per-machine; `pendingHandoffSpot`/equivalent client
   state needs to track which machine's laundry is being carried, not
   just which spot was *going* to be used, since the real spot isn't
   chosen until this call succeeds now). On success, shows the real
   assigned spot (returned from this call, same shape as today's
   `{spot}` JSON) with the user's own requested closing message: "You
   placed room123's laundry on Shelf A3 — open the app to see it," with
   a real link to `/` (where the owner's own notice already renders,
   unchanged from today's `notice: "laundry_moved"` handling on the 2D
   board/status card) rather than assuming the carrying resident is also
   the one who needs to act on it next.

4. **Shelf occupancy visuals** (`applySpotOccupancy`,
   `dropoffSpotMeshes`): unaffected in shape — `occupiedSpots` from
   `/laundry/machines-state` already excludes `'IN_TRANSIT'` per the
   server-side change above, so a spot only visually shows as occupied
   once something is actually placed there, matching the real state
   machine instead of (as today) a spot becoming "occupied" the instant
   anyone picks anything up for it.

## What's still open — to confirm before writing code

- **Exact wording and placement of the two new confirm/info overlays** —
  drafted above as plain prose, not pixel-specified; matching the
  existing examine-overlay visual style (Stage 7's 2D panel, not a 3D
  in-scene element) is the plan, final copy to be refined when built,
  the same way Stage 8.4's own "exact visual treatment decided during
  implementation" note already applies to this feature's existing parts.
- **Whether "place" needs its own proximity/highlight target**, or
  continues reusing the existing single drop-off-zone-wide anchor
  (`dropoffAnchor`) Stage 8.4 already built. Current reading: reuse it
  unchanged — the zone-wide anchor was already a deliberate choice
  ("the interact action is a single zone-wide action," per its own
  comment), and nothing about splitting pickup from placement changes
  that reasoning.
- **Testing without a real phone scan.** Per the user: this whole feature
  is only reachable by walking up to a machine with real unclaimed
  laundry on it in the 3D scene, which in turn requires a real
  `done`-but-uncollected reservation existing — buildable entirely via
  direct HTTP calls against a scratch server (`join`→`claim`→`start`→
  `finish`, exactly as `spec/laundry-handoff.test.ts` already does, no
  scanning involved) for automated coverage; a real two-device/browser
  walkthrough of the 3D carry-and-place sequence itself is, per the
  user's own note, something to verify after deployment, not something
  the agent should attempt to fake with a scripted substitute in the
  interim.

## Real bugs found using the shipped two-step flow (2026-11-08, second pass)

Investigated before writing anything below, not assumed — each item
below traces to the exact function and line, not a guess at the cause.

### Bug A: the owner's home-page notice fires too early, with the wrong spot name

`doneUnacknowledgedFor(personName)` (`src/queue.ts`) is what
`GET /laundry/machines-state` and the home page both read to decide
whether to show the owner a "your laundry was moved" card
(`pendingPickupCard`, `src/views.ts`). Its `WHERE` clause only checks
`status = 'done' AND pickedUpAt IS NULL` — it does **not** exclude
`pickupSpot = 'IN_TRANSIT'`. `pendingPickupCard` itself only checks
`item.pickupSpot != null` before rendering. The two combined mean: the
instant `pickUpLaundry()` runs (laundry merely picked up, not yet
placed), the owner's own home page already renders "Your laundry was
moved to Shelf IN_TRANSIT" — before anything was actually placed
anywhere, and showing the internal sentinel string instead of a real
spot name.

This is the same class of bug `doneUnacknowledgedOnMachine()`
(`src/queue.ts`) already got right on purpose — its own comment
explicitly says it *should* keep returning a row during `IN_TRANSIT`,
because the machine's situation ("someone needs to deal with this")
hasn't resolved yet. `doneUnacknowledgedFor` needs the opposite
exclusion for the opposite reason: the *owner* doesn't need telling
anything until there's a real spot to tell them about, which is also
exactly what the code comment on `placeLaundry()` already says ("deferred
to this point, since this is the first moment there's something real to
tell them about") — the notice-firing code just never enforced it.

**Fix:** add `pickupSpot !== 'IN_TRANSIT'` (or, in Drizzle terms, exclude
the sentinel the same way `occupiedPickupSpots()` already does) to
`doneUnacknowledgedFor`'s own query. No change needed to
`pendingPickupCard` itself once the underlying query stops returning an
in-transit row — the existing `item.pickupSpot != null` check becomes
correct once it's never fed the sentinel.

**Separately, the in-scene confirmation copy overstates what the
resident placing it needs to do.** `openDropoffExamine()`'s success
message currently reads "You placed the laundry on Shelf A3 — open the
app to let them know," worded as if telling the owner is a manual step
left to the person who just placed it. It isn't — `placeLaundry()`
already writes `notice: "laundry_moved"` to the owner's own reservation
server-side, same request, no separate action needed. Once Bug A above
is fixed, the owner's own home page will show that notice on its own,
on its own next refetch, with no action from the carrier. The copy
should say that plainly ("they'll see it on their own home page")
rather than implying a manual notify step the system already performs.

### Bug B: a machine shows "still needs pickup" even after the laundry is already on a real shelf spot

`doneUnacknowledgedOnMachine(machineId)` (`src/queue.ts`) — read by the
3D scene's own `canHandOff`/`unclaimedLaundry` indicator
(`GET /laundry/machines-state`) to decide whether a machine still shows
"someone's laundry needs moving" — filters only on `status = 'done' AND
pickedUpAt IS NULL`. It never looks at `pickupSpot` at all. Since
`pickedUpAt` is set only once the *original owner* acknowledges
collection (a separate, later step the carrier has no part in), this
function can't distinguish three real, different states: still in the
machine (`pickupSpot = NULL`), in transit (`'IN_TRANSIT'`), and already
on a real numbered shelf spot (`'A1'`..`'A6'`). A resident who already
placed the laundry on Shelf A3, then walks back to the now-empty
machine, still sees "this machine has laundry that needs moving" —
because, per this query, it technically does, just not on the machine
anymore.

**This collides with `canHandOff`'s own authorization logic in a
confusing way once fixed naively**: `canHandOff` is
`front?.person === identity && front.status === 'waiting'` — true for
whoever is now front of this machine's queue, regardless of what
`doneUnacknowledgedOnMachine` returns. The *indicator* (should the
machine show "laundry needs attention") and the *action* (can this
specific viewer do something about it) are two different questions that
happen to share one data source today. The real fix needs
`doneUnacknowledgedOnMachine` to stop treating "already on a shelf spot"
the same as "still needs someone to move it":

**Fix:** `doneUnacknowledgedOnMachine` should only return a row when
`pickupSpot IS NULL OR pickupSpot = 'IN_TRANSIT'` — i.e., still
something *this machine's* front-of-queue resident could or did pick up.
Once a real spot (`'A1'`..`'A6'`) is written, the machine itself is done
with this reservation entirely; the only remaining open question is the
owner's own acknowledgement, which `pendingPickupCard`/the home page
already handles independently (once Bug A's fix lands) and has nothing
to do with the machine's own display. This is a one-line change to an
existing `WHERE` clause, not a new function — `occupiedPickupSpots()`
already demonstrates the exact `!== IN_TRANSIT`-style exclusion pattern
this needs, just applied to a different column value set.

**Spec coverage needed for both A and B:** `spec/laundry-handoff.test.ts`
gets two new assertions once this lands — after `pickUpLaundry` but
before `placeLaundry`, the owner's own `doneUnacknowledgedFor` must NOT
yet include this reservation (Bug A); after `placeLaundry`, the
*machine's* own `doneUnacknowledgedOnMachine` must return nothing for
this machine (Bug B), while the owner's own `doneUnacknowledgedFor`
*does* now include it. Both are two-line additions to the existing
pickup-then-place test sequence, not new test files.

### Investigated, not a bug: the carried basket model doesn't visually travel to the shelf

Confirmed by reading `buildBasket()`/`characterRoot.add(basketMesh)`
(`src/laundry-view.ts`): the carried-basket mesh is a single prop
permanently parented to the local character (`characterRoot`), toggled
on/off via `setBasketVisible()`. It has never been moved to, or rendered
near, the shelf/bookcase models. The shelf's own occupancy display
(`dropoffSpotMeshes`, recoloured by `applySpotOccupancy`) is a separate,
independent visual — a flat marker plane per spot, changing colour
between `SPOT_FREE_COLOR`/`SPOT_OCCUPIED_COLOR` — not a basket model
being placed anywhere. This matches the plan's own original scope note
above ("this plan only changes *when* the basket is visible and *what
data* decides that, not what it looks like") — the basket's travel from
character to shelf was never meant to be a literal moved 3D object, only
a visibility toggle plus a colour change on the destination. Not a bug;
recorded here only because it was checked directly rather than assumed,
per the user's own question.

### A real, unhandled edge case: carrying someone else's laundry while also holding your own

`GET /laundry/machines-state` (`src/app.ts`) computes `basketKind` as a
single, mutually-exclusive value: `carrying != null ? "other" : "own"`.
This never considers `activeMine`/`doneMine` (the viewer's own
in-progress or done-but-uncollected laundry) once `carrying` is
non-null. Since `MAX_ACTIVE_PER_TYPE = 2` lets one room hold two active
reservations of the same machine type at once, a real resident can be
genuinely carrying their own just-finished load home from one machine
while also being the front-waiting-holder entitled to move a *different*
room's unclaimed laundry off a second machine — the two situations are
not mutually exclusive in the data model, only in what `basketKind`
currently reports.

Because `basketMesh` is one prop with one colour/kind at a time (see
above), there is no way to show "carrying two different things" as two
distinct objects without building a second mesh — out of scope for this
bug-fix pass. **Recommended minimal fix, to confirm before building:**
keep one basket mesh, but make `carrying != null` take priority in the
reported `basketKind` only while actually mid-carry (which is already
today's behaviour) and accept the real limitation — the viewer's own
basket becomes visually indistinguishable from the one they're
carrying for someone else, for the duration of that one carry. This is
a genuine, acknowledged simplification, not a fix to pretend otherwise;
documenting it here (and, if judged worth it later, adding a distinct
second small prop for "your own basket, parked" during a carry) is a
separate, larger follow-up this plan doesn't scope now. No code change
recommended for this item in the immediate fix pass — surfaced for the
user's own call on whether it's worth a follow-up stage.

## Bugs A and B: fixed and verified (2026-11-08, third pass)

Both one-line `WHERE`-clause fixes, built in an isolated worktree
(`.claude/worktrees/dropoff-flow-fixes`) per the user's own instruction
not to edit the checkout another session was actively using.

- **Bug A** (`doneUnacknowledgedFor`, `src/queue.ts`): excludes
  `pickupSpot = IN_TRANSIT`, so the owner's home page no longer shows
  "Your laundry was moved" before it's actually been placed anywhere.
  **A real mistake caught before verifying, not after**: the first
  attempt wrote this as a bare `ne(pickupSpot, IN_TRANSIT)`. Checked
  directly against a real SQLite query before trusting it (not assumed):
  SQL's `<>` on a `NULL` column evaluates to `NULL`, not `TRUE`, so that
  exclusion would have silently dropped every reservation whose laundry
  is still untouched in the machine (`pickupSpot IS NULL`) — the single
  most common case this function needs to keep returning. Fixed to
  `or(isNull(pickupSpot), ne(pickupSpot, IN_TRANSIT))` before this was
  ever tested against the running app, the same explicit-NULL-handling
  shape `occupiedPickupSpots()` already uses (via a JS-side `!= null`
  filter instead, since that one runs after the query).
- **Bug B** (`doneUnacknowledgedOnMachine`, `src/queue.ts`): now also
  requires `pickupSpot` to be `NULL` or `IN_TRANSIT` — once a real spot
  (`'A1'`..`'A6'`) is assigned, the machine itself is done with this
  reservation, so it stops reporting "still needs attention" for laundry
  that's already sitting on a shelf.
- The confirm-overlay copy at the end of `placeLaundry`'s client-side
  success handler (`src/laundry-view.ts`) was reworded from "...open the
  app to let them know" (implying a manual notify step) to "...the owner
  will see it on their own home page" (accurate: `placeLaundry()` already
  wrote the owner's notice server-side, same request).

**Verified against the real running app, not just read**: a scratch
server (port 8099, a throwaway `DATABASE_PATH`, never 8080/`.data/app.db`)
drove the exact two-room sequence the user's own test manual above
describes — join, scan, claim, start, finish on machine 1 (room A, the
1-minute "test" wash type), then room B joining the same machine,
picking up, and placing. Confirmed directly:
- Room A's own home page showed no notice at all immediately after
  `pickup` (the Bug A regression window) — grepped for the actual
  rendered notice text, not just that the route returned 200.
- Room A's home page showed the correct notice, with a real spot name
  (`Shelf A1`), only after `place` succeeded.
- Room B's own `/laundry/machines-state` view of machine 1, after
  placing, no longer carried an `unclaimedLaundry` field at all (the Bug
  B regression check) — previously this field persisted even after a
  real spot was assigned.

**A real false alarm during verification, caught and correctly
attributed, not left unresolved.** `pnpm test` first reported 5 failures
unrelated to Bugs A/B (contention, offer, and one other handoff test) —
investigated rather than dismissed as "flaky." Re-running the exact same
suite against a *freshly wiped* scratch database passed all 46 tests;
re-running with `--fileParallelism=false` (this project's own configured
default, confirmed in `vitest.config.ts` — every spec shares one running
app's state, so files already run one at a time, not in parallel) also
passed cleanly on the already-stale database. The actual cause: the
scratch database used for the failing run had already been driven
through the manual room9001/room9002 verification sequence above, in the
same session, without being wiped first — a self-inflicted test-pollution
incident, the same class of mistake `CLAUDE.md`/`process-notes.md`
already document from an earlier session, not a defect in Bugs A/B's own
fix. Confirmed, not assumed: the identical suite against a clean database
file passed before this was called resolved.

`pnpm check`: 15 files, 46 tests, green against a freshly wiped scratch
server. `src/queue.ts`'s existing exported function signatures are
unchanged (only their `WHERE` clauses gained conditions); no schema
migration needed for this fix pass.

## Rough build order (for the stage/commit split when this is picked up)

1. Migration + `carriedBy` column, `pickUpLaundry`/`placeLaundry`
   replacing `handoffLaundry`, `'IN_TRANSIT'` exclusion everywhere
   `occupiedPickupSpots`/`firstFreeSpot` is read. Update
   `spec/laundry-handoff.test.ts` to drive the two-step flow (pickup then
   place) instead of one call, keeping its existing coverage (six-spot
   exhaustion, reuse after acknowledgement, the authorization boundary)
   intact across the split, plus new cases for: an unauthorized "place"
   by someone other than the carrier, placing with the pool genuinely
   full (the new failure mode item 3 above calls out), and the indicator
   staying "visible" through the in-transit window (item 5 above).
2. `src/app.ts` route changes (`/pickup`, `/place`, the `isMine`-style
   basket-kind/in-transit fields added to `/laundry/machines-state`).
3. `src/laundry-view.ts`: the two new confirm/info overlays, basket-state
   now driven entirely from the server payload (removing the
   `setBasketKind`/`setBasketVisible` calls currently made directly
   inside the click handlers), shelf-occupancy visuals unchanged in code
   shape but now correct in behaviour as a consequence of item 1.
4. A real build-and-verify pass the same way Stage 10 did (scratch
   server/database, Playwright screenshots, direct HTTP checks of the new
   routes) for everything reachable without a phone — explicitly
   excluding a real end-to-end phone-scan rehearsal of the full carry
   sequence, which per the user's own note waits for the next real
   deployment.
