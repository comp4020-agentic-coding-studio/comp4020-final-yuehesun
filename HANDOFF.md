# Handoff — crit 10 extension, one unattended run

Written by the agent at the end of the run `prompt.md` describes, per its
Stage 6. Read this alongside `plans/crit-10.md` ("Extension") and
`research/design-plan.md`/`research/design-review.md` for the detail
behind Stage 4.

## What shipped, per stage, with commit hashes

Commits run oldest to newest on `crit-10-extension`:

- `13e1f25` — `chore:` added `fast-check` and `playwright` devDeps;
  captured `research/screens/before-*.png` (four states, both
  viewports) before any redesign work.
- `8118424` — **Stage 1 (plan's Stage 9, ADR 0007)**: `src/clock.ts`;
  every `Date.now()` in `src/queue.ts` replaced; `src/db.ts` gains
  in-memory mode + `resetForHarness()`; `src/logging.ts` gains a sink
  switch; `sim/` (rng, virtual clock, harness, driver); `fast-check`
  property tests (`spec/fairness-properties.test.ts`, 200 runs x 60
  steps, all 7 invariants) plus direct timing tests
  (`spec/queue-timing.test.ts`). Found and fixed two real bugs (see
  "Stage 1's deliberate break" below for one of them in detail; the
  other was `resetForHarness()`'s FK-cycle ordering).
- `372eeb8` — `docs:` ADR 0007 status to Accepted (Stage 13/stretch
  still noted pending inside the ADR itself, since Stage 5 below wasn't
  attempted this run).
- `88a84b9` — **Stage 2 first half (plan's Stage 10, ADR 0008)**:
  join-dedup window, disable-in-flight buttons, `spec/contention.test.ts`
  (20 simultaneous joins, double claim, double-submit).
- `6196690` — **Stage 2 second half**: SSE reconnect notice + fragment
  refetch, `spec/restart.test.ts` (own server on :8091, verified killed
  and the port confirmed free in `afterAll`, including on failure).
- `1766f77` — `docs:` ADR 0008 status to Accepted.
- `1128c03` — **Stage 3 (plan's Stage 11, ADR 0009)**: in-page turn
  alerts, native `<dialog>`, `document.title` flashing, once-per-transition
  via `sessionStorage`, verified with two Playwright contexts.
- `d7cc0ac` — `docs:` ADR 0009 status to Accepted.
- `d46680e` — **Stage 4 part 1 (plan's Stage 12)**: `research/design-plan.md`
  committed before any CSS — reference observations, palette with
  hand-checked contrast ratios, type/spacing scales, ASCII wireframes,
  self-review against "the generic version."
- `8402c26` — **Stage 4 part 2**: the full `views.ts` rewrite (departure-board
  table, signature status hero, tokens), two real display bugs found via
  screenshots and fixed, `research/design-review.md`'s scored >=2-round
  review, `research/screens/after-*.png`.
- *(this commit)* — **Stage 6**: this file, `plan.md`'s Current state
  appended, Docker check result, extra critique round.
- *(final commit)* — deletes `prompt.md`, per the run's own last
  instruction.

## What didn't ship, and why

- **Stage 5 (stretch) — the fairness simulation (`scripts/simulate.ts`,
  `pnpm sim`, `sim/results.json`, `/fairness`) was not attempted.**
  `prompt.md` and `plans/crit-10.md` both name it the explicit first
  thing to cut if time runs short, and Stage 4 — named "the most
  important stage" and "not to be shortcut" — took the bulk of the
  run's time once the >=2-round scored screenshot loop, the two
  genuine display-bug fixes, and a real 3-minute wait for the
  moved-back/moved-up screenshots are counted. Rather than rushing
  Stage 5 and risking a second re-implementation of queue rules (the
  one thing ADR 0007 exists to prevent) under time pressure, I judged
  stopping after a solid Stage 4 and a complete Stage 6 to be the
  smaller risk. The harness `sim/` already built in Stage 1 is designed
  to be reused for exactly this (its own doc comments say so), so
  Stage 5 is a clean pickup, not a redesign, whenever it's next
  attempted.
- Docker verification: see below — `docker` isn't usable from this WSL2
  distro in this environment (the binary resolves to the Windows-side
  Docker Desktop install but WSL integration isn't enabled), so only
  the local-server `pnpm check` run could be confirmed, not the image
  build.

## Every call made without asking, and why

1. **Playwright's system libraries extracted by hand from `.deb`
   packages**, since `--with-deps`'s own install needs `sudo` which
   wasn't available unattended. Nothing added to the repo or
   `Dockerfile` for this — production never runs a browser, so this was
   purely a local verification workaround, deleted (`.scratch/`) after
   use each time.
2. **SSE disconnection was verified via a real `SIGKILL`'d server
   process, not browser-level offline emulation** — `context.setOffline()`
   and CDP network throttling didn't reliably interrupt an
   already-flowing streaming response in this sandbox. A real process
   kill genuinely severs the TCP connection, which is closer to the
   real failure mode (a server restart/deploy) than a browser-level
   simulation anyway.
3. **The moved-back/moved-up screenshots were captured by actually
   waiting out a real 3-minute claim window** (a backgrounded poll,
   not a sped-up clock), since the running app's screenshots must come
   from the real server, and `sim/`'s virtual clock is explicitly
   scoped to tests/the simulator only, never reachable from it.
4. **`noticeBanner()`'s "moved back" text was reworded** to "You moved
   back one place: no claim within 3 minutes." to match
   `research/design-plan.md`'s own wireframe line exactly, rather than
   leaving the pre-existing shorter copy. A wording-only change, not a
   mechanism change.
5. **Room numbers used across every screenshot/spec session followed
   ADR 0004's digit-only format strictly** (`room9xxx` ranges, one
   block per screenshot/spec pass) — an early draft script used a
   dash-containing room name and silently hit the error page; fixed by
   switching to compliant formats rather than loosening validation.
6. **Each screenshot pass used its own freshly-wiped scratch SQLite
   file** (`/tmp/crit10-scratch/*.db`), never `.data/app.db`, and never
   the same scratch file across both a `pnpm check` run and a
   screenshot session in the same sitting — `pnpm check`'s own spec
   runs fill machines with reservations that would otherwise pollute a
   "free machine" screenshot.
7. **Stage 5 skipped** (see above) — the single largest unasked-for
   call this run made, since `prompt.md` frames Stage 5 as something to
   attempt, not something mandatory.
8. **The "done" status's unreachability in the live UI was left
   unfixed** — see below. Changing `queue.ts`'s `ACTIVE_STATUSES` to
   include `"done"` would be a queue-logic change, and Stage 4 is
   scoped as a design-only pass over the existing data model.

## Stage 1's deliberate-break counterexample

Quoted in full in commit `8118424`'s message; reproduced here as
`prompt.md` Stage 6 asks:

Temporarily changed `moveBackOnePlace` to swap the missed reservation
with the *third* queue entry instead of the second (i.e., jump two
places instead of swapping the front two). The property test failed on
its very first run, shrunk to 5 tries:

```
Error: Property failed after 5 tests
{ seed: 756206106, path: "4:...:1:1:1:2:1:1:2:0:...", endOnFailure: true }
Caused by: Error: machine 1: queue order changed beyond a front-two
swap (3390,3391,3393 -> 3393,3391,3390)
```

This is exactly the injected bug (invariant 3 — "two reservations on the
same machine only change order through a move-back-one swap of the front
two"), caught on the first attempt. Reverted before the commit; `pnpm
check` confirmed green again afterward.

## Suggested lines for README's "What's enforced, what's judged"

Each names the spec file that would back it if added:

- "A simultaneous rush of joins on one machine still lands in a
  contiguous 1..n order with no gaps or duplicates" —
  `spec/contention.test.ts`.
- "Two near-simultaneous actions on the same reservation (a double
  claim, a double-submitted join) never create two reservations or two
  successful claims" — `spec/contention.test.ts`.
- "Reservation state survives a server restart on the same database" —
  `spec/restart.test.ts`.
- "The queue's timing rules — claim window, start window, an offer's
  claim/response windows, a dryer's window waiting for its wash — hold
  under any sequence of real actions, not just the paths a human
  thought to test" — `spec/fairness-properties.test.ts` and
  `spec/queue-timing.test.ts`.
- "A missed claim or start window always swaps exactly the front two
  reservations, never more" — `spec/fairness-properties.test.ts`
  (invariant 3, the one the deliberate-break drill above exercised
  directly).

## Stage 5's numbers

Not applicable — Stage 5 was not attempted this run (see above). No
numbers to report; nothing should be written into a neutral table
claiming one missed-window policy is better than another until the
simulation actually runs.

## Where the UI is still weakest

From `research/design-review.md`'s own notes, collected here:

- **The "done" reservation state is architecturally unreachable in the
  live UI.** `queue.ts`'s `ACTIVE_STATUSES = ["waiting", "claimed",
  "running"]` means `queueFor()` never returns a "done" row once
  `finish()` sets that status, so the status-hero block (including the
  "Done — thanks for using this machine" code path built for Stage 4)
  disappears entirely the instant a wash finishes — confirmed by
  screenshot (`research/screens`/`.scratch` — the capture shows no
  status-hero at all right after calling finish, the machine already
  back to "Free"). This is pre-existing `queue.ts` behaviour, not
  introduced by this redesign; fixing it (if a transient "done,
  thanks" moment is actually wanted) means changing which statuses
  `queueFor` treats as active, which is a queue-logic decision outside
  this design-only stage's scope.
- **A recurring minor desktop alignment note**: on most 1280px
  screenshots, the status column's left edge and the board's first
  column don't quite line up (the status column is a fixed 22rem, the
  board's own first column width is content-driven) — never scored
  below 4 on any screen because of it, but worth a look if there's
  another pass.
- **The offer decision-card can outweigh the hero figure's dominance on
  mobile** (scored 4, not 5, on item 1 of the checklist for the "offer"
  screen) — a deliberate trade-off (an offer is a time-boxed decision
  that has to be seen), not treated as a defect.
- **The room-number (identity) screen** is the one screen closest to
  "the generic version" described in `research/design-plan.md`'s
  self-review, mostly because there's no Flighty-equivalent reference
  screen to borrow structure from, and `prompt.md`'s own wireframe
  calls it "unchanged structure, restyled tokens only." Left as a
  candidate for a future pass, not fixed here.

## What to check by hand on a real phone

- The departure-board table's mobile stacking (`.board-label` reveal
  under 640px) — verified only via Playwright's 390px viewport
  emulation, never a real touchscreen. Worth confirming the
  label/value pairs read comfortably and the reserve-form dropdown is
  easy to tap.
- The turn-alert `<dialog>`'s focus-trap and on-screen keyboard
  interaction on an actual phone (native `<dialog>` behaviour can
  differ subtly between desktop Chrome, used for all the Playwright
  verification here, and mobile Safari/Chrome).
- Whether the status-hero's `--text-hero` (4.5rem) figure actually
  reads as comfortably dominant at a real phone's viewing distance and
  brightness, not just in a screenshot.
- The reconnect notice and turn-alert's `document.title` flash on a
  real phone's tab-switching behaviour (background tab throttling can
  differ from desktop Chrome's).
- Real multi-person timing: this run's Stage 2/3 verification used two
  Playwright browser contexts on one machine; a genuine two-phone test
  (per `plans/crit-10.md`'s own "two Chrome profiles" plan) hasn't
  happened this run.

## Docker check

`docker` is not usable from this WSL2 distro in this environment — the
`docker` binary on `PATH` resolves to the Windows-side Docker Desktop
install, and its output says WSL integration isn't enabled for this
distro. `docker build`/`docker run` could not be attempted. `pnpm check`
was instead confirmed green against a plain local server (`node
src/server.ts`, scratch port 8094, scratch `DATABASE_PATH`, killed and
port-freedom confirmed with `ss -tlnp` immediately after) — see the
Stage 4 commit message for that run's result (10 files, 21 tests). This
is the one Definition-of-done item this run could not fully verify;
confirming the real `docker build -t app . && docker run ...` path is
something to do by hand before shipping.

## Ports and servers

Every verification server this run started used 8090 or above (never
8080), and was killed with its port's freedom confirmed via `ss -tlnp`
immediately after each check — including the server left running from
the prior screenshot-capture session at the start of this continuation
(port 8090, confirmed free before any further work began). No server is
listening on any port this run used as of this commit.

---

# Handoff — 3D walkthrough, one unattended run (branch `3d-walkthrough`)

Written by the agent at the end of the run `prompt.md` (this run's own
copy, at the repo root) describes, per its section 8. Read alongside
`plans/3d-walkthrough.md` and `docs/adr/0012-3d-walkthrough.md`. This
section is appended after the prior crit-10-extension run's own handoff
above — a separate run, a separate branch, not a continuation of it.

## What shipped, per stage, with commit hashes

Commits run oldest to newest on `3d-walkthrough` (off `main` at `75aa7b0`,
which already carried the plan/ADR/research/`prompt.md` written before
this run started):

- `b5ecda6` — **Stage 1**: `GET /laundry`, a first-person three.js scene
  (pinned CDN ES module, no bundler), a room with 10 machine
  placeholders, WASD + pointer-lock mouse-look (desktop) and an on-screen
  joystick + drag-look (touch). Found and fixed a real defect via this
  stage's own verification, not assumed: the camera had no collision
  against machine geometry at all, visibly clipping through a machine's
  box on sustained forward movement (confirmed by a before/after
  screenshot pair where the view went solid grey). Fixed with per-axis
  AABB collision against each machine's bounding box.
- `e0a8bce` — **Stage 2**: `GET /laundry/machines-state` (reuses
  `board-state.ts`'s exact logic, no second state->colour mapping); the
  scene opens its own `EventSource("/events")` on the exact same stream
  the 2D board's htmx SSE extension already uses. Verified end-to-end
  against the real app: free -> your-turn -> claimed, each transition
  polled for and confirmed via the actual rendered mesh colour, not a
  fixed sleep.
- `f063fa0` — **Stage 3**: `qrcode` npm dependency; `GET /machines/:id/
  qrcode.png` (a real PNG, origin read from the request itself); `GET
  /laundry/scan/:id`'s three branches, built entirely from existing
  `queue.ts` reads/actions; `POST /identity`'s new `redirect` field with
  open-redirect rejection. `spec/laundry-scan.test.ts` (5 tests). One
  real bug the spec file itself caught before committing: an early
  version of the read-only-case assertion wrongly assumed a non-owner
  should see no reservation form at all, when `boardRow` (correctly)
  lets a stranger queue behind the current holder — fixed by claiming
  the existing reservation first and asserting the one thing that
  actually matters, no claim form for someone else's reservation id.
- **Stage 6 (non-phone parts)**: visual pass (warm lighting matching the
  app's own palette, soft shadows, a drum-ring detail echoing the 2D
  machine icon) and a claim-success flash cue, committed together with
  this `HANDOFF.md`/`plan.md` update — see the commit immediately
  following this file's own commit in `git log` for the exact hash,
  since it's written in the same step as this handoff per the prompt's
  own Stage 7/8 sequencing.

## Calls made without being asked, and why

- **Exact room/aisle layout**: two rows of 5 machines with a 6-unit-wide
  aisle between them, computed from whatever machine count the server
  actually returns (not hardcoded to 10) — a reasonable, simple floor
  plan per the plan's own "fixed, hand-authored layout... no procedural
  generation" note.
- **File split**: `src/laundry-view.ts`, separate from `src/views.ts` —
  matches the plan's own suggestion and the precedent `src/board-state.ts`
  already set for splitting out a growing `views.ts`.
- **`page()` and the `Html` type in `src/views.ts` made exported** (both
  were module-private before) — the smallest change that let
  `laundry-view.ts` share the real page shell/nav instead of hand-rolling
  a second one. No existing caller's behaviour changed.
- **Nav link placement**: "Go to the laundry" was added to the shared
  `page()` wrapper's top nav (visible on every page), not only on the
  home page specifically as the prompt's literal wording said — this is
  a strict superset of "visible on the home page" and keeps the entry
  point reachable from `/laundry/scan/:id` and `/readme/` too, which
  seemed better than matching the prompt's wording exactly at the cost
  of a less useful result.
- **Scan page's three-branch logic lives in `src/laundry-view.ts`**
  (`scanPage`/`scanClaimConfirm`/`scanReservationForm`/`scanReadOnly`/
  `scanIdentityPage`), not `src/views.ts` — keeps the whole 3D-walkthrough
  feature's view code in one file, consistent with the Stage 1 file-split
  decision above.
- **QR code size and vertical placement were tuned twice**, both times
  because a screenshot actually showed a problem a code review wouldn't
  have caught: first, Stage 3's initial placement was fine at the normal
  walking distance tested there; then Stage 6's own closer-distance
  screenshot showed the QR plane's edge poking past the machine box's
  physical top edge. Fixed by shrinking `QR_SIZE` from 0.6 to 0.45 (scene
  units) and adjusting its vertical ratio from 0.85 to 0.72 of
  `MACHINE_H`, checked numerically (not just re-eyeballed) before
  re-verifying with another screenshot.
- **Claim-flash colour and duration**: a saturated gold (`0xffd54a`) for
  700ms — distinct from every real state colour already in use
  (free/claimed/running/alert/muted), so it reads unambiguously as a
  transient event rather than a new, permanent state.
- **Image-generation API**: not used at all this run. Stage 1's simple
  box/cylinder geometry plus Stage 6's lighting/shadow pass were judged
  sufficient without spending any of the shared course image budget —
  zero calls made, so there's nothing to report on download/commit
  discipline for this run.
- **Machine ids for `spec/laundry-scan.test.ts`**: 9 and 10 (both
  dryers) — the only pair no other spec file touches, confirmed by
  grepping every existing `spec/*.test.ts` for its own reserved machine
  ids before picking these.
- **Playwright/WebGL environment fix**: already in place before this run
  started (see the next section) — not something this run had to solve,
  but worth recording that it held up for the entire run with no
  degradation.

## The Playwright/WebGL environment fix (prompt.md section 1)

Held up for the whole run with no issues: every `LD_LIBRARY_PATH`-prefixed
Playwright invocation launched cleanly and produced real, visually
correct screenshots (SwiftShader software rendering — no GPU, but a
genuinely correct WebGL context throughout). Nothing fell back to
non-visual verification at any point in this run.

One real, separate environment issue found and worked around, unrelated
to the Playwright fix: a `pnpm check` run collided with
`spec/restart.test.ts`'s own hardcoded port 8091, because this run's own
verification server happened to also be using 8091 at the time. Not a
code defect — `spec/restart.test.ts` has reserved 8091 for its own
server since before this run started (`const PORT = 8091` in that file).
Every verification server after that first collision used 8092 instead;
worth noting in case a future run picks a scratch port without first
checking for this one hardcoded exception.

## Image-generation API

Not used. See "Calls made without being asked" above.

## What's weak or worth a second pass — flagged for the user's own Stage 4 work

- **QR code scannability at a real phone's actual working distance is
  still unverified by an actual phone** — Stage 3/6's screenshots confirm
  the code is crisp and correctly decodes when extracted and run through
  a real QR decoder (jsQR) programmatically, and that it's legible at a
  realistic in-scene walking distance in a screenshot, but a screenshot
  is not the same lighting/camera/focus conditions a real phone's camera
  will see on a real screen showing this scene. Worth the first thing to
  check in Stage 4, before anything else.
- **The claim-success flash fires only while the `/laundry` tab is
  already open** — if a resident claims from their phone (the scan page)
  while a *different* device/tab has `/laundry` open and idle in the
  background, that second device's flash will still fire correctly (it's
  driven by the same SSE stream, not by who performed the action), but
  this hasn't been exercised with a genuinely separate, physically
  distant second device — only two Playwright request contexts on one
  machine, same as every other stage's own verification shape in this
  run.
- **Touch controls (joystick + drag-look) are verified via Playwright's
  touch-event emulation, never a real finger on a real touchscreen** —
  the same category of gap `HANDOFF.md`'s crit-10-extension section
  above already flagged for the 2D UI's own touch interactions.
- **Room/aisle proportions and camera eye height were picked by
  judgement, not measured against a real laundry room** — reasonable
  defaults, not derived from any real-world reference.

## Docker check

Not attempted this run — out of scope for Stages 1-3/6, and the prior
crit-10-extension handoff above already documents this WSL2 environment's
Docker limitation in detail. Nothing in this run's changes affects that
finding either way (no Dockerfile changes were made).

## Ports and servers

Every verification server this run started used port 8092 (after the one
8091 collision noted above, found and corrected within the same stage).
Each was killed and its port's freedom confirmed via `ss -tlnp`
immediately after every check, including the one collision. No server is
listening on any port this run used as of this commit.

# Handoff — 3D walkthrough, second unattended run (branch `3d-walkthrough`)

Written by the agent at the end of this run of `prompt.md` (this run's
own copy, at the repo root), which covered Stage 7's remaining
sub-stages (7.2, 7.3) and all of Stage 8. Read alongside
`plans/3d-walkthrough.md`'s Stage 7/8 sections and
`docs/adr/0013-laundry-handoff-authorization.md`. This section is
appended after the first 3D-walkthrough run's own handoff above — a
later, separate unattended run on the same branch, not a continuation in
one sitting (this run hit the environment's 200-turn limit four times
and was resumed each time with instructions to continue exactly where it
left off).

## What shipped, per stage, with commit hashes

Commits run oldest to newest on `3d-walkthrough`, starting from where the
first run's own handoff above left off:

- `a88d8f1` — **Stage 8.1**: real CC0 GLTF models (Kenney's Furniture Kit
  and Mini Characters, `public/models/SOURCES.md`) replacing every
  placeholder box/cylinder from the first run; a new `/models/*` static
  route; the models copied into the Docker image.
- `11393c5` — **Stage 8.2's floor-plan sketch**, written into
  `plans/3d-walkthrough.md` before any layout code, per the plan's own
  instruction: one continuous wall of machines, sink/ironing on the west
  wall, drop-off on the east wall, spawn south, ceiling lamps along the
  centreline.
- `0178832` — **Stage 8.4b backend**: `pickupSpot`/`pickedUpAt` columns
  (migration `drizzle/0006_shiny_black_bird.sql`), the `notice` enum's
  third value `laundry_moved`, `src/pickup-spots.ts`'s fixed six-spot
  list, and `src/queue.ts`'s new (not modified) functions
  `handoffLaundry`/`acknowledgePickup`/`isFrontWaitingHolder`/
  `doneUnacknowledgedFor`/`doneUnacknowledgedOnMachine`; new routes
  `POST /machines/:id/handoff` and `POST /reservations/:id/
  acknowledge-pickup`. A real architectural gap found while building
  this: `queueFor()`/`activeReservations()` are scoped to
  waiting/claimed/running only, so a `done` reservation (handed off or
  not) was already invisible to both the view layer's existing
  `row.status === "done"` branches (dead code, reachable from no real
  `QueueRow`) and to `src/realtime.ts`'s own per-machine SSE digest loop
  — a handoff would write to the database correctly but never trigger
  the `"changed"` broadcast. Fixed with new direct-query functions
  bypassing `QueueRow` entirely and a new `doneUnacknowledgedDigest()`
  check in `tick()`. Manually verified end-to-end via curl (room A
  reserves+finishes, room B joins+becomes front, B hands off, gets a
  real spot, A sees the notice via `/my-status`, A acknowledges, the
  spot becomes reusable) before any automated spec existed for it.
- `90800f7` — **Stage 7.2, 7.3, and 8.1's client wiring, 8.2, 8.3**: the
  large rewrite of `src/laundry-view.ts`. Pointer lock requested
  automatically on entry with a persistent corner hint; QR codes moved
  into a proximity-triggered examine overlay (`<img>`, not a WebGL
  texture); the real floor plan built from the committed sketch, using
  real measured `THREE.Box3` bounding boxes (the Furniture Kit models
  are corner-origin and not symmetric — re-centring needs
  `-bbox.min - size/2`, not the naive `-size/2`); a third-person
  character replacing the first-person camera entirely, with a camera
  rig clamped so it can never clip through a wall, and proximity-based
  interaction replacing screen-centre raycasting. Also documents (in the
  commit message) the long status-light-visibility debugging chain this
  stage went through before landing on a free-standing-post design — see
  "A debugging dead end worth recording in detail" below.
- `57aca90` — **Stage 8's own verify checklist item**:
  `spec/laundry-handoff.test.ts`, driving the full handoff flow against
  the real running app (unauthorized handoff rejected, real spot
  assigned, owner notified and able to acknowledge, a full six-spot
  cycle confirming a seventh handoff is rejected while the pool is
  genuinely full and succeeds again once freed). Writing the repeated-
  handoff assertion surfaced a real bug — see "Bugs the spec itself
  found" below — fixed in the same commit as the spec that caught it,
  per `CLAUDE.md`'s own rule.
- `5a80c00` — **A second real gap, found only by an actual end-to-end
  Playwright run of the full handoff flow in a browser, not by any unit
  test**: the drop-off shelf's own numbered-spot-occupied marker
  (`dropoffSpotMeshes`) was built correctly but nothing ever recoloured
  it from real server state — every spot stayed the same free-tint
  colour forever. Fixed with a new exported `queue.occupiedPickupSpots()`
  (not a change to any existing exported function — `firstFreeSpot()`
  now calls it instead of duplicating its own query), returned from
  `GET /laundry/machines-state` as `occupiedSpots`, and applied to the
  meshes on every refetch. See "Bugs the spec itself found" below for
  the ordering wrinkle this fix also had to handle.
- *(this commit)* — this `HANDOFF.md` section, `plan.md`'s Current state
  and feature #18 both updated.
- *(final commit)* — deletes `prompt.md`, per the run's own last
  instruction.

## Bugs found and fixed this run, and what caught them

- **A repeated handoff call could silently reassign already-moved
  laundry a second spot.** `unacknowledgedLaundryOn()` only checked
  `status === "done"` and `pickedUpAt IS NULL` — a reservation that had
  already been handed off to a spot, but not yet acknowledged by its
  owner, still matched that query. A double-click on the handoff
  interaction, or two different front-of-queue rooms in quick
  succession, would reassign the same laundry to a *second* spot instead
  of correctly reporting there was nothing left on the machine to move.
  Found while writing `spec/laundry-handoff.test.ts`'s own "nothing left
  to hand off once the laundry's already moved" assertion — the test
  initially expected 404 and got 200. Fixed by also requiring
  `pickupSpot IS NULL`, so "still sitting in the machine" and "already
  moved, awaiting acknowledgement" are no longer conflated. This is
  exactly the kind of bug a spec-first approach is meant to catch before
  it reaches a demo: nothing in a manual curl walkthrough of the "happy
  path" would ever have exercised a *second* call to the same route.
- **The drop-off shelf's own occupied-spot marker was never wired to
  real state at all** (described above) — found only once an actual
  Playwright browser run drove the full flow and logged every
  `dropoffSpotMeshes` colour at the end, which is exactly the class of
  gap the plan's own "Verify (Stage 8)" section warns a spec alone can't
  catch ("Visual confirmation... of... the drop-off shelf's own
  numbered-spot-occupied visual state"). The fix also had to handle one
  ordering wrinkle: `table.glb` (which the spot markers are children of)
  loads asynchronously, so the very first `machines-state` fetch on page
  load can resolve before the markers exist. The last-known occupied-spot
  list is now cached and re-applied once the markers are actually built,
  rather than only reflecting whatever the state happened to be at the
  moment the model finished loading.

## A debugging dead end worth recording in detail — the status-light post

The machine status light (originally a flat `CircleGeometry` disc
mounted flush against the washer model's own measured face) was
invisible in every screenshot for a long stretch of this run, despite
confirmed-correct world position, confirmed-correct colour, and being
numerically outside the model's axis-aligned bounding box. Several
wrong hypotheses were tried and discarded in turn (stale placeholder
constants instead of the real measured footprint; wrong re-centring
offset; backface culling; size/contrast) before `_snapCameraTo()` (a new
debug hook added specifically for this) pointed the camera directly at
the light's own world position from point-blank range and showed a
solid, featureless colour filling the whole frame — the camera was
effectively inside a surface, not looking at open space containing a
small sphere.

The real cause: the washer model's door is a separate panel raised a
few millimetres proud of the body's flat face — invisible to a simple
axis-aligned `Box3` check, and close enough that a light placed "just
outside the box" by a few hundredths of a unit could still be wedged
between the body's face and the door's raised panel. The fix abandoned
trying to place the light flush against the model's exact real surface
topology at all: it now stands on a free-standing vertical post with a
full quarter-unit clearance from the whole model, which doesn't depend
on knowing the model's precise geometry. Worth recording because the
instinct to keep tuning the light's exact offset against the measured
bounding box was the wrong direction entirely — the box simply doesn't
describe the model's real surface closely enough for sub-centimetre
placement, and no amount of offset-tuning against it was ever going to
fix that.

## Calls made without being asked, and why

- **Status light as a separate post-mounted object, not a recoloured
  model material**: the real multi-material GLTF models (the washer has
  6 materials across 2 mesh nodes) make the first run's "override every
  sub-mesh's material with one flat status colour" approach erase all
  real model detail, collapsing it into a flat-looking block. A small
  separate indicator object preserves the real model's own appearance.
- **Highlight ring instead of an outline-duplicate mesh**: the first
  run's placeholder-box era could get away with scaled-up duplicate
  meshes as an outline; against the real models' own geometry this
  produced visible gaps/z-fighting, so a flat floor ring under the
  target replaced it instead.
- **Camera clamped to stay inside the room walls
  (`clampCameraPos`)**: the naive "camera positioned behind the
  character" placement put the camera entirely outside the room through
  the south wall when the character stood near the spawn point — fixed
  with a general clamp rather than only tuning the specific
  spawn-point/camera-distance numbers that triggered it, so the same
  class of bug can't recur if either constant changes later.
- **`spec/laundry-handoff.test.ts` shares machine 2 with
  `queue-order.test.ts`** rather than claiming an unused id — every
  machine id is already claimed by some existing spec file (`laundry-
  scan.test.ts` uses the only two dryers), and machine 2's queue is
  always driven to a terminal state (done/cancelled) by both files
  before returning, the same "shared id, nothing left active" guarantee
  `laundry-scan.test.ts` already relies on for its own shared machines.
  Confirmed safe by running both files together against one scratch
  server before committing.
- **`src/pickup-spots.ts` as a separate small file**, not folded into
  `src/schema.ts` or `src/queue.ts` — matches the plan's own suggestion
  and the existing precedent of small, single-purpose files
  (`src/clock.ts`, `src/board-state.ts`) in this codebase.
- **Image-generation API**: not used this run either. The real sourced
  GLTF models (Stage 8.1) made any generated imagery unnecessary.

## What's weak or worth a second pass

- **Room/character/camera proportions are still judgement calls, not
  measured against a real laundry room** — same open item the first
  run's handoff already flagged, unchanged by this run.
- **Touch controls remain verified only via Playwright's touch-event
  emulation**, never a real finger on a real touchscreen — same
  category of gap flagged in both prior handoff sections.
- **Pointer lock's automatic-request-on-entry path has only been
  exercised via Playwright, which cannot grant a real browser's pointer
  lock without a user gesture** — the `NotAllowedError: A user gesture
  is required to request Pointer Lock` seen in every automated run is
  expected under Playwright specifically (per the plan's own "best-
  effort, fall back to click" design), but this means the *automatic*
  half of Stage 7.2 has only ever been exercised as a no-op in
  verification; only the click-to-lock fallback has been exercised
  end-to-end. Worth a real-browser check by hand before relying on it
  for a demo.
- **The handoff flow's "distinguishing icon" above a machine with
  unclaimed laundry** (`setUnclaimedMarker`'s gold torus ring) was
  visually spot-checked in this run's own screenshots but not compared
  against the plan's open note that "exact visual treatment [was]
  decided during implementation" — it's a reasonable, visible, distinct
  marker, but wasn't put in front of the user for a design opinion the
  way Stage 6's visual pass was in the first run.
- **The six-spot pickup pool is a small, fixed, shared, room-wide
  resource** — this run's own spec exercises filling and freeing all six,
  but a real residence with many more than six simultaneous handoffs
  pending at once (unlikely in practice, given `MAX_ACTIVE_PER_TYPE`'s
  existing cap on how many machines one room can occupy at once, but not
  impossible with many different rooms) would see `firstFreeSpot()`
  correctly return `undefined` and `handoffLaundry` correctly reject with
  409 — behaviour that's covered, but the shelf only having six spots at
  all was sized to "how many the drop-off shelf model in 8.2 actually has
  room for" per the plan, not to any measured demand.

## Docker check

Not attempted this run either — out of scope for Stages 7/8 (no
Dockerfile logic changed beyond Stage 8.1's `COPY public/models` line,
already covered by that stage's own commit), and the environment's
Docker limitation is unchanged from both prior handoff sections.

## Ports and servers

Every verification server this run started used ports 8092-8094 (never
8080, the user's own `pnpm dev`; never 8091, `spec/restart.test.ts`'s own
reserved port). Each was killed and its port's freedom confirmed via
`ss -tlnp` immediately after every check. No server is listening on any
port this run used as of this commit.
