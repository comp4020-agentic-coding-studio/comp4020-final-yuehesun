# 3D walkthrough plan — "go to the laundry, scan a real machine"

## Read first

- Overall vision: [`plan.md`](../plan.md) — background, the full feature
  list, the User story this stage finally finishes building (walk up and
  scan a machine's code on site).
- `docs/adr/0002-identity.md` and `docs/adr/0004-identity-format.md` —
  identity is a bare room number, no accounts, no login. This stage reuses
  that flow exactly; it does not invent a second one.
- `docs/adr/0003-tech-stack.md` — one Fly machine, one Dockerfile, no
  separate service, Hono JSX + htmx, no required frontend build step.
- `CLAUDE.md` — the fairness rule is the only thing that may change queue
  order; the test-harness rules (clock, simulator isolation, port
  discipline).
- `research/3d-booking/` — prior art, QR interaction patterns, tech-stack
  comparison, and four candidate directions, researched before this plan
  was written. This plan picks concrete choices out of that research; it
  doesn't repeat the survey.
- `src/queue.ts` — `join`, `claim`, `loadOwned`, `settleMachine`. Every
  action this stage adds a new *entry point* for calls these unchanged.
- `src/realtime.ts` — the SSE tick this stage's 3D scene subscribes to,
  the same way the existing board already does.

## Background

**What prompted this.** A course staff member (Bill) reviewed the
deployed app and said the bot-filled simulation doesn't convince him this
is something a real residence would adopt — his suggestion: picture
pitching this to a hall manager, and build whatever would make the pitch
land. His concrete idea: a 3D walkthrough of the laundry room where each
machine has a barcode, scanned with a real phone, landing on a real claim
page.

**What this is, precisely, after being talked through with the user —**
not a new simulation layer on top of `/simulation`'s bot-driven replay
(that stays as-is; see `plan.md`'s current-state section), and not a
digital-twin status board. It's a **first-person, operable, real-system**
addition:

- A first-person 3D scene of the laundry room, reachable from the home
  page at any time (not gated on having a reservation — the user's own
  call, confirmed below).
- Walk up to a machine; it carries a **real, server-rendered QR code**
  encoding a real URL on this deployed app.
- **Scan it with an actual phone camera** — not a scene-internal "tap a
  virtual phone" gesture, not the browser's own camera API. The research
  (`research/3d-booking/qr-interaction.md`) confirms this is also the
  technically simpler and more robust path: the OS camera app decodes the
  code and hands the URL to the browser, with none of the
  `BarcodeDetector` Safari-support gap a self-scanning page would hit.
- The landing page is **the same identity/ownership logic the rest of the
  app already uses** (`loadOwned`, the `roomXXX` cookie) — scanning
  doesn't add a second way to be identified or a second way to be
  authorized.

**Why this isn't a conflict with the locked identity decision.** Bill's
own phrasing was "taken to a log-in page" — read literally, that would
mean inventing an account system, which directly contradicts ADR 0004.
What he's actually pointing at (confirmed with the user) is the *shape*
of the flow — scan, land somewhere, that somewhere knows who you are and
lets you act — not literally a login form. The existing room-number
cookie flow already provides exactly that shape; this stage's job is
wiring a new physical/spatial entry point into it, not replacing it.

## What this stage is, as a flow (confirmed with the user)

1. **Identity.** Unchanged. First visit to `/` with no `person` cookie
   shows the existing `identityPage()`.
2. **Reserve from the room.** Unchanged. The existing home page board,
   `queue.join()`.
3. **"Go to the laundry" entry point.** A link/button on the home page,
   visible at all times (confirmed: not gated on having an active
   reservation — someone might want to look at the room before deciding
   whether to queue at all, mirroring the real walk-down-and-look
   behaviour `plan.md`'s User story already describes for the *physical*
   room). Opens `/laundry` (new route, new page, still server-rendered
   Hono JSX — the 3D canvas is one `<script>`-loaded chunk inside it, not
   a separate app).
4. **First-person walkthrough.** WASD + mouse-look on desktop; the same
   scene adds an on-screen touch joystick + drag-to-look on a touch
   viewport (confirmed: desktop-first, touch alongside from the start,
   not a later pass). Ten machines, laid out in a fixed floor plan,
   each rendered with a live appearance driven by its real status (free /
   running / claimed / unclaimed-but-done), fed from the same SSE stream
   `/events` already broadcasts — no new transport.
5. **The QR code is real and server-rendered.** Each machine's model
   carries a texture fetched from a new route, `GET
   /machines/:id/qrcode.png` (or `.svg`), generated server-side from a URL
   of the shape `https://<deployed-host>/laundry/scan/:machineId` — plain
   data, not a token (why: below, under "Decisions").
6. **Real phone, real scan.** The user physically points a second device's
   camera at the rendered code (on a screen showing the 3D scene — a
   laptop, a phone, whatever's displaying `/laundry`). The OS recognizes
   the URL and offers to open it, same as any restaurant table QR flow
   (`research/3d-booking/qr-interaction.md`).
7. **Landing page, `GET /laundry/scan/:machineId`.** Three cases,
   confirmed with the user — this is the actual new logic this stage
   adds, built entirely on existing `queue.ts` functions:
   - **No `person` cookie on this device** → show the existing
     `identityPage()`-equivalent flow, but redirecting back to this same
     scan URL afterward (needs a small addition — see Stage 2 below —
     since `POST /identity` today always redirects to `/`).
   - **This room has the front `waiting` reservation on this machine** →
     show a confirm screen with a "Claim" button posting to the existing
     `POST /reservations/:id/claim`. This is Bill's "confirm" case.
   - **This room has no active reservation on this machine, and the
     machine is free (no active reservations at all)** → show the
     existing reservation form (washing/drying type), posting to the
     existing `POST /machines/:id/reservations`. **Confirmed with the
     user: this case is in scope** — it's also what finally ships the
     "walk up and scan a machine's code on site... opens that machine's
     reservation directly" line from `plan.md`'s own User story, true
     since crit 8 but never actually built.
   - Anything else (machine occupied by someone else, or this room is
     queued elsewhere on it but not at the front) → a read-only status
     view of that machine, matching `plan.md`'s existing "scan a machine
     that's already reserved... switches to that machine's
     reservation/status page" line.
8. **State flows back the same way it already does.** A claim made from
   the scan page is a normal `POST /reservations/:id/claim` call —
   `queue.ts` doesn't know or care that the request came from a phone that
   just scanned a code instead of a button tap on the home page. The 3D
   scene's own view of that machine updates via the same SSE tick, same
   as the home page's board does today.

## What this deliberately does not do

- **No new identity mechanism.** No accounts, no session tokens separate
  from the existing `person` cookie, no per-code secret. See "Decisions"
  below for why a plain machine-id URL is fine here.
- **No new queue-ordering logic.** The scan landing page calls `join`/
  `claim` exactly as they exist; it cannot reach any code path the home
  page's buttons can't already reach. `CLAUDE.md`'s rule ("the documented
  fairness rule is the only thing that decides turn order") isn't touched
  because nothing new decides order — this is a new *door*, not a new
  *rule*.
- **No second server/process.** The 3D scene is static assets + one new
  page route served by the same Hono app, same Dockerfile, same Fly
  machine. `docs/adr/0003-tech-stack.md`'s single-process decision holds.
- **No change to `/simulation`'s bot replay.** That stays exactly as
  shipped in crit 10's extension. This is a new, separate surface.

## Decisions to record (new ADR, Stage 5 below)

1. **QR payload is a plain machine-id URL, not a signed/expiring token.**
   Reasoning to write up: the security model here is identical to a real
   barcode sticker taped to a real machine — anyone standing in the room
   could photograph and reuse it, and ADR 0002 already accepts that
   identity itself is unverified and spoofable by design (a resident
   could already claim a reservation that isn't theirs by typing someone
   else's room number). A token would protect against a threat this app
   has never defended against anywhere else, at the cost of a new
   mechanism to design, store, and invalidate. Worth a sentence
   acknowledging the one real new difference a *physical* sticker would
   have (durability/tamper risk - research flagged this for real QR
   ordering systems) even though this deployment's "sticker" is a
   rendered texture, not a printed one.
2. **Scan landing flow reuses `identityPage`, not a new identity form.**
   The only new thing is a redirect-back-to-origin parameter so
   `POST /identity` can return to `/laundry/scan/:id` instead of always
   `/`. Reasoning: inventing a second identity entry point would be the
   actual ADR-0004 violation Bill's wording risked; reusing the one
   that exists keeps "room number is the only identity" true everywhere,
   not just on the home page.
3. **Tech stack for the 3D layer: three.js via CDN `<script>` tag, no
   bundler.** Per `research/3d-booking/tech-stack.md`'s comparison: this
   is the one path that adds a 3D engine without adding a build step,
   keeping `docs/adr/0003-tech-stack.md`'s "no required frontend build"
   property intact. React Three Fiber is explicitly ruled out (needs
   React + a bundler). `<model-viewer>` is ruled out separately (single-
   model viewer, not a multi-object interactive scene). A-Frame was the
   other real candidate; three.js is preferred because this stage needs
   custom per-machine interaction/state-binding logic that's more direct
   to write against three.js's own scene graph than through A-Frame's
   HTML-entity abstraction — worth a sentence in the ADR, not a deep
   comparison.
4. **Scanning is phone-camera-to-browser, not browser-camera-to-code.**
   Already covered above; recorded as a decision because it's the one
   place this plan deliberately does *less* than Bill's literal image
   (the user doesn't operate a virtual phone inside the scene) in
   exchange for a materially more real interaction (an actual phone,
   actual camera, actual OS link-open) and side-steps a real Safari
   compatibility gap.
5. **The "go to the laundry" entry point is unconditional, not gated on
   having a reservation.** User's own call — mirrors that a real resident
   can walk into the laundry room to look around before deciding to
   queue.

## Open design questions to settle during Stage 1

- **3D asset style and source.** `research/3d-booking/ideas.md` and
  `prior-art.md` lean toward low-poly / stylized over photorealistic for
  a small, quickly-built scene (cheaper to build well, matches what
  shipped prior art actually uses). Confirm: build simple geometric
  machine models directly in three.js (boxes + cylinders + a drum
  texture), or source/generate textures via the course's image-generation
  proxy (`research/3d-booking/asset-generation.md` — the `sk-` key also
  calls `strproxy.comp.anu.edu.au/api/images/generations`, flat $30/300-
  image budget for the whole course, shared with nobody else's usage so
  far; **remember to download any kept image immediately, URLs expire,
  and calls need the ANU network/VPN**). Likely answer: simple built
  geometry for the room/machines (cheap, controllable, no quota spent),
  generated textures only if a specific surface (e.g. a drum front, a
  floor texture) needs more visual richness than flat colour can give —
  decided per-asset during Stage 1/2, not all up front.
- **Floor plan.** A fixed, hand-authored layout (10 machine positions, one
  walkable room) is enough — no procedural generation, no editor.
- **QR render size/placement on the model** — needs to be large enough
  for a phone camera to resolve at a plausible in-scene viewing distance;
  verified by hand (point a real phone at a real rendered frame), not
  assumed.

## Stages

### Stage 1 — `/laundry` scene skeleton, no QR/claim wiring yet

- New route `GET /laundry`, new view in `src/views.ts` (or a new
  `src/laundry-view.ts` if the file split reads better once written),
  loading three.js from a pinned CDN URL.
- Fixed room geometry: floor, walls, 10 machine placeholders in a
  fixed layout. No per-machine data binding yet — just a walkable empty
  room to get the rendering/controls loop right first.
- WASD + mouse-look (desktop) via three.js's `PointerLockControls` or
  equivalent; on-screen joystick + drag-look for touch viewports (a small
  hand-rolled control scheme, not a dependency, since the surface area is
  small).
- **Verify:** load `/laundry` in a desktop browser and walk around; load
  it on a real phone viewport (or emulated) and confirm the touch
  controls work. No server-side logic changes yet.

### Stage 2 — live machine state in the scene

- Each machine placeholder's appearance (colour/texture/label) driven by
  its real `QueueRow` state, fetched once on page load and kept current
  via the existing `/events` SSE stream (same event names
  `realtime.ts` already broadcasts — `machine-${id}`, `changed`). No new
  server-side broadcast logic; the 3D scene is a second consumer of data
  the home page already consumes.
- **Verify:** open `/laundry` and the home page side by side in two
  windows; make a reservation on the home page; confirm the 3D scene's
  corresponding machine visibly updates within ~1s, matching the home
  page's own existing real-time guarantee (crit 9).

### Stage 3 — real QR codes and the scan landing page

- `GET /machines/:id/qrcode.png`: a small dependency-light QR generation
  library (pure JS/TS, no native build step — confirmed during Stage 1's
  research pass, since `docs/adr/0003-tech-stack.md`'s Dockerfile
  already carries one native-module toolchain for `better-sqlite3` and
  shouldn't need a second one for this), encoding
  `https://<host>/laundry/scan/:id`. Textured onto each machine model in
  the 3D scene.
- `POST /identity` gains an optional `redirect` field (form hidden input,
  validated against a small allowlist shape — same-origin path under
  `/laundry/scan/` only, never an arbitrary redirect target) so scanning
  while logged out returns to the scan page afterward instead of always
  `/`.
- `GET /laundry/scan/:id` (new route): the three-way branch described
  above ("What this stage is, as a flow", step 7), built entirely from
  `queue.queueFor()`/existing action routes — no new queue.ts function
  needed for reading state; the existing `actionRoute` helper
  (`src/app.ts`) covers posting the claim/join actions this page's forms
  submit to, unchanged.
- **Verify:** generate a reservation, open the scan URL directly in a
  browser (not yet via an actual phone scan) for all three branches
  (confirm/claim, fresh reservation, read-only status) with a fresh
  cookie each time to hit the logged-out redirect path too.

### Stage 4 — the real scan, end to end

- Deploy to the real `*.fly.dev` app (this stage can't be meaningfully
  verified on localhost — the QR has to encode a reachable public URL).
- With a real second phone: point its camera at the rendered QR on the
  machine model inside `/laundry` (displayed on a laptop or another
  phone's screen), confirm the OS offers to open the link, confirm the
  landing page behaves correctly for a logged-out phone (redirect through
  identity, then back), a phone already holding the front reservation
  (claim path), and a phone with no reservation on a free machine (join
  path).
- **Verify (by hand, recorded in the commit message, same shape as crit
  8/9's other timing-dependent manual checks):** the full loop — scan,
  claim/join, watch the 3D scene (on the first device) update via SSE
  within ~1s.

### Stage 5 — document it

- New ADR (`docs/adr/0012-3d-walkthrough.md` or next free number):
  records the five decisions listed above under "Decisions to record".
  Explicitly states this is **additive** — doesn't redecide ADR 0002/
  0003/0004, cross-references them.
- `README.md`: one new paragraph under "What this is" or a new short
  section describing the walkthrough as another way to reserve/claim
  (not a replacement for the home page), matching the enforced/judged
  split style already used — note that the QR-scan flow being a genuine
  real action (not a demo prop) is **judged by using it**, same as the
  claim-window timing rules already are.
- `plan.md`: grow the feature list with a new entry, update "Current
  state".

### Stage 6 — polish pass (quality-first, per the user's explicit call not
to under-build this for time)

Only scoped once Stages 1-5 are solid and demonstrably working — this is
where "make it actually impressive" work goes, not a blocker for the
walkthrough being real and functional:

- Visual pass on the room/machines (lighting, materials) — candidates
  from `research/3d-booking/ideas.md`.
- Sound/feedback cues on claim success inside the scene (optional,
  decide once Stage 4 is working and there's something to react to).
- A short recorded clip of the real phone-scan flow, for anyone reviewing
  the deployed app without a second phone on hand — not a replacement
  for the live flow, a backup.

## What I check after this stage

- A real two-device rehearsal (one screen running `/laundry`, one actual
  phone scanning) before trusting this at a crit/demo — same shape as
  crit 10's own "rehearse the actual format before trusting it" stage.
- `pnpm check` green against the deployed image, not just local.
- Nothing in `src/queue.ts` changed — if a diff touches it, that's a
  signal this stage scope-crept into re-deciding fairness/ownership
  logic instead of reusing it.
