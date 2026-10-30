# 3D walkthrough, Stages 1-3 + non-phone parts of Stage 6 — one unattended run (about 4 hours)

Written for one unattended agent run, about four hours, on branch
`3d-walkthrough`. Nobody will read your questions or answer them: this
file, `CLAUDE.md` (its "Unattended runs" section governs this run),
`plans/3d-walkthrough.md`, and `docs/adr/0012-3d-walkthrough.md` are the
whole brief. Where this file and the plan differ, this file wins — it's
the more carefully scoped-for-unattended-execution version of the same
design.

## 0. Ground rules

- **Nobody is there.** Never ask a question, never stop to wait for a
  reply. Where you would ask, make the smallest reasonable call, record
  it and why in the commit message and `HANDOFF.md`, and keep going.
- **Scope is Stages 1-3 of `plans/3d-walkthrough.md`, plus the parts of
  Stage 6 that don't need a real phone or a real deployment.** Concretely
  in scope from Stage 6: the visual polish pass on the room/machines
  (lighting, materials — `research/3d-booking/ideas.md` has candidates),
  and a claim-success feedback cue inside the 3D scene (visual, e.g. a
  brief flash/animation on the claimed machine — audio is optional and
  lower priority, skip it if time is short). **Explicitly out of scope,
  no matter how much time is left:** Stage 4 (a real phone scanning a
  real deployed QR code — this needs a physical phone and a real
  deployment, neither of which exist in this environment, and no amount
  of remaining time changes that) and Stage 6's "recorded clip of the
  real phone-scan flow" item (same reason — it's a recording *of* Stage
  4, which hasn't happened). Do not attempt either. If Stages 1-3 and the
  in-scope parts of Stage 6 are done with time to spare, use the
  remainder to harden/polish what's already built (more thorough specs,
  more careful visual review per Stage 3.3/4.2's screenshot-verification
  pattern) rather than reaching into Stage 4. Stage 5 (the ADR, already
  written — see "Already decided" below) and documentation touch-ups that
  naturally belong with the in-scope stages are also in scope.
- **Already decided — do not reopen:**
  - Identity stays a bare, unverified `roomXXX` cookie (ADR 0002/0004).
    No accounts, no login form, no device pairing.
  - The QR code carries no token, no expiry, nothing — a plain
    `/laundry/scan/:id` link, exactly as trusted (or not) as a sticker on
    a real machine. See `docs/adr/0012-3d-walkthrough.md`. Do not add
    signing, expiry, or any other protection to it.
  - The "go to the laundry" entry point on the home page is
    unconditional — visible whether or not the viewer holds a
    reservation.
  - `src/queue.ts` is not touched. Every action this run wires up
    (join, claim) calls the existing exported functions exactly as
    `src/app.ts` already does. If you find yourself wanting to add a
    parameter to or change the behaviour of `join`, `claim`, or
    `loadOwned`, stop — that means the design has drifted from the plan,
    not that the plan was wrong. Record the friction in `HANDOFF.md`
    instead of changing `queue.ts`.
  - Tech stack for the 3D layer: three.js, loaded via a pinned CDN
    `<script type="module">` tag, no bundler, no build step. QR
    generation: the `qrcode` npm package, server-side. Both are
    plain dependencies (`qrcode` goes in `package.json`; three.js does
    not, since it's loaded from a CDN, not installed).
  - Desktop-first controls (WASD + mouse-look), touch controls (on-screen
    joystick + drag-to-look) built alongside from the start, not as a
    later pass.
- **Do not edit** `README.md`, `PROCESS.md`, `process-notes.md`,
  `reflections/`, or `docs/adr/` (except `docs/adr/0012-3d-walkthrough.md`
  itself, already written, and only if you find a factual error in it —
  not to redecide anything in it). Suggestions for `README.md`/`PROCESS.md`
  go in `HANDOFF.md`. `plan.md`'s "Current state" section may be appended
  to (never rewritten) once this run's stages are done, per `CLAUDE.md`'s
  normal workflow rules — this isn't one of the restricted files.
- **Ports:** never 8080 (the user's own `pnpm dev`). Your own verification
  servers use 8090 or above, are killed the moment a check finishes, and
  you confirm the port is actually free (`ss -tlnp`) immediately after —
  not "later," not "after this batch." A stray listening process is what
  the next check, or the user's own `pnpm dev`, silently collides with.
- Never write test data into the deployed app or `.data/app.db`. Use a
  scratch `DATABASE_PATH` for every server you start.
- `pnpm check` is green before every commit.
- If the same check fails twice after an honest fix attempt, step back
  and reconsider the approach rather than trying a third near-identical
  fix; if still stuck, write what you tried in `HANDOFF.md` and move to
  the next stage.
- Commit after each finished step (not just each stage) with a message
  saying what changed and why, per `CLAUDE.md`'s unattended-run rules.

## 1. The environment has a known, already-fixed quirk — read this before touching Playwright

This WSL2 sandbox's Playwright-bundled Chromium is missing system shared
libraries (`libnspr4.so`, `libnss3.so`, `libasound.so.2`) and there is no
`sudo` available to install them the normal way (`apt-get install`
requires root; this environment doesn't have it).

**This has already been fixed for you, outside the repo**: the missing
`.deb` packages were fetched with `apt-get download` (which doesn't need
root) and extracted into `/home/syh/.local/playwright-libs/`, and
`~/.bashrc` now exports `LD_LIBRARY_PATH` to include that path. Confirmed
working before this run started: `chromium.launch()` succeeds, and a
WebGL context created on a `<canvas>` reports a real renderer
(`ANGLE ... SwiftShader driver` — software-rendered, no GPU, but a
genuinely correct WebGL context, not a stub).

**What this means for you:**

- Playwright launches and screenshots will work normally in this run —
  you are not limited to checking HTTP status codes and response bodies
  for the 3D scene. Use real screenshots to verify the scene actually
  renders, machines appear in the right places, and (as best a static
  screenshot can show) controls respond.
- Because rendering is software (SwiftShader), don't expect GPU-grade
  frame rates or judge "smoothness" from a screenshot — judge whether
  the scene is structurally correct (room visible, machines present and
  positioned, colours/labels matching real queue state).
- If you open a **new** shell and `echo $LD_LIBRARY_PATH` comes back
  empty, the fix didn't carry over for some reason — don't spend more
  than a few minutes debugging this specific symptom; fall back to
  non-visual verification (HTTP status/body assertions, reading rendered
  HTML/JS source for correctness) for whatever step you're on, note it
  plainly in `HANDOFF.md`, and move on. Don't attempt to `apt-get
  install` anything yourself (no root), and don't modify `~/.bashrc`
  again (already correctly set).

## 2. Read first

- `CLAUDE.md` — the "Unattended runs" section, the test-harness rules,
  the app rules.
- `plan.md` — Background, User story, Current state (the User story's
  "walk up and scan a machine's code on site" line is what Stage 3
  finally ships).
- `plans/3d-walkthrough.md` — the full plan this run builds Stages 1-3 and
  the non-phone parts of Stage 6 from. Read "What this stage is, as a
  flow" and "What this stage deliberately does not do" carefully; this
  prompt restates the
  in-scope parts but the plan has more framing.
- `docs/adr/0012-3d-walkthrough.md` — the one real decision already made
  (QR codes carry no protection). Short; read it in full.
- `research/3d-booking/tech-stack.md` — confirms three.js and `qrcode`
  both work via CDN/plain npm dependency with no build-step change.
- `research/3d-booking/asset-generation.md` — the course's image
  generation API, if you want a generated texture for anything (see
  Stage 1's "visual style" note below) — **read the budget section
  before calling it even once.**
- `src/app.ts` — every existing route, especially `actionRoute` (how
  claim/cancel/etc. are wired), the `/identity` POST handler, and the
  home page's `GET /` handler (what "no cookie" does today).
- `src/queue.ts` — `join`, `claim`, `loadOwned`, `queueFor`. You will
  call these, not modify them.
- `src/realtime.ts` — the SSE tick and its event names (`machine-${id}`,
  `changed`). The 3D scene is a second consumer of this, not a new
  broadcast source.
- `src/views.ts` — `identityPage()`, `homePage()`, the existing `page()`
  wrapper function (whatever provides the shared HTML shell/head) — the
  new `/laundry` page should use the same wrapper, not a bespoke HTML
  document, so it inherits the same base styles/meta tags.
- `spec/README.md`, `spec/global-setup.ts`, `spec/support/*.ts` — the
  existing pattern for specs that drive the real app over HTTP with a
  cookie jar. Follow this shape for any new spec.
- `package.json` — confirm `qrcode` isn't already a dependency (it
  isn't, as of this writing) before adding it.

Before changing anything: start the app on a spare port (8090+) with a
scratch `DATABASE_PATH`, run `APP_URL=http://localhost:<port> pnpm check`,
confirm green, stop the server, confirm the port free. This is your
baseline — if something you build later seems to break an existing spec,
you'll know it's your change, not a pre-existing failure.

## 3. Stage 1 — `/laundry` scene skeleton, no live data yet

Goal: a walkable, empty 3D room, reachable from the home page, with
correct controls on both desktop and touch. No per-machine state
binding yet (that's Stage 2) — get the rendering and controls loop
right in isolation first.

### 3.1 Route and page

- New route `GET /laundry` in `src/app.ts`. Same auth guard as `GET /`:
  if there's no `person` cookie, show the identity page (reuse the exact
  same check/response `GET /` already does — don't write a second,
  slightly-different version of "no cookie → identity page").
- New view function in `src/views.ts` (or a new `src/laundry-view.ts` if
  splitting out makes the file easier to read once written — your call,
  consistent with how `src/board-state.ts` was split out from
  `src/views.ts` for a similar reason). Uses the same page wrapper as
  every other view, so it has the same `<head>`/base styles.
- A link/button from the home page to `/laundry` — "Go to the laundry" or
  similar, visible unconditionally (not gated on having a reservation —
  already decided, see "Ground rules" above). Add it to `homePage()`'s
  output wherever it reads naturally (near the top, since it's a
  navigation action, not a reservation action).

### 3.2 Three.js scene

- Load three.js from a pinned CDN URL (jsDelivr or cdnjs, a specific
  version — check what's current and pin it exactly; do not use an
  unpinned/latest URL). `research/3d-booking/tech-stack.md` has the
  background on why three.js and why CDN-only.
- Fixed room geometry: a floor plane, four walls (or however many read
  as "a room" — this doesn't need to be photorealistic, see the visual
  style note below), and **10 machine placeholders** in a fixed layout
  (e.g. two rows of 5, with a walkable aisle — your call on exact
  arrangement, but leave enough space between machines and from the
  walls that the camera doesn't clip through geometry while walking).
  Simple box/cylinder geometry is enough for Stage 1 — this stage is
  about the room and controls working, not appearance.
- **Visual style, decided now so it isn't a mid-build distraction:**
  default to simple built three.js geometry (boxes, cylinders) with flat
  or lightly-shaded materials — no textures required for Stage 1 to be
  "done." If a specific surface looks too plain even after basic
  materials/lighting and you want to try a generated texture (e.g. a
  floor texture, a machine-front texture), `research/3d-booking/
  asset-generation.md` has the course's image-generation API and its
  very explicit budget warnings (flat $30/300-image total for the
  **entire course**, shared, never resets, URLs expire immediately,
  needs the ANU network/VPN). If you use it: generate at most one or two
  candidate images total this run, review them before committing (same
  "look before shipping" discipline as `research/design-review.md`),
  download immediately, and note in `HANDOFF.md` exactly how many calls
  you made and what for. Do not build a generation loop or batch-generate
  variations — this is a nice-to-have texture source, not a core
  requirement, and the budget is small and shared with every other
  student in the course.
- Desktop controls: WASD for movement, mouse-look (pointer lock via
  three.js's `PointerLockControls` or an equivalent small hand-rolled
  implementation — your call on which is more maintainable here).
- Touch controls: an on-screen virtual joystick (left side) for movement,
  drag-to-look (right side / anywhere not on the joystick) for camera —
  hand-rolled is fine, this doesn't need a dependency for ~2 touch
  zones.
- Responsive: the canvas should fill the viewport and both control
  schemes should be present/usable based on a basic touch-capability
  check (`'ontouchstart' in window` or similar), not a hard device
  detection that could get it wrong.

### 3.3 Verify (Stage 1)

- Start the app on a scratch port. Using Playwright:
  - Load `/laundry` at a desktop viewport (1280×800). Screenshot it.
    **Look at the screenshot** (read the image back, don't just check
    the file exists) — confirm a room with 10 machine placeholders is
    visible, not a blank page or a visible error.
  - Simulate a few WASD key presses / mouse movement, screenshot again,
    confirm the camera position/orientation visibly changed between the
    two screenshots (the room looks different from a different vantage
    point) — this is the one concrete way to confirm movement actually
    works, not just that keys are being listened for.
  - Load `/laundry` at a mobile viewport (390×844) with touch emulation
    enabled, screenshot it, confirm the touch joystick/look-zone UI is
    visible and doesn't overlap illegibly with anything.
  - Confirm `/laundry` with no `person` cookie shows the identity page,
    not the 3D scene.
- Save these as `research/screens/laundry-stage1-*.png` (follow the
  existing naming convention in that directory — descriptive suffixes,
  not sequence numbers).
- Kill the server, confirm the port free.
- Commit: code + screenshots + a message describing what was verified
  and how.

## 4. Stage 2 — live machine state in the scene

Goal: each machine placeholder's appearance reflects its real queue
state, and updates within the same ~1s window the home page's own
real-time guarantee already promises (crit 9), using the existing SSE
stream — no new server-side broadcast logic.

### 4.1 Data

- On `/laundry` page load, fetch current state for all machines — reuse
  the existing `GET /machines/:id/state` route (already returns JSON:
  `reservationId, person, status, position` per reservation) or add a
  small new one if you need machine-level summary (e.g. "is this machine
  idle, who's at the front, what status") that doesn't already exist in
  a convenient shape. Check `src/board-state.ts` first — if it already
  computes a clean "what should this machine look like" summary for the
  2D board, reuse that logic (import the function) rather than
  re-deriving the same mapping from `QueueRow` a second time, same
  principle as the plan's existing note about not duplicating logic.
- Subscribe to the existing `/events` SSE stream directly with the
  browser's native `EventSource` API. **Note:** the home page's existing
  real-time updates go through htmx's SSE extension (`hx-ext="sse"
  sse-connect="/events"` — see `src/views.ts`'s `page()` function and its
  comment above it), which re-fetches HTML fragments by element
  attribute, not plain JS. The 3D scene isn't an htmx page section, so it
  can't reuse that wiring directly — connect a second, independent
  `EventSource("/events")` from the 3D scene's own `<script>` and listen
  for the same named events (`machine-${id}`, `changed`) the server
  already emits (per `src/realtime.ts`). This is an additional listener
  on the same existing stream, not a new server-side broadcast — the
  server doesn't know or care how many listeners are attached to one SSE
  connection's worth of events.
- Appearance mapping (simple, not elaborate): distinct colour/material
  per state — e.g. idle/free = one colour, running = another, claimed =
  another, unclaimed-but-done = another. Reuse whatever colour meaning
  already exists on the 2D board (`src/board-state.ts` or wherever state
  → colour/word mapping lives today) rather than inventing a second,
  inconsistent colour language for the same states.

### 4.2 Verify (Stage 2)

- With the app running on a scratch port: open `/laundry` in one
  Playwright browser context, screenshot it (baseline — likely all
  machines idle on a fresh database).
- In a second Playwright context (or via direct `fetch` calls with a
  cookie, matching `spec/support/*.ts`'s existing pattern), join a
  reservation on one machine, claim it, start it.
- Within a few seconds (poll, don't sleep a fixed guess — same pattern
  `spec/support/offer-client.ts`'s `waitForOffer` already uses), confirm
  via a fresh screenshot or a DOM/JS-state read that the corresponding
  machine's appearance in the 3D scene changed to reflect "running."
- Confirm a machine with no activity still correctly shows "idle" (no
  false positives).
- Kill servers, confirm ports free. Commit with a description of what
  was exercised and what changed.

## 5. Stage 3 — real QR codes and the scan landing page

Goal: each machine's 3D model carries a real, server-generated QR code;
scanning it (verified here by directly visiting the encoded URL, not a
real phone — Stage 4's job) leads to a page that correctly does one of
three things depending on real queue state, using only existing
`queue.ts` functions.

### 5.1 QR generation

- Add `qrcode` to `package.json` dependencies (`pnpm add qrcode` — plus
  its types if not bundled, check `@types/qrcode` availability; add to
  devDependencies if it's a separate types package).
- New route `GET /machines/:id/qrcode.png`: validates the id refers to a
  real machine (404 if not — matches the existing pattern in other
  machine-id routes like `GET /machines/:id/card`), then generates a PNG
  via the `qrcode` package encoding a URL of the shape
  `<origin>/laundry/scan/:id`. Work out the right origin at request time
  (don't hardcode the deployed hostname — this needs to work against
  `localhost:<port>` during this run's own verification too; Hono's
  request object has what you need to build an absolute URL from the
  incoming request).
- Texture this onto each machine's 3D model (a plane or a face of the
  machine's geometry) in the `/laundry` scene — visible at a size large
  enough to plausibly be scanned at an in-scene viewing distance (exact
  pixel/world-unit sizing is a judgment call; err generous, since Stage
  4's real-phone test will be the real check on this and isn't this
  run's job).

### 5.2 The scan landing page

- New route `GET /laundry/scan/:id`. Three branches, built entirely from
  existing `queue.ts` reads/actions — **do not add any new `queue.ts`
  function for this**:
  1. **No `person` cookie** → show the identity flow. This needs
     `POST /identity` to support returning to this scan URL afterward
     instead of always `/`. Add an optional `redirect` field (hidden
     form input) to the existing identity form when it's rendered for
     this flow, and handle it in the `POST /identity` handler: if
     present, validate it's a same-origin path starting exactly with
     `/laundry/scan/` (reject/ignore anything else — this is the one
     place a careless implementation could create an open-redirect bug;
     do not skip this check), and redirect there instead of `/` on
     success. Every existing caller of `POST /identity` that doesn't
     send this field is unaffected (falls back to the current `/`
     behaviour unchanged).
  2. **This room holds the front, `waiting` reservation on this
     machine** → a confirm screen ("Claim machine N?") with a form
     posting to the existing `POST /reservations/:id/claim` route
     (no new route needed — this is literally the same claim action the
     home page's "Claim (scan)" button already posts to, per
     `src/views.ts`'s existing `machineCard` rendering). You'll need to
     look up which reservation (if any) belongs to this room on this
     machine — use `queue.queueFor(machineId)` and find the row where
     `person === identity`, the same lookup `GET /` already does for its
     "your status" block.
  3. **No active reservation for this room on this machine, and the
     machine has no active reservations at all (fully idle)** → show the
     existing reservation form (washing/drying type dropdown, matching
     what the home page's board already renders for an idle machine),
     posting to the existing `POST /machines/:id/reservations` route.
  4. **Anything else** (room has a reservation elsewhere in this
     machine's queue but isn't at the front; machine is occupied by a
     different room) → a read-only view of the machine's current queue
     state — reuse `machineCard`/the board's existing per-machine
     rendering if it's reasonably reusable standalone, or a minimal
     equivalent, rather than inventing a third way to render queue
     state.
- This page should look like it belongs to the app (reuse the page
  wrapper, basic styling) but doesn't need the 3D scene — it's a normal
  server-rendered page, same as `identityPage()`.

### 5.3 Verify (Stage 3)

Using direct HTTP requests with managed cookies (the `spec/support/*.ts`
pattern — fetch with a `cookie` header, `redirect: "manual"`, checking
status codes and response bodies), on a scratch port:

- `GET /machines/1/qrcode.png` returns a `200` with `content-type:
  image/png` (or `image/svg+xml` if you chose SVG output — either is
  fine, just be consistent and say which in the commit message) and a
  non-trivial body size (confirms it's a real image, not an empty/error
  response).
- With no cookie set: `GET /laundry/scan/1` shows the identity form,
  and it includes the redirect field pointing back at
  `/laundry/scan/1`.
- Submit that identity form with a `redirect` of `/laundry/scan/1`:
  confirm the response redirects to `/laundry/scan/1`, not `/`.
- Submit the identity form with a `redirect` value that is **not** a
  `/laundry/scan/` path (e.g. `https://evil.example/`, or
  `//evil.example`) and confirm it's ignored — falls back to `/`, not an
  open redirect. This is a real check, not a formality — write it as an
  actual assertion.
- With a cookie for a room that just joined machine 2 and is at the
  front of its queue: `GET /laundry/scan/2` shows the claim confirm
  screen; posting the claim form succeeds (`queue.ts`'s `claim()`
  actually transitions the reservation, confirmed by re-fetching
  `/my-status` or the machine's state afterward).
- With a cookie for a room with no reservation, against a machine with
  zero active reservations: `GET /laundry/scan/:id` shows the
  reservation form; submitting it successfully creates a reservation
  (confirmed the same way).
- With a cookie for a room that has no reservation on a machine that
  someone *else* currently holds: `GET /laundry/scan/:id` shows the
  read-only view, with no form that would let this room claim or join
  ahead of the actual owner.
- Consider writing these as a real `spec/laundry-scan.test.ts` file
  (following `spec/offer.test.ts` or `spec/room-limit.test.ts`'s
  structure/style) rather than one-off manual checks, so they run every
  time `pnpm check` runs from now on — this is the stronger, more
  reusable form of "verify," and `CLAUDE.md`'s own rule ("when a test
  finds a real bug, the fix lands with a test that would have caught
  it") points the same direction. Use a room number no other spec file
  uses, matching the existing convention.
- Separately, with Playwright: load `/laundry`, confirm each machine's
  rendered QR texture is present (even a basic check like "the texture
  loaded without a broken-image/console error" is useful signal, given
  a human can't inspect pixel-level QR correctness without a real
  scanner). Screenshot it.
- Kill every server you started, confirm ports free, every time —
  including if a check fails and you're about to retry.

## 6. Stage 6 (non-phone parts) — visual polish and claim feedback

Only attempt this once Stages 1-3 are solid, verified, and committed —
this stage exists to spend remaining time well, not to rush past
Stages 1-3's verification to get here.

### 6.1 Visual pass

- Improve the room/machine materials and lighting from Stage 1's
  placeholder geometry — e.g. basic ambient + directional lighting if
  Stage 1 didn't already have it, more considered colours/proportions,
  simple surface detail (a drum-front suggestion on a washer, panel
  lines) via geometry or material tweaks. `research/3d-booking/ideas.md`
  has candidate directions; use judgement on how far to take this within
  the time available rather than chasing photorealism.
- The same generated-texture option and budget discipline from Stage
  1.2's "visual style" note applies here too if you reach for it again —
  re-read that note's constraints (at most one or two candidate images
  **total across this entire run**, not per stage; review before
  committing; download immediately; log every call in `HANDOFF.md`).
  Don't treat Stage 6 as a reason to spend more of the shared course
  image budget than Stage 1 already budgeted for.
- Re-screenshot `/laundry` at both the desktop and mobile viewports used
  in Stage 1's verification, save alongside the Stage 1 screenshots
  (e.g. `research/screens/laundry-stage6-*.png`), and actually look at
  the before/after side by side before deciding the pass is done — the
  same "look at it, don't just trust the diff" discipline
  `research/design-review.md` already established for the 2D UI.

### 6.2 Claim-success feedback cue

- When a claim made from `/laundry/scan/:id` succeeds and the viewer
  then returns to (or already has open) the `/laundry` 3D scene, give
  the claimed machine a brief, clearly-visible visual cue (a short
  colour flash, a small animation, a highlight ring — your call) in
  addition to the Stage 2 state-colour change, so "I just claimed this"
  reads as an event, not just a static colour swap someone might not
  notice. This only needs to trigger once per actual claim transition
  (reuse the same "has this state already been shown" idea as the
  existing in-page turn-alert's one-per-transition rule in
  `src/views.ts`/ADR 0009, rather than re-flashing on every unrelated
  SSE tick) — a machine that's simply sitted at "claimed" on page load
  should not flash.
- Verify with Playwright: trigger a real claim (same pattern as Stage
  2's verification), confirm via screenshots taken a moment apart that
  the cue is visible, and confirm it doesn't re-trigger on an unrelated
  SSE event for a different machine.
- Audio feedback is optional and lower priority than the visual cue —
  only add it if there's clearly time left after everything else in this
  prompt is done and verified; skip it otherwise rather than cutting
  corners elsewhere to fit it in.

## 7. Documentation touch-ups in scope for this run

- `plan.md`: append a new entry to "Current state" (don't rewrite
  earlier entries) describing what this run shipped (Stages 1-3 plus the
  in-scope part of Stage 6), and add a line to the feature list. Follow
  the existing terse, factual style of that file's other entries.
- Do **not** touch `README.md`, `PROCESS.md`, `process-notes.md`, or
  `reflections/` — per the ground rules above, suggestions for those go
  in `HANDOFF.md` instead.

## 8. `HANDOFF.md`

Write or append to `HANDOFF.md` with:

- What shipped, stage by stage, with commit hashes.
- Every call you made without asking, and why (e.g. exact room/aisle
  layout, exact colour choices, whether you used the image-generation
  API and for what, exact three.js CDN version pinned, how you split
  `src/views.ts` vs. a new file if you did, what the claim-success cue
  looks like).
- If the Playwright/WebGL environment fix (section 1) stopped working
  partway through, say exactly where and what you fell back to
  verifying instead.
- If you used the image-generation API at all: exactly how many calls
  **in total across the whole run**, for what, and confirm the images
  were downloaded/committed (not left as expiring URLs).
- Anything you think is weak or worth a second pass, specifically
  flagged for the user's own Stage 4 (real phone scan) work — e.g. "the
  QR code might be too small to scan comfortably at the camera's default
  distance from the machine in the scene" is exactly the kind of note
  that saves the user time during Stage 4.
- Confirm no server is left listening on any port this run used.

## Definition of done

- [ ] `GET /laundry` renders a walkable 3D room with 10 machines, gated
      behind the same identity check as `GET /`.
- [ ] Desktop (WASD + mouse-look) and touch (joystick + drag-look)
      controls both work, confirmed via Playwright screenshots showing
      the camera actually moved.
- [ ] Each machine's appearance in the 3D scene reflects its real queue
      state and updates within the existing ~1s SSE window — no new
      broadcast mechanism, no duplicated state-to-colour logic.
- [ ] `GET /machines/:id/qrcode.png` returns a real QR image encoding
      `/laundry/scan/:id`.
- [ ] `GET /laundry/scan/:id` correctly branches into confirm-claim,
      fresh-reservation, read-only-status, and identity-redirect cases,
      using only existing `queue.ts` functions — `src/queue.ts` itself
      is untouched.
- [ ] `POST /identity`'s new `redirect` field only accepts same-origin
      `/laundry/scan/` paths; an open-redirect attempt is checked and
      rejected by a real test, not just reasoned about.
- [ ] A `spec/` file (or equivalent) covers the scan page's three
      branches and the redirect validation, runnable under `pnpm check`
      going forward.
- [ ] (Stage 6, non-phone parts) A visual polish pass on the room/
      machines, confirmed by before/after screenshots actually looked at,
      not just produced.
- [ ] (Stage 6, non-phone parts) A claim-success feedback cue in the 3D
      scene, triggers once per real claim transition, verified not to
      re-trigger on unrelated SSE events.
- [ ] Stage 4 (real phone scan) and Stage 6's recorded-clip item were
      **not** attempted, regardless of time remaining.
- [ ] `pnpm check` green.
- [ ] No server left listening on any port used this run.
- [ ] `plan.md`'s Current state appended (not rewritten).
- [ ] `HANDOFF.md` written, covering the points in section 8.
- [ ] `README.md`, `PROCESS.md`, `process-notes.md`, `reflections/`
      untouched.
- [ ] Nothing pushed, nothing deployed (this run has no reason to touch
      either).
- [ ] The last commit deletes `prompt.md`.
