# Plan — Laundry Queue (overall vision)

## Read first

- The final project brief and spec:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/
- Crit 8 "It's alive!" (week 9):
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/
- Crit 9 "All at once" (week 10) and crit 10 "Fly by instruments" (week 11)
  specs on the course site describe what later crits need to satisfy.
- `spec/README.md` in this repo (the two fixed invariants, and that
  `spec/*.test.ts` is ours to extend).
- `CLAUDE.md` in this repo for the working rules.
- `docs/adr/` for decisions already locked in.

This file is the **whole-project vision** — it doesn't get rewritten, only
grown. Each crit has its own plan file under `plans/` (e.g.
`plans/crit-8.md`) with that crit's stage-by-stage detail; those files link
back here for background instead of repeating it.

## Background

**What we're building:** a shared queue for a laundry room's machines. A
student residence has ~10 machines for 100+ people; on weekends there's
always a wait, and leaving the room risks losing your turn. The app lets
people join a queue for a specific machine, see where they stand, and know
when it's their turn — without chatting, friending, or creating an account.
Shared state does the coordinating; talking stays optional.

This satisfies the final project's three fixed requirements: **multi-user**
(anyone looking at a machine's line is a different, queue-tracked person),
**real-time** (queue position and machine status update live), and
**persists** (your place in line, and every machine's state, survives
reloads, restarts and redeploys).

**Our definition of "good"** (see `README.md`): calm — the room recedes
to the edge of your attention and only calls you back at the two moments
that matter (one person ahead, your turn); the queue's documented rule
decides your place, not whoever argues loudest; talking is optional;
honest about real-time limits; keeps only what the queue needs (no
profile, no history); and stays scoped to one laundry room rather than
becoming a generic booking product.

See [`docs/adr/0001-app-concept.md`](docs/adr/0001-app-concept.md) for why
this app over the alternatives considered.

## User story

In the real world, scanning a machine's QR code is tied to payment and
starting the cycle in one motion — machine status naturally comes from
that scan, not from someone remembering to log it by hand. We don't have
real washing machines to scan, so `README.md` explains that starting a
machine is simulated as an on-page interface: in testing, you click the
machine on the page and choose a washing type (which sets the time)
instead of scanning a real code.

A resident checks their phone from their room and sees every machine's
status: which are running, when each will be free, and whether the person
ahead of them in a line has actually scanned in yet.

To do laundry, they make a reservation one of three ways: let the app
assign whichever machine would start soonest, pick a specific machine
themselves, or walk up and scan a machine's code on site — which opens
that machine's reservation directly. If they scan a machine that's already
reserved, the page switches to that machine's reservation/status page
instead of claiming it.

Their reservation gets a time: an estimate until the person ahead of them
scans in, then fixed. The estimate is based on the washing type they chose
when they reserved (type fixes the duration up front) — the only real
uncertainty is whether the person ahead comes late or dawdles before
starting, not how long their wash runs. They're notified when their time
becomes fixed, or changes.

A machine that's reserved but still sitting idle counts as occupied —
scanning it on site can't start it until that reservation lapses.

As their turn approaches, they get two reminders: one when there's a
single person ahead of them (time to start heading down), and one when
it's actually their turn. From the moment it's officially their turn, they
have 3 minutes to scan the machine — this is how they claim it. Claiming
means the machine is theirs because they've arrived; actually starting the
wash is a separate tap afterward, since they need a moment to load clothes
and detergent. Miss the 3-minute window, and they move back one place
rather than losing their spot outright. In between — after the previous
person's cycle ends but before the next person has scanned in — the
machine shows as "free but unclaimed," visible to everyone, so people can
see the next person might be running late and a chance to move up could be
coming.

If they decide not to do laundry after all, cancelling moves everyone
behind them up by one.

Sometimes a chance comes up earlier than expected — either because the
person ahead of them missed their turn, or because a different machine of
the same type freed up with nobody queued for it. Both cases are handled
the same way, as an offer: accept, and they have 10 minutes to come down
and scan; decline, or don't respond within 2 minutes, and the offer passes
to the next eligible person while they keep their original place; accept
but then don't show up within 10 minutes, and it counts as a missed turn
(move back one place, not to the back of the line).

If the previous person's clothes are still in the machine when it's done,
the next person can take them out, put them in a basket or numbered shelf,
mark that in the app, and the owner is told.

Underneath, each machine has its own short line — used both for ordinary
reservations and for someone moving up a place after a missed turn. The
app's auto-assign option puts a new reservation into whichever machine's
line would actually start earliest (by estimated start time, not by how
many people are in each line). For earlier-machine offers specifically,
all the lines for one machine type are treated as a single queue ordered
by when people joined, and the offer goes to whoever's been waiting
longest among those for whom switching would genuinely be earlier —
someone who's already about to start on their own machine gets skipped,
and the offer moves to the next person instead.

## Current state

- Crit 8, both stages built. `README.md` has a "good" argument grounded in
  the real mechanism, an honest enforced/judged split, and what's excluded
  on purpose vs. just not built yet. `CLAUDE.md` has the app rules. Four
  ADRs are locked in: app concept (0001), identity (0002, superseded),
  tech stack (0003), identity format (0004).
- Stage 1 (schema, routes, queue logic) and the UI design pass are both
  built and committed; `spec/queue-fairness.test.ts`,
  `spec/queue-order.test.ts`, and `spec/identity-format.test.ts` all pass.
- Stage 2: the real Dockerfile replaces the placeholder (Node 24 runs
  TypeScript directly, no build step), `fly.toml` points `DATABASE_PATH`
  at the volume, and `/readme/` renders `README.md` via `marked`. `pnpm
  check` is green (6/6) against a locally-run instance — Docker itself
  isn't available in this dev environment, so the exact `docker build` CI
  runs hasn't been verified locally; that's CI's job on push.
  `PROCESS.md` is written (246 words).
- Still needed before shipping: `reflections/crit-8.md` (the user's own —
  not drafted by the agent), then flipping the repo public and deploying.
- **Crit 9, all stages 1-4 and 7 done; shipped.** Real-time sync over SSE
  (a server tick, not just write-triggered broadcasts, catches passive
  expiries — a claim window running out with nobody making a request —
  within ~1s). The documented multi-user decision: #1's fairness rule
  upgraded from crit 8's blunt "ejected outright" to "move back one
  place," plus #12's cross-machine "earlier machine" offer, both decided
  together since the offer mechanism only exists because the move-back
  rule creates the slack it responds to — see
  [`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md).
  Along the way, also dropped the reservation detail page (redundant once
  every action was already on the home page) and added "end the wash"
  (ends a running wash early, the same end state a normal finish already
  produces). `spec/offer.test.ts` covers the offer's accept/decline paths;
  the move-back-one swap stays manually verified (same as the rest of
  crit 8's timing-dependent behavior — nothing automates waiting out a
  real window). `README.md`'s "Several people at once" now describes the
  real mechanism. `PROCESS.md` rewritten in full (948 words, per the
  final-project brief's 900-1100 target).
- **Crit 9 Stage 6 (visual design pass) done.** User-supplied reference
  UI (`research/1.png` plus Instagram/site examples, see
  `research/ui-references.md`) drove a redraw: rounded illustrated
  machine icon, status-dot sequence for a reservation's own lifecycle
  (not queue position, which can move backward), nav moved above the
  title, palette/contrast pass. Adopted/not-adopted reasoning recorded
  inline in `plans/crit-9.md` Stage 6, benchmarked against
  `plans/crit-8.md`'s accessibility rule (colour/shape never the only
  cue) and the move-back-one mechanic.
- **Crit 9 Stage 8 (dryers, the stretch) done.** No new machines — 2 of
  the existing 10 washers converted to dryers (idempotent conversion,
  verified against a real pre-existing production-shaped database). A
  resident gets asked, after reserving a wash, whether to also queue a
  dryer for after it; `pickDryer()` picks the dryer that's soonest
  genuinely available *after* the wash itself finishes, not just whoever
  is "next in line" — the claim window on that dryer reservation doesn't
  start until the linked wash reaches "done", so it can't expire before
  the resident could physically be there. Dryer icon now also has its
  own colour and shape detail (orange drum, vent slits) rather than
  sharing the washer's icon verbatim.
  `reflections/crit-9.md` written (the user's own). **Crit 9 is fully
  shipped**, deployed and verified live at
  `https://comp4020-final-yuehesun.fly.dev/`.
- **Crit 10 ("fly by instruments") — Stages 1-5 done, deployed and
  verified live.** `src/logging.ts` tags every log line via
  `AsyncLocalStorage` (not a module-level variable, since a shared
  mutable tag would mislabel the concurrent-actions scenario this crit
  demonstrates). Every state-changing POST gets a request line plus a
  named event (including denied cross-room attempts — the brief's own
  authorization example); GETs are excluded (crit 9's SSE re-fetches
  would otherwise bury "who did what" in polling noise). The queue's own
  tick-driven decisions (a move-back-one swap, an offer's creation or
  expiry) are logged too, under one shared tag per decision rather than
  attributed to a request that doesn't exist — verified by letting a
  real 3-minute claim window lapse untouched. `docs/adr/0006-action-
  logging.md` documents the shape and states plainly that log content is
  judged, not enforced (`spec/` never captures stdout). Deployed
  (`https://comp4020-final-yuehesun.fly.dev/`); a live smoke test — two
  room numbers, one denied cross-room cancel — confirmed `mise exec --
  flyctl logs -a comp4020-final-yuehesun` reads exactly as designed.
  **Still needed:** Stage 6's real two-Chrome-profile rehearsal (the
  user narrating from the logs alone, not curl standing in for it),
  Stage 7 (bonus, peak times from logs — needs its own persisted table,
  not reuse of stdout logging, per the plan's own scope note), Stage 8's
  wrap-up (`PROCESS.md` rewrite, `reflections/crit-10.md`).
- **Crit 10 extension — one unattended ~2-hour run per `prompt.md`,
  Stages 9-12 shipped, Stage 13 (stretch) not attempted.** `src/clock.ts`
  is the one seam `queue.ts` reads time through; `sim/` (seeded PRNG,
  forward-only virtual clock, a driver that calls the real `queue.ts`
  functions, no rule copied) backs `spec/fairness-properties.test.ts`
  (fast-check, 200 runs x 60 steps, all 7 ADR 0007 invariants) and
  `spec/queue-timing.test.ts`. The property tests found and fixed a real
  concurrency bug in `moveBackOnePlace` (two same-millisecond joins tied
  `joinedAt`, making the fairness swap a no-op — exactly the "several
  rooms join at once" case ADR 0008 exists for); the deliberate-break
  drill's shrunk counterexample is quoted in commit `8118424` and
  `HANDOFF.md`. `spec/contention.test.ts` (20 simultaneous joins, double
  claim, double-submit dedup) and `spec/restart.test.ts` cover ADR 0008;
  an SSE reconnect notice + full fragment refetch was verified by
  `SIGKILL`ing a real server mid-connection. In-page turn alerts (native
  `<dialog>`, `document.title` flash, once per transition via
  `sessionStorage`) ship per ADR 0009. The home page was redesigned from
  a Flighty reference (`research/flighty/`, `research/design-plan.md`
  committed before any CSS) into a departure-board layout with a
  signature status-hero (remaining time at 4.5x body text); the >=2-round
  scored review (`research/design-review.md`) found and fixed two real
  display bugs (a stale "0:00" on "Claimed", a wrong static "Done" on a
  running wash) by actually looking at screenshots, plus a Stage 6
  critique round (intro paragraph width, offer card countdown
  prominence). `research/screens/before-*.png` and `after-*.png` (same
  names) are both committed. **Not attempted:** Stage 13's fairness
  simulation (`sim/results.json`, `/fairness`) — explicitly the run's own
  first thing to cut, and Stage 12 (flagged the most important, not to
  be shortcut) took the run's bulk of time instead. Full detail, every
  unasked-for call, and what's still weakest: `HANDOFF.md`. Docker build
  verification could not be completed in this environment (WSL2 without
  Docker Desktop's WSL integration enabled) — `pnpm check` was confirmed
  green against a plain local server instead; the real `docker build`
  path is still to be checked by hand before shipping.
- **3D walkthrough — two unattended runs per `prompt.md` on branch
  `3d-walkthrough`. First run: Stages 1-3 plus Stage 6's non-phone parts
  shipped; Stage 4 (the real phone scan) and Stage 6's recorded-clip item
  explicitly not attempted, by design, regardless of the time budget —
  see `plans/3d-walkthrough.md` and `docs/adr/0012-3d-walkthrough.md`.**
  A first-person three.js scene at `GET /laundry` (pinned CDN ES module,
  no bundler — `docs/adr/0003`'s no-build-step property holds), reachable
  from every page's nav unconditionally, WASD + pointer-lock mouse-look
  on desktop and an on-screen joystick + drag-look on touch, both
  confirmed via real Playwright screenshots in this WSL2 environment
  (a one-time, outside-the-repo fix made the Playwright/WebGL sandbox
  issue go away — see `HANDOFF.md`). Each of the 10 machines shows its
  real, identity-aware queue state (`GET /laundry/machines-state`, reusing
  `board-state.ts`'s exact logic the 2D board already uses) and updates
  live via a second `EventSource("/events")` on the exact same SSE stream
  `src/realtime.ts` already broadcasts — no new transport, no new
  broadcast logic. Each machine carries a real, server-rendered QR code
  (`GET /machines/:id/qrcode.png`, the `qrcode` npm package) encoding
  `/laundry/scan/:id`; scanning it (confirmed by an actual jsQR decode of
  the rendered PNG, not assumed) lands on a page that branches into
  exactly the three cases `plan.md`'s own long-standing User story already
  described — confirm-and-claim, a fresh reservation on an idle machine
  (this ships the "walk up and scan a machine's code on site" line, true
  since crit 8 but never built until now), or a read-only view — built
  entirely from existing `queue.ts` functions (`src/queue.ts` itself is
  untouched throughout this stage). `docs/adr/0012` records the one real
  product decision: the QR payload carries no token, matching how room-
  number identity is unverified everywhere else in this app. A Stage 6
  visual pass (warm lighting matching the app's own palette, soft
  shadows, a drum-ring detail echoing the 2D machine icon) and a claim-
  success flash (fires exactly once per real claim transition, confirmed
  not to re-trigger on unrelated SSE events) both shipped, verified the
  same screenshot-first way as crit 10's own design pass.
  `spec/laundry-scan.test.ts` (5 tests) covers the scan page's branches
  and the identity-redirect's open-redirect rejection. Screenshots in
  `research/screens/laundry-stage*.png`. Full detail and every unasked-
  for call: `HANDOFF.md`. **Still needed, by the user's own hand** (needs
  a real phone and a real deployment, neither available to an unattended
  run): Stage 4's real two-device scan rehearsal, and only after that, the
  real phone-scan demo clip.
- **3D walkthrough, second run: Stage 7's remaining sub-stages (7.2, 7.3)
  plus all of Stage 8 shipped.** Pointer lock is requested automatically
  on entering `/laundry`, with a corner hint tracking real lock state
  (click-to-lock stays as the fallback the browser falls back to without
  a user gesture). QR codes moved out of the old always-visible in-scene
  plane into a proximity-triggered examine overlay (a native-resolution
  `<img>`, confirmed scannable by a real jsQR decode, not a WebGL
  texture). The first-person camera from the first run is gone: real CC0
  GLTF models (Kenney's Furniture Kit and Mini Characters,
  `public/models/SOURCES.md`) replace every placeholder box, laid out
  against a floor-plan sketch written before any layout code
  (`plans/3d-walkthrough.md` Stage 8.2), with a third-person character
  (real walk/idle animation crossfade, a camera rig clamped so it can
  never clip through a wall) and proximity-based interaction replacing
  screen-centre raycasting. **Ships feature #18** (the "unclaimed laundry
  handed off to a numbered pickup spot" gap): a deliberate, narrow
  exception to `loadOwned` lets whoever holds the front waiting
  reservation on a machine move its previous, finished-but-uncollected
  laundry to a server-assigned spot from a fixed list; the original owner
  is notified (reusing the existing `notice` mechanism) and acknowledges
  collection to free the spot again — `docs/adr/0013-laundry-handoff-
  authorization.md` records who may trigger it and why, and
  `spec/laundry-handoff.test.ts` drives the whole flow (including a
  full six-spot cycle, confirming a seventh handoff is rejected while the
  pool is genuinely full and succeeds again once a spot is freed) against
  the real running app. `src/queue.ts`'s pre-existing exported functions
  are unchanged throughout both runs — every bit of handoff logic lives
  in new functions alongside them. One real bug found along the way by
  the spec itself: a repeated handoff call used to silently reassign
  already-moved laundry a second spot, fixed by also excluding
  `pickupSpot IS NOT NULL` from what counts as still-unclaimed. A second
  gap, found only by an actual end-to-end Playwright run rather than unit
  tests (the drop-off shelf's own numbered-spot-occupied marker was never
  wired to real server state), was caught and fixed the same way. Full
  detail, every real debugging dead end (the status-light placement
  saga, the camera-wall-clip fix), and what's still weakest: `HANDOFF.md`.
  Screenshots in `research/screens/laundry-stage7-*.png`,
  `laundry-stage8-*.png`, `laundry-stage84-*.png`.
- **Stage 9.1 fixed, `3d-walkthrough` branch merged into `main` and
  deployed.** Separately from the two unattended runs above, the user
  found two real problems by actually using the Stage 8 build — recorded
  in `plans/3d-walkthrough.md` Stage 9. **9.1 (the character vanishing
  during movement) is fixed** (two stacked causes: an animation clip's
  root-motion track fighting the code's own position control, and a
  stale bind-pose bounding sphere defeating frustum culling on the
  animated skeleton — see commit `f34d80a` for the full root-cause
  writeup). The `3d-walkthrough` branch (all of Stages 1-9.1) was merged
  into `main` (merge commit `060c6f7`) and pushed; CI's `check` job (a
  real `docker build`, the first real verification of this branch's
  Dockerfile changes — WSL2 here can't run Docker locally) and `deploy`
  job both passed, and `https://comp4020-final-yuehesun.fly.dev/` is
  confirmed live with the 3D walkthrough (checked directly: `/` returns
  200 and links to `/laundry`, `/machines/1/qrcode.png` returns a real
  200). **Stage 4 (a real two-device phone-scan rehearsal) still hasn't
  happened** — it needs a physical second phone, which now that the real
  deployment exists is finally possible; do this by hand, not the agent's
  job.
- **Stage 9.2 (floor-plan redo) implemented and verified locally, not yet
  deployed.** Full design-before-code plan and build detail in
  `plans/3d-walkthrough.md` Stage 9.2/"9.2 built and verified": machines
  split data-driven across north (5 washers) and east (3 washers + 2
  dryers) walls, matching the user-confirmed layout exactly; the whole
  west wall is now the drop-off/public zone, three real sourced
  `bookcaseOpen.glb` shelving units (new CC0 asset, confirmed and
  measured the same way Stage 8.1 verified its own models — see
  `public/models/SOURCES.md`) replacing the old single small table, with
  a `THREE.Sprite`/`CanvasTexture` "DROP-OFF" billboard label; sink +
  ironing table merged into one free-standing island in open floor;
  ceiling lamps now a room-covering grid instead of a one-wall layout.
  Room width came out to almost exactly half of Stage 8.2's own built
  value (9.4 vs. 19.4), matching "within half the current width."
  `pnpm check` green (13 files, 30 tests) against a scratch server;
  `src/queue.ts` untouched throughout, confirmed by diff. **A real bug
  this stage's own verification found and fixed**: splitting the old
  single `dropoffGroup` into three bookcase groups left one proximity-
  highlight function still referencing the deleted variable — an uncaught
  exception inside the per-frame render loop that silently stopped the
  whole scene from ever redrawing again once triggered, a symptom
  indistinguishable from "the character stopped moving." Full detail,
  including the misleading-verification lesson this one produced (a
  crashed render loop makes every later test point in the same browser
  session look "stuck" regardless of its own correctness), is in the plan
  file. **Stage 9.3 (debug: the character sometimes doesn't visibly move;
  the very first frame looks like a blank fog wall) is separately
  recorded but explicitly deferred** — real evidence gathered, two
  concrete next steps written down, not yet investigated to a root cause;
  see `plans/3d-walkthrough.md` Stage 9.3. **Not yet done for Stage
  9.2**: a fresh round of Playwright screenshots specifically re-checked
  against the Stage 9.2 plan's own verification checklist end-to-end in
  one pass (individual requirements were spot-checked during build, but
  not yet gathered as one dedicated final review), and deploying.
- **Stage 9.4 (drag-to-look, machine-detail investigation, a flush
  indicator light, oversized interactables) implemented and verified.**
  See `plans/3d-walkthrough.md` Stage 9.4/"9.4 built and verified" for
  the full design and build record. Prompted by the user trying the
  Stage 9.2 build and raising four separate questions; each was
  investigated directly (not guessed) before the plan was written —
  confirmed every washer model is identical (a lighting/distance
  perception effect, not a real model-detail bug), confirmed the status
  light's free-standing-stalk design and the unclaimed-laundry ring are
  both real, load-bearing UI (not placeholder cruft), and confirmed a
  1.8x machine scale is floor-space- and ceiling-safe without touching
  Stage 9.2's own halved room dimensions. Pointer lock replaced with
  drag-to-look (verified with real mouse events: drag rotates the camera
  without firing a stray interact, a plain click still opens the examine
  overlay). A real geometric bug found during the new indicator light's
  own screenshot verification — not visible before, since nothing
  previously rendered at that position — meant the status light, and the
  pre-existing QR/examine proximity anchor, used one hardcoded "toward
  the room" sign that only happens to be correct on one wall; fixed with
  a per-wall `frontSign` factor, confirmed by screenshot on both walls.
  `MACHINE_SCALE = 1.8` applied inside `footprintOf()` only for washers/
  dryers, so collision boxes, the light, the anchor, and the unclaimed
  ring all stay in sync automatically; also fixed a pre-existing
  hardcoded-literal bug in the unclaimed-ring's height offset. Verified:
  a real walk through the gap between two adjacent scaled machines
  reaches the far side with no clipping; `pnpm check` green (14 files, 36
  tests); `src/queue.ts` and the concurrent presence-work files
  untouched, confirmed by diff.
- **A new, separate plan file, `plans/laundry-presence.md`, written (no
  code yet) for a genuinely new subsystem**: letting residents see each
  other's characters moving in the shared 3D room, prompted by the user
  noticing the room number a visitor signs in with was never actually
  bound to the character they control (`laundryPage()` never receives an
  `identity`, unlike every 2D-board render function), making the 3D room
  visually single-player despite sitting on a fully real multi-user
  queue underneath. Given its own file (not folded into
  `plans/3d-walkthrough.md`, which was already 1600+ lines) because it's
  architecturally a new kind of thing — a new always-on transport
  (`src/presence.ts`, a second SSE stream separate from
  `src/realtime.ts`'s existing change-signal tick, since presence is
  continuous high-frequency state, not a discrete change signal), new
  in-memory (never persisted, never in `src/schema.ts`) server state, and
  client-side handling of multiple remote character instances — not a
  small addition to the existing single-character room code. Full design
  written: wire format, the exact `src/presence.ts`/`src/app.ts`
  additions, client-side reporting/receiving/interpolation (including a
  yaw-wraparound bug class identified and designed around before any code
  exists), a full ADR draft (`docs/adr/0014-laundry-presence.md`,
  recording that this only works because of `fly.toml`'s single-machine,
  `--ha=false` deployment), and a fix for the character's own
  look-direction-independent facing (a real, separate local bug that
  becomes visible to *other* residents the moment presence ships, so it's
  folded into this same plan's Stage 2 rather than left for later). Two
  claims an earlier draft of this plan made were checked against the real
  codebase and found wrong before committing to them — no existing
  `spec/*.test.ts` file reads an SSE stream, and no existing spec uses
  Playwright/browser contexts for multi-actor scenarios (they all use a
  second cookie string) — both corrected in the plan itself, each flagged
  explicitly as a correction rather than silently fixed, so a future
  reader doesn't wonder why the plan second-guesses itself.
- **Laundry presence Stage 1 (server-side module and routes) built and
  verified.** `src/presence.ts` (in-memory `PresenceRecord` map, keyed by
  a per-tab id, `report`/`removeStale`/`remove`/`all`, a dedicated SSE
  broadcast loop on its own 250ms tick, separate from
  `src/realtime.ts`'s own), `POST /laundry/presence`, `POST
  /laundry/presence/leave`, `GET /laundry/presence-stream` (all in
  `src/app.ts`), `docs/adr/0014-laundry-presence.md`, and
  `spec/laundry-presence.test.ts` (6 tests, including a real 5.2s wait
  for `STALE_MS` cleanup, consistent with this project's existing
  precedent for a real-time wait elsewhere in its spec suite) — all green
  against a scratch server, `pnpm check` green overall (14 files, 36
  tests). `src/queue.ts` untouched, confirmed by diff. Two more
  inaccuracies caught and corrected in the plan file itself while
  implementing, beyond the two already fixed when the plan was first
  written: `startRealtimeLoop()` (and now `startPresenceLoop()`) is
  called from `src/server.ts`, not `src/app.ts` as an earlier draft said;
  and `clock.ts`'s `setClock()` seam cannot inject a shorter `STALE_MS`
  for the stale-cleanup test, since that seam only ever works in-process
  against an in-memory database (`sim/`, `spec/fairness-properties.test.ts`)
  — this spec drives the real server over HTTP from a separate process,
  so it simply waits out the real 5-second default instead. **Stage 1 was
  built in parallel with Stage 9.4's own implementation** (a different
  session's background fork, concurrently editing `src/laundry-view.ts`)
  — deliberately scoped to files Stage 9.4 never touches
  (`src/presence.ts`, `src/app.ts`, `src/server.ts`, a new spec file) so
  the two could proceed without conflict.
- **Laundry presence Stage 2 (client-side reporting/receiving, and the
  local facing fix) built and verified, once Stage 9.4 landed.**
  `reportPresence`/`updateRemoteCharacters` wired into the existing
  `frame(now)` loop; `buildRemoteCharacter`/`upsertRemoteCharacter`/
  `removeRemoteCharacter` render other residents' characters (shared
  `character.glb`, per-identity flat colour via a deterministic hash, a
  floating room-number label reusing a refactored
  `buildLabelSprite(text, opts)` shared with the "DROP-OFF" sign); the
  character-facing-doesn't-track-camera-direction fix (`wasMoving`
  tracking, a one-time snap on the moving-to-stopped transition) landed
  in the same stage, since the broadcast yaw this stage adds needed it to
  be correct. One real bug caught by reading the code before running it
  (an `entry` variable referenced inside a `loadModel()` callback before
  its own declaration — harmless only on the very first call, since
  `loadModel()` is synchronous whenever its URL is already cached, which
  `character.glb` always is by the time a remote character is ever
  built) and two verification-process mistakes (a `pkill -f` that
  silently failed to kill a `DATABASE_PATH=...`-prefixed background
  server, since the prefix is a shell assignment invisible to the
  spawned process's own argv; and an early "label doesn't render" result
  that was actually a camera-framing problem — the screenshot was taken
  before walking close enough to the remote character to frame it) are
  recorded in full in `plans/laundry-presence.md`'s "Stage 2 built and
  verified" section. Verified end-to-end: a real Playwright page plus a
  second identity simulated via scripted `fetch()` reports (no second
  browser, per the plan's own design) — appearance, movement
  interpolation, the labelled room number, explicit-leave removal, and
  independent `STALE_MS` timeout removal all confirmed; the facing-snap
  fix confirmed via a real mouse drag after stopping. `pnpm check` green
  (14 files, 36 tests); `src/queue.ts` untouched.
- **Stage 9.5 (north-wall machines facing the wall, fixed; an automated
  geometry test added) built and verified.** User-reported with a
  screenshot: north-wall washers/dryers showed their door to the wall,
  not the room, despite Stage 9.4.3's `frontSign` fix. Root cause
  confirmed before fixing (not assumed from the 9.4.3 commit's own
  claim): `frontSign` only flipped the status light's/QR anchor's own
  *offset* sign, never the model's actual `group.rotation.y`, so a
  backwards machine's light still read as "facing the room" while the
  door underneath it stayed wrong — a real Playwright probe of
  `window.__laundryMachineGroups` plus a standalone rotation check
  confirmed the north wall's `Math.PI` sent the model's local +Z to its
  own wall side, not the room. Fix: room geometry (wall positions, each
  machine's x/z/facing) extracted out of `LAUNDRY_SCRIPT` into a new
  plain-TypeScript module, `src/laundry-layout.ts` (no `THREE`/DOM
  import), with `facing` now derived per wall from each wall's own
  declared interior direction instead of a hand-picked constant;
  `laundryPage()` computes it once server-side and hands it to the
  client via the existing JSON data island, so there's exactly one copy
  of this arithmetic, not two that can drift apart the way `facing` and
  `frontSign` already had. `frontSign` itself is deleted as redundant.
  `spec/laundry-layout.test.ts` (new, pure-function, no Playwright/
  browser) asserts every machine's facing dots `>0.9` against its own
  wall's interior direction — confirmed to actually fail against the old
  bug (reverting the fix locally reproduces a `-1.0` dot) and pass after
  it, so this class of bug (not just this one instance) has a real
  regression check now. Also answered, from the code and confirmed by a
  forced-visible screenshot: the yellow ring above a machine is
  `unclaimedMarkers` (Stage 8.4's "unclaimed laundry waiting" marker),
  sharing its colour with the highlight ring on purpose (both mean
  "needs attention") but a distinct mesh/trigger — not a bug. `pnpm
  check` green (39 tests, up from 36); `src/queue.ts`,
  `src/presence.ts` untouched. See `plans/3d-walkthrough.md` Stage 9.5/
  "9.5 built and verified" for the full root-cause writeup.
- **Laundry presence Stage 3 (visual polish) built and verified — two
  real bugs found, not just tuning.** Most of this stage's planned work
  (per-identity colour, the floating label, the lerp constant) was
  already built in Stage 2; this stage's own verification pass against
  real multi-identity conditions found two bugs neither visible from
  reading the code alone: (1) the yaw-wraparound interpolation formula
  in `updateRemoteCharacters` was itself wrong — JavaScript's `%` is a
  remainder, not true modulo, so a negative numerator produced a
  negative remainder instead of wrapping into `[0, 2*PI)` first, sending
  some turns the long way around in the wrong direction (confirmed with
  a real 3.0→-3.0 yaw report, sampled repeatedly: pre-fix gave `dYaw =
  -6`, post-fix rose monotonically from `3.0` to the correct `3.283`);
  (2) `colourForIdentity`'s rolling hash had no mixing step, so adjacent
  room numbers (`room502`/`room503`, an entirely ordinary real case)
  hashed to nearly the same hue — confirmed with a real two-identity
  screenshot showing both as the same shade of pink, fixed by running
  the hash through `fmix32` (MurmurHash3's avalanche finalizer) before
  `% 360`, producing clearly distinct colours (`#a8cb4d` vs. `#4d60cb`)
  for the same two identities. `pnpm check` green (39 tests); only
  `src/laundry-view.ts` changed. See `plans/laundry-presence.md` Stage
  3/"Stage 3 built and verified" for the full numeric verification.
  **Laundry presence is now fully built (Stages 1-3) and verified
  locally; not yet deployed.**
- **Stage 9.3's long-deferred "character doesn't visibly move" bug finally
  root-caused and fixed, not just re-investigated.** Every earlier
  automated check had confirmed `characterRoot.position` and the model's
  own bounding box were correct, and concluded there was no bug — the
  real defect was one level deeper: `loadModel()`'s plain
  `Object3D.clone(true)` silently shares one skeleton object across every
  clone of a rigged model (`THREE.SkinnedMesh.copy()`'s own behaviour,
  not a bug introduced here), so the character's bones stayed frozen at
  the origin forever while every position variable this file tracks was
  genuinely correct the whole time. Fixed by switching to three.js's own
  `SkeletonUtils.clone()`, a safe drop-in for every other (non-skinned)
  model `loadModel()` already serves. A second, independently real bug
  found investigating the same report — the camera could clip through
  the ceiling at the top of its look-pitch range, since only the
  horizontal camera position was ever clamped to the room's walls, never
  the vertical one — is fixed alongside it, plus lowering `CAM_HEIGHT` to
  a more human eye level per the user's request. Full root-cause writeup,
  including the diagnostic process that found it (a primitive-model swap
  done live in the user's own browser, then an isolated `git worktree`
  build to inspect the skeleton's bone transforms without disturbing that
  session): `plans/3d-walkthrough.md`, "Stage 9.3" section. `pnpm check`
  green (39 tests); user-confirmed fixed by eye in their own browser.
- **Four small follow-up polish items, all requested after the Stage 9.3
  fix, verified and committed together.** (1) The carried-basket prop
  redesigned from a plain red box (read as "an alert colour", not "a
  laundry basket", and nearly the same luminance as the character's old
  skin tone) into a tapered wicker-coloured frustum with a small coloured
  "clothes poking out" accent — shape now says "this is a basket",
  colour's only remaining job is "whose is it." (2) The local character's
  own skin tone changed from a warm tan to a neutral grey-white, both to
  fix the basket/skin colour clash (confirmed via a relative-luminance
  check before changing anything: ~1.02 contrast ratio, i.e.
  indistinguishable) and because the local player never needs a colour to
  recognize themselves — only remote characters (coloured by
  `colourForIdentity`, fixed 55% saturation, confirmed via a real
  two-browser test to never collide with the new neutral tone) need
  colour to tell people apart. (3) Removed a Stage 9.4/laundry-presence-
  era behaviour where the character snapped to face the camera's own look
  direction the instant movement stopped — with drag-to-look as the
  camera scheme this meant a stopped character span to face the viewer
  regardless of which way it had actually walked; it now simply keeps its
  last walking-direction facing, confirmed by dragging the camera far
  after stopping and checking `rotation.y` stayed exactly unchanged.
  (4) Added a small floating "this is you" marker (a downward-pointing
  cone) above the local player's own character — the common multiplayer-
  game convention for telling players which on-screen character is
  theirs, needed once the local character's new neutral colour no longer
  stands out on its own; confirmed purely local (never broadcast via
  `reportPresence`) via a real two-browser-context test showing the
  marker absent from the other viewer's own screen. `pnpm check` green
  (15 files, 39 tests); only `src/laundry-view.ts` changed.
- **A real animation-binding bug introduced by the self-marker fix above,
  found and fixed the same session.** The user reported the local
  character showed the new neutral colour but its limbs never visibly
  moved, on the deployed site. Root cause: `characterMixer` bound to
  `characterRoot.children[0]`, an assumption that the character model is
  always `characterRoot`'s first child — true until the self-marker fix
  added `selfMarker` as `characterRoot`'s first child *before* the model
  loads, silently making `children[0]` the markerless cone instead of the
  model. The AnimationMixer therefore drove an object with no skeleton,
  so walk/idle animations played against nothing while
  `characterRoot.position` (and therefore the character's on-screen
  location) stayed correct — this is the same bug shape as the Stage 9.3
  shared-skeleton bug, a different root cause producing the same
  "position is right, animation looks dead" symptom. Fixed by tracking
  the actual loaded model in its own `characterModel` variable, set where
  the model is added, and binding the mixer to that directly regardless
  of sibling order. Verified by sampling a leg bone's own local rotation
  across 8 frames while walking — confirmed genuinely changing frame to
  frame (not frozen at the bind pose), not just inferred from the walk
  weight ramping. Also addressed, in the same commit: the carried-basket
  prop's "clothes poking out" colour accent (added in the item above) was
  dropped at the user's request — the basket is now a single plain wicker
  colour, no own/other colour distinction on the prop itself (the
  underlying `basketKind` state Stage 8.4's handoff flow depends on is
  unchanged; it just no longer has a visual expression). `pnpm check`
  green (15 files, 39 tests); only `src/laundry-view.ts` changed.
- **Basket clipped into the body — fixed by moving it, not the animation
  system.** The user reported the basket looked like it floated/clipped
  into the character's torso. Two options were weighed: give the arms a
  real "holding" pose (the model's own `holding-both` clip, confirmed via
  a real inspection of its tracks to move only `arm-left`/`arm-right`) or
  just reposition the basket — the user chose the simpler reposition,
  explicitly ruling out any animation change. Investigated before
  touching any number: a real `Box3` reading of the body model's own
  local bounding box (not a guess) showed its front surface sits at
  z ~= 0.159, while the basket's old z = 0.18 position was its *center*,
  not its near face — with the basket's own 0.13 top radius, its actual
  near edge sat at 0.05, well inside the body's own z-range, which is
  what caused the clipping. Moved to z = 0.32, confirmed via a real
  `Box3.intersectsBox()` check (not just a screenshot) that the basket
  and body boxes no longer overlap (clearance ~0.025), and via front/side
  screenshots that the basket now reads as held in front of the body, not
  embedded in it. `pnpm check` green (15 files, 39 tests); only
  `src/laundry-view.ts` changed; no animation/clip code touched.
- **Intermittent "limbs never animate" report on the deployed site,
  self-resolving on reload — root-caused to a real missing-retry gap, not
  a logic bug.** The user saw their own character's walk animation never
  play at all on one real page load; a hard refresh fixed it with no code
  change in between. Two timing-based theories (the two separate
  `character.glb` requests racing, or network latency reordering their
  callbacks) were investigated and ruled out with real evidence: a
  request-interception test showed the browser's own fetch cache collapses
  both requests into one in-flight load (so there's only ever one network
  request to begin with), and a throttled-network trace (150ms latency,
  CDP-level) confirmed the body-model callback always fires before the
  animation-data callback regardless of latency — the two loads aren't
  actually racing. The real cause: `gltfLoader.load()` for the
  animation-only load (the second `character.glb` fetch, for
  walk/idle clip data) had no error callback at all, and `loadModel()`'s
  own error callback just logged and gave up — a transient network
  failure on either load silently left the animation system (or that one
  model) broken for the rest of that page's life, with nothing ever
  retrying and nothing printed to explain why. `fly.toml`'s
  `auto_stop_machines`/`min_machines_running = 0` setup (the machine cold-
  starts on the first request after being idle) makes exactly this kind of
  one-off network blip more likely right after a cold start, matching the
  user's own "self-resolves on reload" report. Fixed with a shared
  `loadGltfWithRetry()` helper (3 attempts, 400ms backoff) used by both
  `loadModel()` and the animation-only load. Verified by deliberately
  aborting the first `character.glb` request in a real browser test and
  confirming the retry recovers and the walk animation plays normally
  (a leg bone's own rotation sampled across 6 frames, all distinct).
  `pnpm check` green (15 files, 39 tests); only `src/laundry-view.ts`
  changed.
- **Nine real problems found by using the deployed build — investigated,
  planned, built, and verified, all in one unattended pass** — full
  detail in `plans/3d-walkthrough.md` Stage 10/"Stage 10 built and
  verified": a real sink/table collision gap, root-caused precisely (the
  collision box's own center point didn't match where the model actually
  renders — the same corner-origin quirk the machines already correct
  for, never applied to these two props — not just a stale size guess),
  fixed by routing both through `footprintOf()`/`MODEL_BBOX` the same way
  every machine already is; confirmed by a collision-grid probe (now one
  solid gap-free rectangle, was a wide-open north side) and a simulated
  walk straight up the island's own former gap, which now stops dead
  against the fix. Character-to-character collision confirmed as a
  deliberate, documented non-goal (`plans/laundry-presence.md`), no
  change. Sink/table scale (`DECOR_SCALE = 1.3`) and a real procedural
  iron prop (tapered extruded sole + torus handle, sitting on the table's
  own measured surface height) replacing the flat-colour placeholder box
  — no real CC0 iron model exists after checking Kenney, poly.pizza, and
  Poly Haven. The carried basket enlarged (`BASKET_SCALE = 1.35`) and
  re-rounded (10 → 24 radial segments), its clearance from the body
  re-derived from the same measurement the original anti-clipping fix
  used, so a bigger basket can't reintroduce that bug. The separate
  yellow "unclaimed laundry" ring deleted entirely, folded into the
  status light's own colour (confirmed live against a real claimed
  reservation and a real pre-existing unclaimed-laundry case — `#2b5f8a`
  and `#ffd54a` respectively, read directly off the material, not
  inferred); the vacated spot now holds a per-machine number label
  (reusing the existing drop-off sign's `buildLabelSprite()` helper, no
  new one). Scroll-wheel zoom added (`CAM_DISTANCE`, clamped, confirmed
  via a real wheel event moving the camera's own world position).
  Scanning a machine while already identified now redirects (303) to the
  real home page instead of the separate scan-page shape — the existing
  scan-page code itself is untouched, per the user's explicit correction,
  only the already-logged-in route's destination changed; confirmed over
  HTTP for an idle machine, one someone else holds, and a nonexistent
  one, plus the unchanged logged-out/redirect-field behaviour.
  `spec/laundry-scan.test.ts` rewritten to match (two old page-content
  tests became three redirect-assertion tests). The 3D character's
  identity binding confirmed already correct, no change. `pnpm check`
  green (40 tests); `tsc --noEmit` clean; `src/queue.ts` untouched,
  confirmed by diff. Separately, this investigation also found and fixed
  a real verification-process incident: a prior `pnpm check` run had
  polluted the user's own long-running `pnpm dev` database with hundreds
  of leftover `waiting` reservations (every machine full, all with the
  same timestamp — the "did an agent's test script leave this behind"
  symptom was correct), since `spec/`'s default `APP_URL` is
  `localhost:8080`, the same port `pnpm dev` uses; cleaned up, and every
  verification in this stage used a separate scratch port/database
  instead, per `CLAUDE.md`'s own existing rule.
- **A second, smaller round of 3D-room feedback — three items built and
  verified (one of them revised twice after further real bugs the first
  pass introduced), one (the drop-off flow rework) scoped into its own
  plan, not coded.** (1) Scroll-wheel zoom, through two follow-up
  corrections: the first widened range (0.6-7) and 4x sensitivity moved
  too fast in both directions and, worse, zooming in close enough
  revealed a real pre-existing-shape bug — `updateCamera()`'s vertical
  pitch offset (`Math.sin(pitch) * 1.2`) was a fixed absolute height
  change applied regardless of `CAM_DISTANCE`, so the same offset reads
  as a mild tilt at the original distance but snaps to a near-top-down
  angle once the camera sits much closer — fixed by scaling the offset
  with `CAM_DISTANCE` (`PITCH_HEIGHT_RATIO`) so the look angle stays
  constant at any zoom level. Final shape: sensitivity and max (zoom-out)
  distance reverted to their original values (0.0025, 5); only the
  zoom-in minimum stays closer (0.6, down from 1.8) — "zoom in more,
  zoom out doesn't need as much," per the user's own framing. (2) A real
  "this machine is yours" marker in the 3D room: `GET
  /laundry/machines-state` previously only derived `nextRoom`/`isMyTurn`
  from the *front* row of a machine's queue (`front?.person === identity`),
  missing a viewer waiting second-or-later or already claimed/running
  when a different row is front — a real bug, fixed with a proper
  `rows.some((r) => r.person === identity)` check (mirroring
  `src/views.ts`'s own `homePage`, which already did this correctly), now
  exposed as a new `isMine` field. Revised from its first pass (the local
  character's own muted amber self-marker colour) to the app's existing
  red alert colour (`STATE_COLOR`'s "your-turn"/"unclaimed" red) plus a
  gentle per-frame vertical bob, after feedback that picking your own
  machine out of a room of ten needed to be more attention-grabbing than
  a static colour match. (3) A door on the south wall, behind the
  character's own spawn point — two wall segments with a real gap, a
  lintel, a procedural wood-tone panel and handle; no collision-box
  change needed since none of the four room walls were ever in
  `collisionBoxes` (the room boundary is `clampToRoom`'s own range).
  **A real placement bug in the first pass** — the door panel was
  centered 0.088 units off from the doorway gap it sits in, both of
  which should share x=0 — was found and fixed, confirmed symmetric by
  direct recomputation (0.044 clearance on both sides) rather than by
  screenshot angle alone, since the room's own perspective made the
  misalignment hard to judge reliably by eye. `pnpm check` green (40
  tests) against a scratch database throughout every revision;
  `src/queue.ts` untouched. **The fourth item — reworking the
  unclaimed-laundry drop-off flow into a real two-step pick-up/place
  sequence — was investigated to a precise root cause (the 3D carry
  animation has no corresponding two-step server state; the reported
  flickering basket is two sources of truth racing, not timing jitter)
  and designed in full in
  [`plans/laundry-dropoff-flow.md`](plans/laundry-dropoff-flow.md), but
  deliberately not coded this session**: it needs a schema migration (a
  new `carriedBy` column), a new in-transit sentinel state, and splits one
  existing server action into two — real design work the user asked to
  see planned before any code, not a small fix like the other three.
- **A third round on the same two items — the zoom/pitch fix above
  turned out not to actually fix the reported bug, and the "yours"
  marker still disappeared too early.** The user pushed back rather than
  accepting the previous fix at face value, which was the right call:
  the previous "scale the pitch offset by `CAM_DISTANCE`" fix only
  addressed half the real problem. `CAM_HEIGHT` itself (a fixed 1.6) was
  still added to the camera's vertical position independently of
  `CAM_DISTANCE`, and the lookAt target sits at a different fixed height
  (0.9) — that 0.7-unit gap exists even at `pitch=0`, and grows into a
  much steeper angle as `CAM_DISTANCE` shrinks (a mild ~12° tilt at the
  original distance is already a ~49° tilt at the new closer-in zoom
  range), which is what actually caused "zooming in snaps to top-down"
  and "pitch barely moves once zoomed in" (the fixed gap had already used
  up most of the pitch range's own headroom). Fixed properly this time
  with a real spherical/orbital camera construction (the same shape
  `OrbitControls` itself uses) — the camera sits on a sphere of radius
  `CAM_DISTANCE` centred on the look target, so the viewing angle depends
  only on `pitch`, never on distance — confirmed by reading the camera's
  real position at both zoom extremes and recovering the identical angle
  for the same `pitch` regardless of `CAM_DISTANCE`, and by a real
  stepped mouse-drag test confirming pitch responds fully (14° to 50°
  and back) even at the closest zoom. Separately, the "yours" marker's
  `isMine` field could only ever derive from `queueFor()`'s active
  (waiting/claimed/running) rows, which drop a reservation entirely the
  moment it reaches "done" — so the marker vanished the instant a wash
  finished, not (per the user's own expectation) persisting until the
  owner actually collects their laundry. Fixed by adding `personName` to
  `doneUnacknowledgedOnMachine`/`doneUnacknowledgedFor` (both already
  scoped per-room everywhere they're used, so a pure addition) and
  folding "the viewer's own done-and-uncollected laundry is sitting here"
  into `isMine` — confirmed end to end over real HTTP calls (join, claim,
  start, finish, then checking `isMine` stays `true` through "done,
  not yet collected," only turning `false` after a real
  `acknowledge-pickup` call). `pnpm check` green (40 tests) against a
  scratch database; `src/queue.ts`'s only change is the additive
  `personName` field, read nowhere it wasn't already selected.
- **The drop-off flow rework (`plans/laundry-dropoff-flow.md`) built and
  verified — the real two-step pick-up/place split, per the already-
  approved design.** `handoffLaundry()` is replaced with `pickUpLaundry()`
  and `placeLaundry()`: pickup checks `isFrontWaitingHolder` and that a
  free spot exists (but doesn't reserve one), setting `pickupSpot` to a
  new `IN_TRANSIT` sentinel and a new `carriedBy` column (migration
  `drizzle/0007_mixed_pepper_potts.sql`, a pure addition); place looks up
  the in-transit reservation carried by exactly the acting room (not
  "whoever's still front of the queue" — that may have changed by the
  time it's placed), only now picks the real spot and sends the owner's
  `laundry_moved` notice. `IN_TRANSIT` is excluded from
  `occupiedPickupSpots()`/`firstFreeSpot()` everywhere, and
  `doneUnacknowledgedOnMachine()` deliberately keeps returning the row
  while in transit — the handoff indicator shouldn't clear until
  something is actually placed. `GET /laundry/machines-state` now reports
  `carryingFromMachine`/`basketKind` as real server state instead of a
  client-only variable — the actual fix for the old flickering-basket
  bug, since the server and the 3D scene can no longer disagree about
  whether a carry is still in progress. The 3D scene gained two real
  confirm overlays (pick-up: "Move room123's laundry?"; place: "Confirm
  placed," then "You placed it on Shelf A3 — open the app to let them
  know") per the user's own request, replacing the old immediate-on-
  interact action. `spec/laundry-handoff.test.ts` rewritten (2 tests
  grew to 4): the original authorization/pool-exhaustion/reuse coverage
  carried across the split unchanged in substance, plus two new cases the
  split itself introduces — an unauthorized "place" by someone other than
  the carrier (404, not 403 — the question is "are you carrying it," not
  "are you front of the queue"), and the pool genuinely filling between a
  successful pickup and that same carrier's own place call (409, with the
  carry preserved for a retry once a spot frees). `docs/adr/0013` gained
  an addendum recording the split without reopening its authorization
  boundary. `pnpm check` green (15 files, 42 tests) against a scratch
  server; `drizzle-kit generate` used for the migration, never
  `drizzle-kit push`, per `CLAUDE.md`.
- **Scan phone-simulator built and verified** (full design in
  [`plans/laundry-scan-phone-simulator.md`](plans/laundry-scan-phone-simulator.md),
  user-approved before any code): a quiet "No phone? Simulate a phone
  scan" link beside the 3D room's QR examine overlay opens a CSS
  phone-frame mockup containing a same-origin `<iframe src="/">` — the
  exact real home page an identified visitor's real scan already
  redirects to, not a second rendering of it, so claim/join actions taken
  inside it are real writes against the real database. Verified
  end-to-end with a real Playwright run (not just reading the diff): a
  reservation submitted inside the iframe shows up for a *different*
  identity's own `GET /machines/:id/card` fetch as "Next: room305" —
  confirming it's a genuine server-side write, not a client-side-only
  effect. Deliberately **not** a substitute for the still-outstanding
  Stage 4 real two-device phone-camera rehearsal (feature #19) — it
  proves nothing about whether a real phone camera can decode the QR
  image itself; the code comment next to the button and this plan file
  both say so explicitly. Folded in at the same time: the top nav's
  `<a href="/">Machines</a>` (and `homePage()`'s own page `<title>`)
  renamed to **"Home"**, matching the term `plan.md` and every crit plan
  already use for this exact page everywhere else — "Machines" was the
  only place in the repo still using a different word for it. No ADR
  needed (routine UI, no authorization/fairness weight, per the plan
  file's own reasoning against ADRs 0012-0014). `pnpm check` green (15
  files, 42 tests) against a scratch server; `src/queue.ts` untouched.
- **A real "character's limbs don't animate until a refresh" bug,
  root-caused and fixed, not just re-tuned.** Reported as "walk into
  `/laundry` and often the arms/legs just don't move, reloading fixes
  it." Investigated with real evidence, not a guess: a real
  `characterModel.traverse()` bone-rotation sample across 8 frames
  confirmed the arm/leg bones genuinely rotate on an ordinary first
  navigation (ruling out a rendering/frustum regression), and a
  Playwright `page.route()` test that deliberately aborted the first two
  `character.glb` requests and let the third through reproduced the real
  failure shape instead: the local character's animation data used to
  come from a **second, fully independent** network request
  (`loadGltfWithRetry("/models/character.glb", ...)` a few lines below
  the model's own `loadModel()` load), issued purely because that
  callback's own cloned model carries no `animations` array — each
  request had its own separate 3-attempt retry budget, so the character
  could render and move correctly (position/camera all fine, matching
  the pre-existing "retry a failed load" fix's own framing) while its
  *second* request's retries all failed independently, leaving
  `walkClip`/`idleClip`/`characterMixer` `null` for the rest of that page
  load with nothing printed to explain why — exactly the kind of blip
  `fly.toml`'s cold-start `auto_stop_machines` setup makes more likely
  right after a cold start, and exactly why a refresh (a fresh set of 3
  attempts) usually "fixed" it. Fixed by deleting the second request
  entirely: `loadModel()` already caches the full `gltf` (animations
  included) in `modelCache` before invoking its callback, so the
  animation setup now reads `modelCache["/models/character.glb"].animations`
  directly — one request, one retry budget, no separate failure window.
  Verified by the same abort-twice-then-succeed Playwright test: the walk
  animation now recovers correctly even after 2 of the 3 attempts fail.
  `pnpm check` green (15 files, 42 tests) against a scratch server;
  `src/queue.ts` untouched.
- **A real two-device scan still landed on a blank room-number form, even
  though the desktop session in `/laundry` already knew the room number
  — fixed with a prefill, not a skip.** Reported after deploying: scanning
  a machine's real QR code with a phone redirected straight to the
  identity form (correct per `docs/adr/0012` — a different device has no
  cookie), but the phone's own visitor then had to retype a room number
  they'd already typed once on the desktop session that showed them the
  code. `docs/adr/0012` gained an addendum rather than being reopened: the
  room number already rides along visibly in the 3D room (the character's
  own floating label, the home page board), so carrying it into the QR
  payload exposes nothing new — only *skipping* the phone's own
  confirmation step would have reopened the trust boundary, so that's
  exactly what wasn't built. `GET /machines/:id/qrcode.png` now reads its
  own request's identity cookie and encodes `?room=<identity>` in the scan
  URL when one exists (confirmed via a real jsQR decode of the rendered
  PNG, not inferred from file size: `.../laundry/scan/1?room=room777` with
  identity, a bare `.../laundry/scan/1` without); `GET /laundry/scan/:id`
  runs that query value through the same `normalizeRoom()` every other
  identity input goes through before ever using it, so a malformed or
  hostile value just fails to prefill rather than being trusted — and
  **prefill only**: the route still returns the real form (`200`), not an
  auto-redirect, so the phone's visitor still presses "Continue"
  themselves before any cookie is set. URL assembly split into a new,
  directly-testable pure function (`src/qr.ts`'s `scanUrlFor`) rather than
  tested only by decoding a rendered image — this project has no QR-decode
  dependency, and adding one just to test a URL string would be
  disproportionate. `spec/laundry-scan.test.ts` grew by 4 cases (the pure
  function, a valid prefill, a rejected hostile value, the unchanged blank
  case). `pnpm check` green (15 files, 46 tests) against a scratch server;
  `src/queue.ts` untouched.

## Final project deadline — read this before planning further work

**Due 2026-11-09 (Monday) 12:00 noon AEDT (Canberra time)** — see
<https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/>.
Confirm this is still accurate by re-checking that page if picking this
up well after the date above, since this was fetched live on
2026-11-06/07 and isn't hand-maintained like the rest of this file.

**Known constraint, worth checking before assuming it's resolved**: this
week's course Claude Code proxy budget hit its hard $200/week cap
mid-session on 2026-11-06, rejecting API calls outright. The user asked
the course convenor for a one-off bump via a private Ed thread (the
course's own documented process for this) — status of that request is
unknown as of this note. The weekly budget resets automatically
Thursdays 09:00 Canberra time regardless. If a session hits the same
"422 Budget has been exceeded" error, this is why — check whether the
bump landed, or wait for the Thursday reset, rather than assuming
something is broken.

This priority list is a snapshot from when the deadline was first fetched
(2026-11-06/07) and has gone stale since: item (3) below, Stage 9.2's
floor-plan redo, was only "if time remains" when this was written and is
now done (see this file's own "Stage 9.2 implemented and verified
locally" entry above) — left here struck through so a reader doesn't
wonder why it vanished, rather than silently deleting a decision record.
Item (1), the drop-off flow rework, is likewise now done — see this
file's own "The drop-off flow rework ... built and verified" entry above
— left struck through below for the same reason.

Given the close deadline, the highest-value remaining work, roughly in
priority order, is now: (1) Stage 4's real two-device phone-scan
rehearsal, since the deployment now exists to make it possible and it's
the one thing in `plan.md`'s feature #19 never actually verified
end-to-end — the user's own, needs a physical phone; (2)
`PROCESS.md`/`reflections/` updates covering the 3D walkthrough work and
the drop-off flow rework — also the user's own, per `CLAUDE.md`, not the
agent's job.

~~(1) the drop-off flow rework — full design already written and
user-approved in
[`plans/laundry-dropoff-flow.md`](plans/laundry-dropoff-flow.md)~~ —
**done**, see above.

~~(3) Stage 9.2's floor-plan redo, only if time remains after the
above~~ — **done**, see above.

## The feature list

Every idea discussed so far, with where it currently stands. "Core" means
it's load-bearing for the app to work at all; "crit N" means it's scheduled
there; "gap" means nobody's claimed it yet.

1. **Fairness rule** — core. Crit 8: miss your 3-minute claim window, lose
   your spot, full stop. **Done, crit 9**: move back one place instead,
   swapped with whoever's next, both sides told why — crit 8's blunt rule
   is the documented rejected alternative. See
   [`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md).
2. **The "it's your turn" notification** — crit 8 ships on-page live update
   only. A push notification (so you don't need the tab open) is a nice-to-
   have, not required by the real-time spec, and isn't scheduled anywhere
   yet.
3. **Identity, with no accounts** — open decision, blocking Stage 1.
4. **Scope discipline** — standing constraint, not a deliverable: stays one
   laundry room, resists becoming a generic multi-building booking product.
5. **Washer-then-dryer sequencing** — tentatively crit 9, "if time allows."
   Needs a second machine type (dryers) to exist first. Not guaranteed.
6. **Finished but not collected** (remove clothes, basket/shelf, notify
   owner) — **gap**, no crit assigned.
7. **Peak times from logs** ("when to go") — crit 10, but as a bonus on top
   of the required logging, not the deliverable itself. First thing to cut
   if crit 10 runs short on time.
8. **Wrong taps / stale state** — the crit 8 fairness rule's "lose your
   spot" already self-corrects a missed/wrong tap. The richer version
   ("people on site can correct someone else's claim") is **gap**, no crit
   assigned — also a candidate for crit 9's one documented decision, as an
   alternative to #12.
9. **Coming back** (what a returning user sees) — crit 8 covers the minimal
   version (your trace/position is still there). A richer, justified
   version is a candidate for crit 9's one documented decision.
10. **Three machine types** (washer, dryer, shoe washer) — crit 8 ships one
    type only. Dryers join in crit 9 (needed for #5). Shoe washers are
    **gap**, no crit assigned.
11. **Auto-assign** (app picks whichever machine of a type would start
    earliest, instead of you choosing) — **gap**. Currently crit 8's plan
    has people manually picking a machine.
12. **Cross-machine "earlier machine" offer** (if another machine of your
    type frees up early and nobody's queued for it, the longest-waiting
    eligible person gets first refusal) — **done, crit 9**, alongside #1,
    as the same documented decision. See
    [`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md).
13. **Estimated vs. fixed time** — core, crit 8. Estimate = scheduled slot
    assuming no delay; becomes fixed once the person ahead actually starts.
14. **Claim vs. start as separate actions** — core, crit 8. Scanning claims
    a machine ("it's mine"); starting is a separate tap that just records
    the real start time (duration was already chosen at reservation time).
15. **Cancelling moves the line up by one** — core, crit 8, simple to add.
16. **Changing washing/drying type after reserving** — **gap**, no crit
    assigned. Came up because the default dropdown option is the 1-minute
    test type, and it's easy to reserve without noticing or changing it;
    a real user might also just change their mind. Needs a decision on
    when it's still allowed: trivial while `waiting`/`claimed` (nothing's
    committed to other people's estimates yet), but once `running` the
    duration is already baked into everyone else's queued `endMs` and
    `settleMachine`'s own finish check — letting it change after that
    point would let someone manipulate how long they effectively hold the
    machine. Current read: allow the change up to `claimed`, lock it at
    `running`, matching how a real machine can't be reconfigured mid-cycle.
17. **Water temperature choice (cold/warm/hot)** — **gap**, no crit
    assigned. Orthogonal to washing type/duration — a separate field, not
    a new `WASHING_TYPES` entry — and doesn't touch queue position or
    timing, so it's a lower-risk addition than #16.
18. **Unclaimed laundry handed off to a numbered pickup spot** — **Built,
    3D walkthrough Stage 8.4; reworked into a real two-step pick-up/place
    flow per [`plans/laundry-dropoff-flow.md`](plans/laundry-dropoff-flow.md).**
    Stage 8.4's original version: if the next person needs the machine
    before the previous owner has collected their clothes, they move the
    clothes to a numbered shelf spot (server-assigned from a fixed list,
    never freely typed) and the original owner is notified which spot via
    the existing `notice` mechanism. A new, deliberate exception to
    `loadOwned` (whoever holds the machine's front waiting reservation may
    trigger it; only the real owner may acknowledge collection) is
    documented in `docs/adr/0013-laundry-handoff-authorization.md`;
    `pickupSpot`/`pickedUpAt` columns track the new state, and
    `spec/laundry-handoff.test.ts` covers the full cycle including every
    fixed spot filling and freeing again. **Found, investigating the
    build with real 3D-room use (2026-11-08): the carry-to-shelf sequence
    in the 3D scene was cosmetic** — the old `handoffLaundry()` was one
    atomic server write (spot assigned, owner notified, all at pickup
    time), so nothing server-side distinguished "picked up" from
    "placed," and the carried-basket's own visibility raced against the
    server's own already-updated state, which was the real cause of a
    reported flickering-basket bug (two sources of truth for the same
    fact, not timing jitter). **Reworked and shipped**: `pickUpLaundry()`/
    `placeLaundry()` replace the one-shot action, a new `IN_TRANSIT`
    sentinel on `pickupSpot` plus a new `carriedBy` column give "being
    carried" a real server state, and `GET /laundry/machines-state` now
    reports `carryingFromMachine`/`basketKind` as server truth instead of
    a client-only variable — see this file's own Current state entry for
    the full build record. `docs/adr/0013`'s authorization boundary is
    unchanged, with an addendum recording the split.
19. **3D walkthrough, scan a real machine's code** — prompted by course
    feedback that the bot-driven simulation didn't convincingly pitch this
    as something a real residence would adopt. **Stages 1-3 and Stage 6's
    non-phone parts done** (see `plans/3d-walkthrough.md`,
    `docs/adr/0012-3d-walkthrough.md`, and this file's own Current state
    entry above) — a first-person 3D room at `/laundry`, live machine
    state, real per-machine QR codes, and the scan-to-claim/scan-to-
    reserve landing page. **Still needed:** Stage 4, a real two-device
    scan rehearsal (needs a physical phone and a real deployment, neither
    available to an unattended run) — my own, not scheduled for the agent.

## Gap tasks — no crit assigned yet

- Finished-but-not-collected handling (#6)
- Shoe washers as a third machine type (#10)
- Auto-assign (#11)
- Push notifications for "it's your turn" (#2), if wanted beyond the spec
  minimum
- Changing washing/drying type after reserving (#16)
- Water temperature choice (#17)
- Unclaimed laundry handed off to a numbered pickup spot (#18)

(#12, cross-machine "earlier machine" offers, shipped in crit 9 — see the
feature list above.)

**A possible second-phase direction, not a scoped task:** the crit 10
extension's fairness simulation (`/simulation`, `docs/adr/0011-reading-the-simulation-numbers.md`)
surfaced that `moveBackOnePlace` has no cap on how many consecutive times
one reservation can be swapped backward — worth asking in a future
iteration whether a long run of bad luck should eventually route into
the existing cross-machine offer (#12) instead of an indefinite in-place
swap. Not committed to; just worth not forgetting.

## Mapping onto crits (summary — full detail in each crit's own plan file)

- **Crit 8** (`plans/crit-8.md`): one machine type, manual reservation
  (pick or scan), simple fairness, estimated/fixed time, persistence. The
  smallest version that's genuinely alive.
- **Crit 9** ("all at once"): **done, fully shipped** — real-time sync
  over SSE (<1s, no reload, including passive expiries via a server
  tick); one documented multi-user decision, #1's fairness escalation
  plus #12's cross-machine offer together
  (`docs/adr/0005-fairness-escalation.md`); the visual design pass; and
  dryers (#5), the stretch, also done.
- **Crit 10** ("fly by instruments") — planned (`plans/crit-10.md`), not
  yet built: server-side logging of every state-changing action (who did
  what, including denied attempts and the queue's own tick-driven
  decisions), documented in a new ADR against the already-shipped
  identity/authorization model; #7 (peak times from logs) as a bonus if
  time allows.

## Decisions locked in for crit 8 Stage 1

1. **Identity** — self-declared name or room number, remembered per
   browser, no account. See
   [`docs/adr/0002-identity.md`](docs/adr/0002-identity.md).
2. **Tech stack** — Hono, TypeScript/Node 24, Drizzle + `better-sqlite3`
   with migrations applied at boot, htmx (+ SSE for crit 9) for the pages.
   See [`docs/adr/0003-tech-stack.md`](docs/adr/0003-tech-stack.md).

Nothing left blocking Stage 1.

## The "good" harness — status

Per the brief: `README.md` is the argument, `CLAUDE.md` (and what it
references) is the enforceable rules, `spec/` is the automated checks —
and the strongest version says plainly which claims are enforced vs.
judged.

- `README.md`: updated with the real mechanism (enforced/judged split,
  what we chose not to build).
- `CLAUDE.md`: app-specific rules added, now that identity is decided.
- `spec/`: `queue-fairness.test.ts` and `queue-order.test.ts` now check the
  two enforced invariants, against the wire contract in `plans/crit-8.md`.
  They'll fail until Stage 1 exists to satisfy them — expected for now.

## Process notes

- Forks/overrides get logged in `process-notes.md` per `CLAUDE.md`,
  pointing at the relevant ADR instead of re-telling the story.
- ADRs live in `docs/adr/`, one file per decision, numbered.
