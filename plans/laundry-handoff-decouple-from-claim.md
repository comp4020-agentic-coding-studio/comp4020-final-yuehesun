# Decoupling claim from the laundry-handoff detour — plan

## Status

Built and verified. Design confirmed with the user across several
rounds of back-and-forth (see "Revision history" at the end); every
build-order step completed, verified against a real running scratch
server (not just read), and covered by new automated spec cases — see
"Built and verified" at the end of this file for the full record,
including two real mistakes found and fixed during verification (an
HTML-escaping assertion mismatch, and a genuine state-ordering bug in
one new test's own setup).

## Read first

- Overall vision: [`plan.md`](../plan.md) — the User story's own framing
  of claim ("Claiming means the machine is theirs because they've
  arrived") and the fairness rule (`docs/adr/0005`): a 3-minute claim
  window that starts the moment the machine is free for you, regardless
  of anything else going on.
- [`plans/laundry-dropoff-flow.md`](laundry-dropoff-flow.md) — the
  existing pick-up/place design (`pickUpLaundry`/`placeLaundry`,
  `IN_TRANSIT` sentinel, `carriedBy` column) and its own "bugs found"
  section (two real bugs just fixed around notice timing). This plan
  does not relitigate that state machine — it changes *who triggers it,
  from where, and when it's allowed to run*, and adds one new precondition
  to `start()`, not the pick-up/place state machine itself.
- [`docs/adr/0013-laundry-handoff-authorization.md`](../docs/adr/0013-laundry-handoff-authorization.md)
  — the authorization boundary (only the machine's front
  waiting-or-further-along holder may move someone else's laundry; only
  the original owner may acknowledge collection). This plan's core
  change (letting a claimed holder, not just a still-`waiting` one,
  trigger a pickup) is a real, narrow widening of this boundary —
  flagged explicitly below, not snuck in as a side effect.
- `src/queue.ts` — `settleMachine`/`claim`/`start` (the claim-window
  timer: `turnStartedAt`, `CLAIM_WINDOW_MS = 3 * 60_000`, set the instant
  the machine frees up for you, with no dependency on, or pause for,
  anything else happening on that machine; `start()` currently only
  checks `row.status === "claimed"` — this plan adds a second
  precondition, see below), `isFrontWaitingHolder` (currently
  `front.status === "waiting"` only — this plan needs it to also cover
  `claimed`, see below), `unacknowledgedLaundryOn` (private, the
  authoritative "is there really still laundry in this machine" check
  `pickUpLaundry` uses — this plan's new `start()` precondition reuses
  this exact check, not a re-derivation of it) vs. `doneUnacknowledgedOnMachine`
  (exported, the display-shaped version the 3D scene/home page already
  read — same underlying fact, different return shape; **do not confuse
  the two when building**), `occupiedPickupSpots`/`firstFreeSpot`
  (`firstFreeSpot` is private, called only from inside `placeLaundry` —
  this plan's "suggested spot" display needs its own read path, not a
  call to this private function; see "Suggested spot display" below).
- `src/laundry-view.ts` — `handleInteract()`'s current branching
  (`canHandoffOn[id] ? openHandoffExamine : openMachineExamine` — today,
  mutually exclusive; this plan removes the 3D scene's own role in
  deciding this by machine state, see "What changes" below), the
  existing `EventSource("/events")` / `refetchMachineState()` /
  `applyMachineState()` loop (already fires on every relevant state
  change — this plan's "swap the overlay to a pickup prompt the instant
  claim succeeds" reuses this exact mechanism, no new transport), the
  front-end's own separately-hardcoded `PICKUP_SPOTS` array (line ~623,
  duplicated from `src/pickup-spots.ts` — pre-existing duplication, not
  introduced by this plan, but worth a one-line note since the
  suggested-spot display reads this copy).
- `CLAUDE.md`'s App rules: *"No accounts or login, and no names... a
  room holds at most 2 active reservations per machine type"* and the
  schema discipline (`pickupSpot` is always server-assigned from the
  fixed `PICKUP_SPOTS` list, never typed in by a resident — see
  `src/pickup-spots.ts`'s own comment, which cites this exact
  discipline). The user's own refined design (below) keeps this intact:
  the 3D scene only ever *suggests* a spot for display, the real
  assignment still happens server-side, atomically, at the moment of the
  phone's own confirm action.

## Background — what prompted this

Investigated directly in the running app (3D scene + `src/queue.ts`),
not assumed, before any design below:

**The real sequencing problem.** `settleMachine()` starts a resident's
3-minute claim window (`turnStartedAt`) the instant the machine frees up
for them — this has nothing to do with whether the machine still holds
the previous resident's unclaimed laundry. The *original* version of
today's 3D-scene interaction made `canHandoffOn[machineId]` (true
whenever this machine has unclaimed laundry AND the viewer is its front
waiting holder) override the machine-interact action entirely: walking
up to the machine and interacting opened *only* the pick-up confirm
overlay, never the QR/claim overlay, until the laundry was actually
moved — forcing an unrelated chore in front of the one thing that
actually protects the resident's queue position, with no pause on the
3-minute window.

**Core principle, stated plainly, confirmed with the user.** The queue
itself — reserving a turn, claiming it before the window expires,
running the wash — is the app's one load-bearing job (`plan.md`'s entire
User story, `README.md`'s entire argument). Handing off a previous
resident's uncollected laundry (`plans/laundry-dropoff-flow.md`, feature
#18 in `plan.md`'s feature list) is explicitly an **additive, secondary**
convenience — it exists so the next resident isn't blocked by someone
else's forgetfulness, not so the queue mechanism can be blocked by it.
Claiming a machine must never be contingent on handling anyone else's
laundry, through any UI, at any point before the resident has genuinely
claimed it.

**Where the real physical constraint actually lives — settled only after
several rounds of correction.** An earlier draft of this plan proposed
gating the pickup prompt on the resident's reservation reaching
`"running"` — wrong, caught by the user directly: `"running"` means the
wash has actually started, by which point the machine's drum already has
to be empty of the previous resident's laundry or nothing could
plausibly be washing. The real, physically-grounded constraint is
narrower and earlier: **`start()` — the action that claims the drum is
now in use — is where "is the machine actually empty" has to be checked**,
not `claim()` (which only claims a queue position, no physical
constraint yet) and not `running` (which already presupposes the
constraint was satisfied). This reframing is what makes the whole
design click into one coherent flow: claim is unconditional; pickup is
prompted the instant it's claimed, since from that moment it's genuinely
the claiming resident's problem to solve before they can start; start is
where the server actually enforces that the problem was solved.

## What changes, concretely

### 1. Claim is always unconditional — the 3D scene's machine interaction
   no longer branches away from the claim/QR overlay based on
   `canHandoffOn`

`handleInteract()` for a `"machine"` interaction always opens the real
claim/QR overlay (`openMachineExamine`) **the first time the resident
walks up to an unclaimed machine**, regardless of whether it's also
holding unclaimed laundry. The old mutually-exclusive branch
(`canHandoffOn[id] ? openHandoffExamine : openMachineExamine`) is
removed for the *initial* interaction. What replaces it, for the
already-claimed case, is described in point 2 — this is not "the pickup
prompt never appears in the 3D scene," it's "it never appears *before*
claim succeeds."

### 2. The moment claim succeeds, two independent things start happening
   — one in the 3D scene, one on the home page — and they do not wait on
   each other

**3D scene: the overlay itself flips from QR code to a pickup prompt.**
The 3D scene already listens to the real-time `/events` SSE stream and
refetches machine state on every change (`refetchMachineState()` →
`applyMachineState()`) — this is the exact same mechanism that will
notice "this reservation is now `claimed`" regardless of whether the
claim happened via a real phone scan, the phone-simulator iframe, or
(if the resident happened to be standing right at the machine) some
other path. When the currently-open examine overlay belongs to a
machine whose reservation just became the viewer's own `claimed` one,
AND `unacknowledgedLaundryOn`'s underlying fact (exposed to the client as
`unclaimedLaundry`, already computed server-side) is true for that
machine, the overlay's content is swapped from the QR/claim HTML to:
*"You've claimed this machine. Take out the previous resident's
laundry?"* with a "Pick up" button — the exact same confirm-then-call
`pickUpLaundry()` flow `openHandoffExamine`/`doPickup` already implement
today, just reached by a state-change swap instead of a branch on
initial interact. If there's no unclaimed laundry on the machine, the
overlay simply closes/stays on a plain "Claimed" acknowledgement — no
pickup step needed, nothing forced.

**Home page: the "did you move it?" card appears, independently, the
instant claim succeeds — regardless of what's happening in the 3D
scene.** This is not gated on the 3D-scene pickup step at all. The
moment a resident's `claim()` succeeds on a machine that has (or
recently had) unclaimed laundry, their home page gains a standing card
(computed fresh on every render, same shape as `dryerPromptCard`): *"Did
you move [previous room]'s laundry to the drop-off area? [Yes] [No]"*.
This card's own visibility condition and dismissal behavior is specified
fully in point 5 below (it has its own data-recording needs, independent
of whatever pickupSpot state is doing).

### 3. `start()` gains a real, enforced precondition: the machine must
   actually be empty of the previous resident's laundry

This is the one actual behaviour change to existing queue logic (every
other change in this plan is additive/new). `start(reservationId,
personName)` (`src/queue.ts`) currently only checks
`row.status === "claimed"`. It gains a second check, using the exact
same underlying fact `pickUpLaundry` already checks via
`unacknowledgedLaundryOn(machineId)` (not `doneUnacknowledgedOnMachine`,
which is the display-shaped export — reuse the authoritative private
check, or export a differently-named thin wrapper around the identical
query if `start()` lives in a context that needs it exported; do not
duplicate the query logic). If `unacknowledgedLaundryOn(machineId)`
still finds a row, `start()` rejects with a clear, distinct message
(e.g. `"move the previous resident's laundry out first"`) — rendered
through the existing inline-rejection mechanism Stage 6.1 already built
for `claim()`'s own scan-gate rejection (`src/app.ts`'s htmx-aware
`actionRoute`-equivalent handling), not a new mechanism.

This is what actually enforces the physical constraint — not UI framing,
not a confirm dialog the resident could theoretically ignore, a real
403/409 from the server the instant they try to start a wash on a
machine that (per the server's own authoritative state) still has
something else's laundry in it.

### 4. Authorization: who may trigger `pickUpLaundry` now

**This is a real, deliberate widening of `docs/adr/0013`'s boundary,
stated explicitly.** Today, `isFrontWaitingHolder()` requires
`front.status === "waiting"`. Once a resident claims (status becomes
`claimed`), that check starts failing for the very person this plan
wants to let act (per point 2's 3D-scene flow, which fires only *after*
claim succeeds). Fix: `isFrontWaitingHolder` (or a differently-named
check reusing its shape) must accept `"waiting" | "claimed"` for the
same reservation/person that's front of this machine's queue — "is this
the room currently holding this machine's front position in any
not-yet-started sense," not literally "haven't claimed yet." (`running`
is deliberately excluded from this widened set — once running, per point
3, the machine is already confirmed empty, so there is nothing left to
pick up; a `running` resident has no reason to ever need
`isFrontWaitingHolder` to return true for this purpose.) This needs its
own line in `docs/adr/0013`'s own addendum section (it already has one
addendum for the pick-up/place split) rather than a silent behavioural
change to an existing authorization function.

### 5. The home-page "did you move it?" card — visibility, dismissal, and
   what "Yes" actually does

- **Appears**: the instant the resident's own `claim()` succeeds on a
  machine where `unacknowledgedLaundryOn` is true at that moment. Framed
  as independent of the 3D-scene pickup prompt (point 2) — a resident
  using the phone-simulator (where claim and "viewing the 3D scene" are
  the same browser tab) will see both roughly together; a resident on a
  genuinely separate physical phone will see this card on their phone
  regardless of whether they ever interact with the 3D scene's own
  pickup overlay at all. Neither path is required for the other to work.
- **One card per machine, confirmed with the user.** Since
  `MAX_ACTIVE_PER_TYPE = 2` lets a resident hold two active reservations
  at once, if both happen to have unclaimed laundry sitting in them, the
  resident sees **two independent cards**, each named by machine (e.g.
  "Did you move the laundry on Washer 4 to the drop-off area?" and a
  separate one for Washer 7) — not merged into one ambiguous prompt.
  Each is independently dismissible/actionable; dismissing or acting on
  one has no effect on the other.
- **"No"**: the card disappears and **stays gone for this specific
  claim** — a new boolean column on `reservations` (name TBD, e.g.
  `handoffPromptDismissed`, same 0/1 shape as the existing
  `dryerPromptDismissed`), checked alongside the visibility condition
  above. Needs a migration (`drizzle-kit generate`, one column, never
  hand-edited after commit, per `CLAUDE.md`).
- **Disappears on its own, with no action**: once this resident's own
  reservation on this machine leaves the `claimed` state (either
  `start()` succeeds — meaning the laundry was necessarily moved, since
  point 3 now blocks `start()` otherwise — or the reservation is
  `cancelled`). Falls out of the existing state machine for free, no new
  cleanup job.
- **"Yes"**: this is where the real spot assignment happens — see point
  6, "What 'Yes' actually does," which folds together the two things the
  user asked to combine (confirming the pickup-in-progress and reporting
  the final spot number) into one real server call.

### 6. The 3D scene's own drop-off-shelf interaction: a *suggested* spot
   display only — no new database table, no real assignment happens here

Per the user's own reasoning, confirmed directly: the 3D scene is a
simplified stand-in for a real physical shelf the app has no way to
sense directly — the only real, authoritative data about which spots are
occupied comes from residents' own phone-side reports (exactly how
`placeLaundry()` already works today). The question investigated and
settled: should walking up to the drop-off table and interacting in the
3D scene reserve/pre-claim a real spot (needing new state — a
"tentatively occupied" table or column, with its own expiry/release
logic for an abandoned pre-claim), or should it merely *display* a
locally-computed guess with no database write at all?

**Decision: display only, no write, no new table.** The 3D scene already
receives `occupiedSpots` on every `machines-state` refetch
(`lastKnownOccupiedSpots`, already tracked client-side) and already has
its own copy of the fixed spot list (`PICKUP_SPOTS`, line ~623). Walking
up to the drop-off table and interacting computes "the first entry in
`PICKUP_SPOTS` not in `lastKnownOccupiedSpots`" **purely client-side**,
for display only ("Looks like Shelf A3 is free — "), and does nothing
else. The real, atomic assignment still happens exactly as it does
today, inside `placeLaundry()`'s own `firstFreeSpot()` call, server-side,
at the moment the phone-side confirm action actually runs (point 6b
below). Two different residents' 3D scenes could theoretically display
the same *suggested* spot for a brief window if both are mid-carry at
once — this is a cosmetic, extremely low-probability mismatch (this app
runs at one-residence scale, not a scale where this collision is likely
to matter in practice), not a data-integrity issue, since nothing is
actually written until the real server-side call. Building a
tentative-reservation system to close this cosmetic gap was considered
and rejected: it would need its own new state (occupied-by-whom,
abandon/expiry timing) for a problem that doesn't actually cause any
real conflict, since the real spot is still chosen atomically later.

### 6b. The drop-off table's own 3D-scene prompt, and what "confirm on
   phone" actually triggers

The drop-off-table interaction (`openDropoffExamine`, today's
"Confirm placed" button calling `/machines/:id/place` directly) changes
shape: instead of placing directly from the 3D scene, it now says
*"Looks like Shelf [suggested] is free — tap here to confirm placement
on your phone"*, with a button whose behavior mirrors
`openMachineExamine`'s existing "No phone? Simulate a phone scan" button
exactly (same iframe-insertion mechanism, same visual phone-frame) —
**except it must not say "scan"**, since nothing here is a QR scan; the
button reads something like "No phone? Simulate confirming on your
phone," and the iframe's `src` is the real home page (`/`), not a
`/laundry/scan/:id` route (there is no scan involved in this step at
all — the resident is already identified). Landing on the real home
page means the resident sees the real "did you move it?" card from point
5 above, with its "Yes" button already understood to be *the* action
that performs the real `placeLaundry()` call and reports the real spot
back — this single click is what the user meant by folding "confirm
pickup happened" and "report the spot" into one action: there was never
a separate "which spot" input to fill in, because `placeLaundry()`
already picks the spot itself; "Yes" on the home page's card *is* the
submit action, with no spot field for the resident to touch at all (this
keeps `CLAUDE.md`'s server-assigns-the-spot rule intact, same as the
original `plans/laundry-dropoff-flow.md` design — nothing about the
3D-scene suggested-display changes this).

**What this means concretely**: points 5 and 6b describe the *same*
card/button, not two separate home-page elements — "Did you move [room]'s
laundry to the drop-off area? [Yes] [No]" *is* the one action that, on
"Yes", calls the real `placeLaundry()` and shows the resulting real spot
("Placed on Shelf A3"). There is no second "type the spot in" step
anywhere in this design, confirmed against `CLAUDE.md`'s own rule.

### 6c. The original owner's own notice — wording, not mechanism

`placeLaundry()` already writes `notice: "laundry_moved"` on the
*original owner's* reservation the instant a real spot is assigned —
this mechanism is unchanged by this plan (it already runs today,
confirmed in `plans/laundry-dropoff-flow.md`'s own "Bug A" fix). What
changes is only the rendered text in `pendingPickupCard`
(`src/views.ts`), per the user's own request for a clearer, more urgent
framing: from *"Your laundry was moved to Shelf A3 — collect it when you
can."* to something closer to *"Your laundry has finished washing and
was moved to Drop-off Shelf A3 — please collect it soon."* — naming both
facts (wash finished, where it is now) and a gentler sense of urgency
("soon," not an open-ended "when you can"), rather than only the second.
Exact final copy to confirm at build time, same as every other string in
this plan — the point recorded here is that this is a **wording-only
change to an existing, already-firing notice**, not new plumbing.

## What this plan does NOT do

- **Does not let the resident type in a drop-off spot number, anywhere.**
  The 3D scene's own suggested-spot text is read-only display; the real
  spot is chosen server-side by the existing `firstFreeSpot()` logic,
  unchanged, at the moment "Yes" is pressed on the home page.
- **Does not change the claim-window timing itself**
  (`CLAIM_WINDOW_MS`/`settleMachine`) — claim stays fully unconditional
  on laundry state, per point 1.
- **Does not change `docs/adr/0013`'s core answer** ("only the machine's
  front-position room may move someone else's laundry; only the
  original owner may acknowledge collection") — only widens which
  *statuses* of "front-position room" still count (point 4), and adds
  one new enforced precondition to a different action (`start()`, point
  3) that ADR 0013 never covered.
- **Does not build a tentative/pre-claimed drop-off-spot reservation
  system.** Considered in point 6 and rejected — the 3D scene's spot
  display is cosmetic-only; real assignment stays atomic and
  server-side, exactly as `plans/laundry-dropoff-flow.md` already built
  it.
- **Does not introduce a new value on the schema's existing `notice`
  enum** (`moved_back`/`moved_up`/`laundry_moved`) — the home-page card
  is a standing, re-derived-every-render card (closer in shape to
  `dryerPromptCard`), gated by its own new dismissal column, not a
  one-shot notice.
- **Does not remove or change `pickUpLaundry`/`placeLaundry`'s own
  internal logic** — this plan only changes who may call `pickUpLaundry`
  (point 4) and adds a brand-new caller path for both (points 2 and 6b),
  on top of the existing, unmodified state machine.

## Rough build order

1. **Schema**: one new column (`handoffPromptDismissed`, 0/1, mirroring
   `dryerPromptDismissed`) via `drizzle-kit generate`. Migration
   committed, never hand-edited.
2. **`src/queue.ts`**:
   - Widen `isFrontWaitingHolder` to accept `"waiting" | "claimed"`
     (point 4), with `docs/adr/0013`'s addendum updated to record this
     explicitly.
   - `start()` gains the new precondition (point 3), reusing
     `unacknowledgedLaundryOn`'s exact check (export a thin wrapper if
     needed rather than duplicating the query).
   - New `dismissHandoffPrompt`-style function, same shape as
     `dismissDryerPrompt`.
   - A read path giving `myStatusBlock` what it needs for the card's
     visibility condition (point 5) — returns one entry per machine with
     unclaimed laundry (not a single aggregate fact), since the user
     confirmed two simultaneous cards (named by machine) is the right
     shape when `MAX_ACTIVE_PER_TYPE = 2` puts a resident in that
     position.
3. **`src/app.ts`**:
   - New dismiss route (`POST /reservations/:id/dismiss-handoff-prompt`,
     mirroring `dismiss-dryer-prompt`'s shape exactly).
   - `start()`'s new rejection reason rendered through the same
     inline/htmx-aware mechanism Stage 6.1 already built for the
     scan-gate rejection — not a new response shape.
   - The home page's own data-gathering (`GET /`, `GET /my-status`)
     gains the new per-machine "did you move it" check.
4. **`src/views.ts`**: new card function (mirroring `dryerPromptCard`'s
   two-button shape — "Yes" posts to the real place-equivalent action,
   "No" posts to the dismiss route), wired into `myStatusBlock` alongside
   the existing `pendingPickupCard`/`dryerPromptCard`/`noticeBanner`.
5. **`src/laundry-view.ts`**:
   - `handleInteract()`'s machine branch drops the `canHandoffOn`
     condition for the *initial* interact (point 1) — always opens
     `openMachineExamine`.
   - The SSE-driven `applyMachineState`/`refetchMachineState` path gains
     the logic in point 2: detect "my own reservation on the
     currently-open-overlay's machine just became `claimed`, and this
     machine has unclaimed laundry" and swap the overlay content
     in-place (reusing `showExamineOverlay`, the same mechanism
     `doPickup`'s own success path already uses).
   - `openDropoffExamine()` changes shape per point 6b: suggested-spot
     text computed client-side from `lastKnownOccupiedSpots`/the local
     `PICKUP_SPOTS` copy, "Confirm placed" button replaced with the
     phone-simulator-style button (reworded, not "scan"), iframe `src`
     set to `/` (the real home page), not a scan route.
6. **Spec coverage** (`spec/laundry-handoff.test.ts` and/or a new file):
   - The widened authorization: a `claimed` (not just `waiting`)
     front-holder can now call `pickUpLaundry` successfully.
   - `start()`'s new rejection: attempting to start with unclaimed
     laundry still on the machine fails with the new, distinct message;
     succeeds once `pickUpLaundry` has run.
   - The home-page card's visibility condition end to end: appears once
     claimed with unclaimed laundry present; disappears on "No" and
     stays gone on a subsequent render; disappears once `start()`
     succeeds (without ever clicking "Yes" or "No") or the reservation is
     cancelled.
   - Two simultaneous cards: a room holding active, unclaimed-laundry-
     bearing reservations on two machines at once sees two independent
     cards, each named by its own machine, and dismissing/acting on one
     doesn't affect the other.
   - The original owner's own home page shows the reworded notice (point
     6c) with the real assigned spot once `placeLaundry` succeeds.
   - `placeLaundry`'s own existing coverage (pool exhaustion, reuse,
     authorization) is unaffected — this plan adds a new caller path
     into it, not a new version of it.
7. **Verify against a real running app** — scratch server, real
   join/scan/claim (confirming the 3D-scene overlay swap fires on the
   real SSE event, not just that the HTTP calls succeed in isolation),
   attempted `start()` while laundry is still present (expect rejection),
   `pickUpLaundry` via the 3D scene, home-page "Yes" (expect a real spot
   assigned and the pool state to reflect it), then `start()` succeeding.

## What's still open — to confirm with the user before code

- Exact final wording for the 3D-scene's post-claim pickup prompt, the
  drop-off table's suggested-spot text, the home-page card's own copy,
  and `pendingPickupCard`'s reworded owner notice (point 6c) — drafted
  above as plain prose, final copy to confirm at build time, matching
  this project's existing convention for every other confirm overlay in
  this feature. (The one-card-vs-two question is now settled: two,
  per point 5.)

## Revision history (why this plan looks the way it does)

This design went through two real corrections from the user, each
changing a load-bearing part of the plan, not cosmetic wording — kept
here, not smoothed over, per this project's own standing practice of
logging a real fork rather than quietly rewriting history:

1. **First draft** gated the pickup prompt on `claim()` succeeding, and
   had the resident type a drop-off spot number into a phone-side form.
   Both corrected: pickup/"did you move it" are two *separate* concerns
   (pickup belongs in the 3D scene, confirming-the-spot belongs on the
   phone) that got conflated into one gate in the first draft; and the
   typed-spot-number idea directly conflicted with
   `src/pickup-spots.ts`'s own documented server-assigns-only rule.
2. **Second draft** (after splitting pickup/confirm correctly) proposed
   gating the pickup prompt on the resident's reservation reaching
   `"running"`. Corrected by the user directly: `running` means the wash
   has already started, by which point the machine must already be
   physically empty — gating on a state that already presupposes the
   constraint is circular, not an enforcement of it. The real constraint
   belongs on `start()` itself (point 3), with the pickup *prompt*
   surfacing immediately on claim (point 2), not deferred to running.
3. **Third round** settled the drop-off-table 3D interaction: considered
   a real server-side "tentative spot reservation" on 3D-scene
   interaction vs. a pure client-side display-only suggestion with no
   database write. Settled on display-only (point 6) after confirming
   directly that the 3D scene is explicitly a simplified stand-in for a
   physical shelf the app has no way to sense — the only real,
   authoritative data already comes from the phone-side report
   (`placeLaundry()`), so a second, parallel "what the 3D scene thinks is
   occupied" system would be new complexity solving a cosmetic,
   low-probability display mismatch, not a real data-integrity problem.

## Built and verified

Built in an isolated worktree (`.claude/worktrees/laundry-handoff-decouple-plan`)
per instruction, not the checkout another session was using concurrently.

- **Schema**: `handoffPromptDismissed` column added
  (`drizzle/0009_productive_marvel_apes.sql`, via `drizzle-kit generate`,
  never hand-edited).
- **`src/queue.ts`**: `isFrontWaitingHolder` widened to
  `"waiting" | "claimed"`; `start()` gained the new `unacknowledgedLaundryOn`
  precondition; new `suggestedHandoff`/`dismissHandoffPrompt` (same shape
  as `suggestedDryer`/`dismissDryerPrompt`); new `confirmHandoff` — a real
  function, not assumed trivial — that accepts *either* starting point
  (already `IN_TRANSIT` via the 3D scene's own pickup step, or still
  untouched in the machine) and reuses `placeLaundry`'s own real write
  rather than re-implementing it.
- **`docs/adr/0013`**: new addendum recording the `isFrontWaitingHolder`
  widening explicitly, per the plan's own point 4.
- **`src/app.ts`**: `canHandOff`'s own server-side check widened to match;
  `start` given its own dedicated route (mirroring `claim`'s existing
  htmx-aware inline-rejection shape); new
  `POST /reservations/:id/dismiss-handoff-prompt` and
  `POST /machines/:id/confirm-handoff` routes; home page/`/my-status`
  data-gathering wired to `suggestedHandoff`.
- **`src/views.ts`**: new `handoffRequiredBanner()` (start's own inline
  rejection) and `handoffPromptCard()` (the home page's "did you move
  it?" card, two-button shape like `dryerPromptCard`); `pendingPickupCard`'s
  wording updated per point 6c (wash-finished framing, gentler urgency).
- **`src/laundry-view.ts`**: `handleInteract()` now always opens the
  claim/QR overlay first (`isMyTurnOn`), falling back to the pickup
  overlay only for the second entry point (an already-claimed resident
  re-interacting); a new `openClaimOverlayMachineId` tracker lets
  `applyMachineState`'s own SSE-driven loop detect "the open overlay's
  machine just became my own claimed reservation with laundry still
  present" and swap the overlay content in place, reusing the existing
  `openHandoffExamine` flow; the drop-off table's own interaction
  (`openDropoffExamine`) now shows a client-computed, display-only
  suggested spot and a reworded "simulate confirming on your phone"
  button (not "scan" — nothing here is a QR scan), landing on the real
  home page where `handoffPromptCard`'s own "Yes" is the real confirm
  action.
- **Spec coverage**: `spec/laundry-handoff.test.ts` gained four new
  cases (a `claimed`, not just `waiting`, front-holder can pick up and
  place; `start()` rejects with laundry present and allows it once
  moved; `confirmHandoff()` works standalone with no prior `pickUp`
  call; the home-page card's full appear/dismiss/auto-clear lifecycle,
  including the two-simultaneous-cards case already covered by hand
  below). `spec/offer.test.ts` and `spec/support/queue-client.ts` both
  needed real fixes along the way — see "Real mistakes found" below.

### Real mistakes found during verification, not assumed away

1. **A pre-existing cleanup gap in `offer.test.ts`, surfaced by this
   plan's own new `start()` precondition, not caused by it.** Both of
   `offer.test.ts`'s existing tests drive a `finisher` reservation to
   `"done"` on `IDLE_MACHINE` via `finish()`, but never acknowledged it —
   `cleanupReservation`'s own `cancel()` call has no effect on a `done`
   reservation. This left a real, unacknowledged-laundry record on that
   machine that nothing before this plan ever checked for. The moment
   `start()` gained its own `unacknowledgedLaundryOn` precondition, the
   *second* of the two tests (which shares the same machine id) started
   failing its own `claimAndStart` with a real 409 — not a flaky test,
   a real, previously-invisible gap the new precondition correctly
   caught. Fixed by adding a shared `acknowledgePickup` helper to
   `spec/support/queue-client.ts` and calling it from both of
   `offer.test.ts`'s own teardown blocks.
2. **A bare `ne(pickupSpot, IN_TRANSIT)` would have silently broken the
   most common case — caught before trusting it, with a real SQLite
   query, not assumed from reading Drizzle's docs.** (This was actually
   found and fixed during the earlier `plans/laundry-dropoff-flow.md`
   bug-fix pass this plan builds on, not during this plan's own build —
   recorded here only because `suggestedHandoff`/`doneUnacknowledgedFor`
   both depend on getting this exactly right, and a change here could
   have silently reintroduced it.) Confirmed unchanged and still correct
   in the final build.
3. **This plan's own new spec tests had two real ordering bugs, found by
   actually running them, not just reading them.** The "rejects start()"
   and "confirmHandoff" tests each left their own `nextReservation`
   `"running"` at the end — `cleanupReservation`'s `cancel()` has no
   effect on a running reservation either, so both tests were leaving
   `MACHINE_ID` genuinely blocked for whatever ran after them in the same
   file. Fixed by calling `finish()` explicitly in each test's own
   teardown. Separately, the card-lifecycle test's second "fresh claim"
   round assumed `owner2` could immediately become front of the queue,
   but `next1`'s own first claimed reservation was still sitting
   unresolved (claimed, never started) ahead of it — a real logic error
   in the test's own event ordering, not a flaky timing issue. Fixed by
   making `next1` actually run its first wash to completion
   (start → finish → acknowledge) before `owner2` ever joins.
4. **An HTML-escaping assertion mismatch, not a code defect.** The first
   version of the `start()` rejection test asserted the raw message
   string including its apostrophe (`"resident's laundry"`) against the
   real rendered `errorPage()` body — which HTML-escapes it via `html`
   tagged templates. Fixed by splitting the assertion into two
   apostrophe-free substrings, confirmed against the real response body
   rather than assumed from the source string.

### Verified by hand, against a real running app, before any spec was written

A real two-room HTTP sequence (scratch server, a throwaway `DATABASE_PATH`,
never `.data/app.db`, never port 8080) confirmed, before any automated
test existed for it: claim is unconditional even with laundry present;
`canHandOff`/`isMyTurn` flip correctly across the claim transition; the
home-page card appears with the right machine/room naming the instant
claim succeeds; `start()` is genuinely rejected (409, correct message)
with laundry present and genuinely succeeds once moved;
`POST /machines/:id/confirm-handoff` works as a fully standalone action
with no prior 3D-scene pickup step; the owner's own home page shows the
real assigned spot; "No" makes the card disappear and stay gone across
multiple reloads; two machines with unclaimed laundry at once produce
two independent, correctly-worded cards (the `MAX_ACTIVE_PER_TYPE = 2`
case from point 4).

`pnpm check`: 15 files, 52 tests (48 pre-existing + 4 new), green against
a freshly wiped scratch server. `src/queue.ts`'s pre-existing exported
function signatures are unchanged except `start()`'s own new precondition
and `isFrontWaitingHolder`'s widened status check, both of which this
plan's own point 3/4 explicitly call for.

## A real bug found after shipping, root-caused and fixed

Reported directly by the user, from real use of the deployed build: (1)
the 3D scene jumped from the claim/QR overlay straight to the pickup
prompt before Claim had even been pressed, right after scanning; (2) a
"Can't move this laundry — no unclaimed laundry on this machine" error
appeared, worded in a way that made no sense given what had just been
clicked.

**Root cause, confirmed directly against the running app, not
assumed.** `applyMachineState`'s own SSE-driven overlay-swap condition
(point 2 above) checked only `openClaimOverlayMachineId === entry.id &&
canHandoffOn[entry.id]` — it never checked whether this resident had
actually claimed yet. `canHandoffOn` (fed by `src/app.ts`'s `canHandOff`
field) is *deliberately* true for both `"waiting"` and `"claimed"`
status, because that's the correct, intentionally widened set for
`isFrontWaitingHolder`'s own authorization check (point 4) — a
still-waiting front holder genuinely may call `pickUpLaundry`. But the
*overlay swap*'s own question is different: "has this resident actually
pressed Claim," not "would pickUpLaundry currently let them pick up."
Those are two separate facts that happened to share one boolean.
Confirmed with a real HTTP sequence against a scratch server: a resident
who joins a machine holding unclaimed laundry and scans but does *not*
yet claim already shows `state: "your-turn"`, `isMyTurn: true`,
`canHandOff: true` simultaneously — exactly the combination the old
condition would swap the overlay on, before Claim was ever pressed.

This also explains the second symptom directly, not as a separate bug:
a real `pickUpLaundry()` call made in this premature state actually
*succeeds* the first time (confirmed: `{"ok":true}`, laundry moves to
`IN_TRANSIT`) — so a resident confused by the overlay jumping early, who
ends up pressing "Pick up" more than once (the UI itself gave no
indication the first click had already worked), hits the real, correct
404 ("no unclaimed laundry on this machine") on the *second* attempt,
since nothing is left in the "untouched in the machine" state for
`unacknowledgedLaundryOn` to find anymore — confirmed directly: the
first pickup call returns 200, an immediate second call against the same
machine returns exactly this 404.

**Fix:** added an explicit `entry.state === "claimed"` check to the
overlay-swap condition — it now only fires once the resident's own
reservation has genuinely reached `"claimed"`, not merely whenever
`canHandoffOn` happens to be true. Confirmed by reading the same real
HTTP sequence: before claiming, `state` is `"your-turn"`, not
`"claimed"`, so the swap correctly does not fire; the instant `claim()`
succeeds, `state` becomes `"claimed"` with `canHandOff` still true, and
the swap fires exactly then. `pnpm check` re-confirmed green (15 files,
52 tests) after the fix, against a freshly wiped scratch server.

## A second, related bug found after that fix — reported directly by the user

The first fix above stopped the premature pre-claim jump, but didn't
cover the whole picture. Reported directly, after using the fixed
build: clicked "Pick up" exactly once, it worked, but re-interacting
with the same machine brought the exact same "Take out [room]'s
laundry?" prompt right back — and clicking "Pick up" a second time
failed with "no unclaimed laundry on this machine," which read as a
real bug (the user's own words: "I'm sure I only clicked once").

**Root cause, confirmed directly, not assumed.** `doneUnacknowledgedOnMachine()`
(`src/queue.ts`) deliberately keeps reporting a machine's unclaimed
laundry while it's `IN_TRANSIT` — correct for the status light (from
every *other* viewer's perspective, the situation hasn't resolved just
because someone started carrying it), but `canHandoffOn` (fed by this
same field) was being read as "should I still be offered the pickup
prompt," which is a different question once *this specific resident* is
the one who already picked it up. Confirmed with a real HTTP sequence
against a scratch server: right after a successful `pickUpLaundry`
call, `GET /laundry/machines-state` still reports
`unclaimedLaundry.canHandOff: true` for that machine — exactly the
condition both the overlay-swap logic and `handleInteract`'s own
re-interact branch were reading, with nothing checking whether *this*
resident was the one already carrying it. A second `pickUpLaundry` call
in that exact state does genuinely 404 ("no unclaimed laundry") — the
error itself was correct; the real bug was letting the user reach a
second pickup attempt at all.

**Fix:** both places now additionally check
`carryingFromMachine === <this machine>` (the one fact scoped to
exactly the resident currently carrying it, via `queue.ts`'s own
`carryingFor()`) and skip the pickup prompt when true:

- The overlay-swap condition (`applyMachineState`) now takes the
  freshly-fetched `carryingFromMachine` value as a parameter, rather
  than reading the outer `carryingFromMachine` variable — found as a
  real ordering bug while fixing this: `applyMachineState` runs
  *before* `applyBasketState` (which sets that outer variable) inside
  `refetchMachineState`, so reading it directly inside
  `applyMachineState` would always see the *previous* refetch's stale
  value, not this one's.
- `handleInteract`'s own re-interact branch now checks the outer
  `carryingFromMachine` variable directly — safe there, since it only
  runs in response to a real user action, well after any
  `refetchMachineState` call has already finished updating it.
- Both now show a new, shared `showCarryingReminder()` ("Picked up —
  carry this to the drop-off table to place it on a shelf.") instead of
  either the claim/QR screen or a second pickup confirm — extracted
  from `doPickup`'s own existing success message rather than duplicated.

Confirmed directly: right after a real `pickUpLaundry` call,
`GET /laundry/machines-state` shows `carryingFromMachine` equal to that
exact machine id while `unclaimedLaundry.canHandOff` is still `true` —
the precise combination that used to slip through both checks. A second
`pickUpLaundry` call in that state still correctly 404s server-side
(that was never the bug), but the fixed client no longer offers a path
that leads there. `pnpm check`: 15 files, 52 tests, green against a
freshly wiped scratch server.
