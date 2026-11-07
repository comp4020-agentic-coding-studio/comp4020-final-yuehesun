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

### Stage 7 — entry-point visibility, mouse-lock onboarding, and a real "interactable" QR interaction (user feedback after trying the Stage 1-3/6 build)

Written after actually using the shipped `/laundry` page. Three real
problems found by using it, not by reading the diff — the same
"look at it before shipping" discipline `research/design-review.md`
already established:

1. **The entry point is invisible.** "Go to the laundry" sits as a plain
   text link in the top nav, no different in weight from "What good means
   here" — nothing about it reads as the primary way into a whole feature.
2. **Pointer lock has no onboarding and a confusing exit.** Clicking the
   canvas silently requests pointer lock; the only way out is the
   browser's own Escape handling, which nothing on the page explains.
3. **The QR code is physically absurd and visually wrong for the medium.**
   A real washing machine doesn't have a dinner-plate-sized barcode
   stuck to its front. Stage 3/6 made it large and permanently visible
   because "big enough to maybe scan" was the only goal in view — but
   this reads as a UI element pasted onto a 3D object, not as an object
   that belongs in the room.

**Design model this stage adopts: standard "interactable object" language
from exploration/adventure games** (outline-highlight on hover/look,
inspect-to-examine), not an invention — e.g. the outline-highlight
pattern used across modern adventure/RPG titles to mark what the player
can act on before they commit to acting on it, and "walk up, look at a
small object, examine it in a focused close-up view" as the standard way
such games reveal detail that wouldn't read at normal play distance. This
stage borrows the *interaction shape*, not any specific game's assets or
code.

#### 7.1 A real entry button on the home page

- Add a visible call-to-action on `homePage()` itself (`src/views.ts`) —
  styled like the existing `.btn-primary` buttons used for Claim/Reserve
  actions elsewhere on the page, not the plain-text nav link. Placed
  near the top of the page content (not buried below the board), since
  this is a standing feature entry point, not a per-reservation action.
- The nav link (`page()`'s shared top nav) stays too, for every *other*
  page's own reachability (the scan page, the simulation page, etc.) —
  this is additive, not a replacement, matching how the original
  Stage 1 plan already decided the entry point should be reachable from
  "every page's nav unconditionally."

#### 7.2 Pointer lock requested automatically, with a persistent on-screen hint

- On entering `/laundry`, request pointer lock immediately (best-effort —
  browsers may decline a lock request not tied to a user gesture; if
  declined, WASD movement still works unlocked, matching the existing
  "movement never depends on pointer lock" design already in place for
  Playwright/automation compatibility) rather than waiting for a click.
- A small, persistent, unobtrusive on-screen label in a corner of the
  canvas — "Press ESC to exit look mode" or equivalent — visible
  whenever the pointer is actually locked, hidden otherwise. This
  replaces the plan's original idea of a separate instructional
  paragraph: the hint lives exactly where and when it's relevant, not as
  a one-time sentence the player has likely stopped reading by the time
  they need it.
- If the browser declines the initial automatic lock request (common —
  many browsers require a user gesture), fall back to the existing
  click-to-lock behavior silently; the corner hint still appears once a
  lock is actually acquired, by either path.

#### 7.3 Machines become inspectable objects; the QR code moves into an examine view

This replaces Stage 3/6's "large QR plane always visible on the
machine's face" entirely:

- **At rest, a machine shows only a small, deliberately illegible
  texture** on its face — described in-world as a worn/taped-on paper
  strip (a plain small rectangle with a faint scribble/placeholder
  texture is enough; this is not the QR code itself, just set dressing
  implying "there's a label here"). The real QR code is not rendered on
  the machine at normal viewing distance at all.
- **Hover/look-at outline highlight**: using three.js raycasting from
  the camera's forward direction (the existing crosshair at screen
  center already marks this direction — this stage makes it functional,
  not just decorative), when the ray intersects a machine, that
  machine's mesh gets an outline/glow treatment (a cheap approach:
  a slightly-scaled duplicate mesh rendered in a flat highlight colour
  behind the real one — "inverted hull" outlining — avoids a
  post-processing pipeline three.js doesn't have wired up here; a
  post-processing outline pass is a heavier alternative, not needed for
  a handful of simple box meshes). No highlight when not looking at any
  machine. This is the "selectable object" signal — same purpose as the
  existing crosshair, made purposeful rather than cosmetic.
- **Click/tap while highlighted → open an examine overlay**: a 2D HTML
  overlay (not a 3D in-scene zoom — simpler to build correctly, and
  guarantees the QR code itself is rendered at native pixel resolution
  with no WebGL texture-filtering softness to fight, which is exactly
  the kind of real scannability risk `HANDOFF.md` already flagged from
  Stage 3). The overlay: dims/pauses the 3D view behind it, shows the
  machine's label, the real `GET /machines/:id/qrcode.png` image at a
  large, crisp size (an `<img>` tag, not a canvas texture — this sidesteps
  three.js texture filtering questions entirely for the one place
  scannability actually matters), and a close control. Closing it
  (a button, or Escape) returns to the 3D view with pointer lock
  re-requested the same way as initial entry.
- **Why this is a strict improvement over Stage 3/6's approach, not just
  a style change**: the QR code was already confirmed scannable in
  isolation (Stage 3's own jsQR round-trip decode) — the problem Stage 6
  partially chased (shrinking/repositioning the in-scene plane) was
  inherently limited, because *any* QR code rendered as a WebGL texture
  on an angled, lit, distant 3D surface is fighting resolution, lighting
  and viewing-angle all at once. Moving the actual scan target into a
  plain, flat, native-resolution `<img>` in a 2D overlay removes all
  three problems at the source, rather than continuing to tune size/
  position parameters against a medium that was never well-suited to
  precise barcode reproduction in the first place.
- **The "worn paper strip" placeholder texture and the outline-highlight
  colour** are small, cheap to build directly (a plain rectangle, a flat
  emissive colour) — this does not need the course's image-generation
  API; skip it unless a specific surface genuinely needs more visual
  richness than a flat colour/simple texture gives, per the same budget
  discipline already established in Stage 1/6.

#### Verify (Stage 7)

- Playwright: load the home page, confirm the new button is present and
  visually distinct (not just text) from the nav link.
- Load `/laundry`, confirm a pointer-lock request fires on entry (or
  confirm the graceful click-to-lock fallback if the automated browser
  context declines the initial request — document whichever happens in
  the commit message, don't assume).
- With the `__laundryDebug` escape hatch (or a new one, if the camera's
  look-direction needs to be driven directly for a deterministic test):
  aim at a machine, confirm the highlight activates (checkable via a
  material/colour property on the highlight mesh, the same inspection
  style `__laundryQrMeshes`/`__laundryLastKnownState` already use);
  aim away, confirm it deactivates.
- Simulate a click while a machine is highlighted, confirm the examine
  overlay opens, contains an `<img>` whose `src` is that exact machine's
  `/machines/:id/qrcode.png`, and that the underlying PNG still decodes
  correctly via jsQR (re-run Stage 3's own decode check against the
  overlay's actual rendered `<img>` source, not just the route in
  isolation) — confirming the fix actually holds, not just that an
  overlay appears.
- Confirm closing the overlay (button and Escape) returns to the 3D
  view and pointer lock re-acquisition is attempted.
- Screenshots: the new home-page button, the hover-highlight state, and
  the open examine overlay — saved alongside the existing
  `research/screens/laundry-stage*.png` set.

### Stage 8 — a real room, a real character, and a real unclaimed-laundry handoff

Written after using the Stage 1-3/6/7 build and getting direct feedback:
the room reads as a tech demo (ten identical grey boxes against one wall,
first-person camera with no visible character), not an explorable space.
This stage is a large visual and interaction rebuild, **plus the first
real implementation of `plan.md`'s feature #18** ("unclaimed laundry
handed off to a numbered pickup spot"), which has sat as a scoped-but-
unbuilt gap since crit 9. Both land together because the second only
makes sense once there's a character to carry something.

This is exactly the kind of change `CLAUDE.md`'s Workflow section asks to
be planned before coding, on more than one count: it's a new interaction/
state model (a character with a carried-object state, a new real backend
feature with its own data and authorization rule), not wiring an existing
mechanic to a new view.

#### 8.1 Asset sourcing — real, CC0-licensed models, not primitives

Per `research/3d-booking/asset-sourcing.md` (written before this stage;
read it in full before touching any loader code):

- **Kenney's "Furniture Kit"** (CC0; <https://kenney.nl/assets/furniture-kit>,
  mirrored as ready-to-use glTF at <https://poly.pizza/bundle/Furniture-Kit-NoG1sEUD1z>
  or as individual `.glb` files at
  <https://eclair-assets.itch.io/furniture-kit-glb-pack-140-free-cc0-3d-models>)
  supplies, by exact model name: **Washer**, **Dryer**, **Kitchen Sink** /
  **Bathroom Sink**, **Lamp Square Ceiling** / **Lamp Round Ceiling**, and
  plain table models (reused for the ironing table and the drop-off
  shelf — no separate ironing-board or shelf model exists in the pack by
  name, and none is needed; a plain table reads fine at this scene's
  scale per the research).
- **Kenney's "Mini Characters"** (CC0; <https://kenney.nl/assets/mini-characters>)
  supplies the player character: chibi-proportioned (head ~40% of body
  height — already close to "round head" without modification), rigged,
  with walk-cycle animations included. **Known packaging caveat from the
  research**: a single extracted `.glb` references an external texture
  file and will render untextured if that file isn't kept alongside it.
  **This stage's fix, decided here rather than left as a loose end**: the
  character's material is replaced in code with one flat
  `MeshStandardMaterial` (single colour, no texture map at all) — this is
  what the user actually asked for ("round head, head and body one single
  colour"), and it makes the external-texture caveat moot, since the
  model never samples a texture in the first place. The walk animation
  itself (from the GLTF's `AnimationClip`s) is kept and played via
  three.js's `AnimationMixer` — only the *material*, not the rig or
  animation data, is overridden.
- **Loading mechanism**: `GLTFLoader`, imported the same way
  `research/3d-booking/asset-sourcing.md` confirmed works with zero
  bundler — a direct jsDelivr URL pinned to the exact three.js version
  already in use (`THREE_VERSION` in `src/laundry-view.ts`):
  `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js`,
  imported via its full URL (matching how `THREE_BASE` already works), no
  import map needed.
- **Where the actual model files live**: downloaded once and committed
  into the repo (e.g. `public/models/*.glb`) rather than fetched from a
  third-party host at runtime — matches `docs/adr/0003`'s "no outbound
  dependency at runtime" shape the rest of the app already follows (the
  QR code, the README, everything is generated/served from this one
  container). This needs a static-file route added to `src/app.ts` (Hono
  has `serveStatic` via `@hono/node-server/serve-static` — a new,
  tiny dependency, or a hand-written `GET /models/:file` route reading
  from disk if adding a dependency for this alone seems like overkill;
  decide once actually wiring this up, not here). Each model file's
  source URL and exact license statement gets a one-line comment at its
  point of use in `src/laundry-view.ts`, plus a `public/models/SOURCES.md`
  crediting Kenney by name (CC0 doesn't require attribution, but the
  research's own house style already credits sources throughout
  `research/3d-booking/`, and it costs nothing).
- **Before committing to using a model as-is**: open it once (a quick
  Playwright screenshot of it alone, isolated on a blank scene, the same
  "look before shipping" discipline used throughout this plan) — the
  research flagged that polygon/texture detail wasn't independently
  verified; confirm it actually looks like a washer/dryer/sink before
  building the whole room layout around it.

#### 8.2 A real floor plan, not machines against one wall

Replaces Stage 1's "two rows of 5 against the layout" entirely:

- **Machines are not flush against a wall.** A real laundry room has
  walking space on every side a person needs to reach a machine's front
  (to load it) — the new layout gives each machine row a walkable aisle
  in front of it, with the row set back from the wall behind it, not
  touching it.
- **Named functional zones, not just a machine grid**: a washer bank, a
  separate dryer bank, a sink area (with a sink model, for visual
  completeness — not an interactive object), an ironing area (a table +
  a simple box "iron" prop), and the **drop-off area** (a table/shelf
  model with a fixed number of named spots — see 8.4). Rough relative
  placement (exact coordinates decided during implementation, not
  pre-computed here): machines along two long walls with the aisle
  between them (keeping Stage 1's working aisle-and-collision concept),
  sink and ironing area along a shorter wall, drop-off area near the
  room's entrance/exit point (the logical "first thing you see coming
  in," matching where a real laundry room would put a lost-and-found-
  style shelf).
- **Ceiling and lighting**: the room gains a visible ceiling plane (Stage
  1 had none — an open-topped box) and 2-3 of the Furniture Kit's ceiling
  lamp models placed along it, which **replace** (not just supplement)
  Stage 6's single directional "sun" light as the primary light source —
  a laundry room is indoor-lit, not sunlit; a directional light reading
  as sunlight through a solid ceiling would look wrong. Point lights or
  spot lights positioned at each lamp model's position, tuned for the
  warm palette Stage 6 already established.
- **Object density**: per `research/3d-booking/asset-sourcing.md`'s
  "low-poly exploration game" reference research, a believable small
  room reads as *furnished*, not sparse — the sink, ironing table, and
  drop-off table all contribute to this alongside the machines
  themselves, rather than the room being ten machines and nothing else.
- A floor-plan sketch (simple top-down ASCII or a short written
  description of zone placement) gets written into this plan file as an
  amendment before the layout is coded — the same "design before CSS"
  discipline `research/design-plan.md` already established for the 2D
  UI, applied here to a 3D layout instead of a wireframe.

##### 8.2 floor-plan sketch (written before the layout code, per the note above)

Top-down, not to scale. `+Z` is "south" (toward the entrance/spawn), `-Z`
is "north" (the far wall), `+X` is "east," `-X` is "west" — arbitrary but
fixed, so every coordinate below reads unambiguously against it.

```
                              -Z (north / far wall)
        ┌─────────────────────────────────────────────────────┐
        │  [W1][W2][W3][W4][W5]     [W6][W7][W8]  [D1][D2]     │  <- washer bank, then dryer
        │   (one continuous row, a visible gap between          │     bank, same wall,
        │    washers and dryers — they're still two machine     │     set back from the
        │    TYPES even if they share a wall)                   │     wall, aisle in front
        │                                                        │
        │                                                        │
-X      │                  w a l k a b l e   a i s l e           │      +X
(west,  │                                                        │  (east,
 short  │                                                        │   short
 wall)  │                                                        │   wall)
        │  [Sink]   [Ironing table            [Drop-off table    │
        │   table]   + small "iron" box prop]  + N numbered       │
        │                                       spots]            │
        │                                                        │
        │                                                        │
        │              (entry / player spawn point,               │
        │               roughly centered on this wall)            │
        └─────────────────────────────────────────────────────┘
                              +Z (south / entrance wall)
```

- **Washer/dryer bank**: one continuous row along the north wall (`-Z`),
  not two facing rows as Stage 1 had — Stage 1's *aisle-and-collision*
  concept (a walkable gap, per-axis AABB collision) is kept, but with all
  10 machines on one wall and the full room depth as open floor in front
  of them, there's room for the other zones on the remaining three walls
  without the room becoming oddly deep. Washers (8) and dryers (2) sit in
  the same row, in that order, with roughly one `SPACING` unit of visible
  gap between the last washer and the first dryer so the two types read
  as grouped, not interleaved.
- **Sink and ironing area**: against the west wall (`-X`), sink closer to
  the corner shared with the machine bank (mirroring how a real laundry
  room's wet fixtures cluster near each other), ironing table further
  along the same wall. Both pulled in from the wall by the same margin
  machines use, so their collision boxes don't touch it either.
- **Drop-off area**: against the east wall (`+X`), deliberately on the
  opposite side of the room from the sink/ironing cluster — per
  `plans/3d-walkthrough.md`'s own reasoning, this is the "first thing you
  see coming in" zone, so it sits closer to the entrance (south wall) than
  the machine bank does, at the room's south-east.
- **Entry/spawn point**: the south wall (`+Z`), roughly centered in `X`.
  The character's initial position (`pos.x = 0, pos.z` near the south
  wall) replaces Stage 1's spawn at the room's exact center, since a
  real room is entered from a doorway, not materialized in the middle of
  the floor.
- **Room dimensions, relative to existing constants**: width (`X`) driven
  by the 10-machine row's total span (`SPACING * 10`, plus the washer/
  dryer gap and wall margins) — wider than Stage 1's room, since all 10
  machines now share one wall instead of splitting across two. Depth
  (`Z`) is generous enough to comfortably fit the aisle plus the sink/
  ironing/drop-off zones' own footprint without crowding them against
  the machine bank — concretely, at least `AISLE` (Stage 1's existing
  6-unit constant) plus enough extra depth for a table-sized zone (~1.5
  units) near each side wall, decided precisely once real table/sink
  bounding boxes (confirmed in Stage 8.1's isolated preview) are placed.
- **Ceiling lamps**: 2-3 `lampSquareCeiling` models spaced along the
  room's centerline in `X`, hung from the new ceiling plane — enough to
  light the aisle and both side zones without needing one lamp per zone.

#### 8.3 Third-person camera and a real walking character

Replaces the first-person camera entirely, per
`research/3d-booking/asset-sourcing.md`'s confirmed pattern:

- A character root `Object3D` (the Mini Characters model) replaces the
  camera as the thing WASD/joystick input moves. The camera becomes a
  rig offset behind and above the character, lerping toward the
  character's position/rotation each frame rather than snapping — the
  standard third-person "follow camera" shape, not orbit controls (the
  player doesn't freely spin the camera independent of facing; look
  direction and movement direction stay linked, as they already are in
  the existing first-person code, just mediated through a character now
  instead of directly).
- **Collision**: `src/laundry-view.ts`'s existing `collidesWithMachine`/
  `clampToRoom` AABB logic is extended to apply to the character's feet
  position instead of the first-person camera point directly — per the
  research, this is confirmed as the right amount of physics for a flat-
  floored room with box-shaped obstacles (no capsule collider, no
  physics engine dependency).
- **Walk animation**: the character's `AnimationMixer` plays its walk
  clip while any movement input is active (keyboard or joystick), and
  rests on an idle pose (or just the first frame of the walk clip) when
  stationary — driven by the same `forwardInput`/`strafeInput` values
  the movement code already computes each frame, not a second, separate
  "am I moving" check.
- **Touch/desktop input mapping stays conceptually the same** (WASD /
  joystick = move, mouse-drag / look-zone = orbit the follow camera
  around the character rather than directly setting eye-line yaw/pitch)
  — the existing dual-input-source architecture is kept, only what it
  drives changes.
- **Interaction targeting, carried over from Stage 7's design, adjusted
  for third person**: Stage 7's plan used a screen-center raycast (first-
  person "crosshair" convention) to detect what the player is looking
  at. In third person, proximity-based detection (distance from the
  character to each interactable object, highlighting the nearest one
  within a threshold range) is the more standard convention for this
  camera style — per the research, no off-the-shelf library was found
  specifically for this, but `THREE.Interactive`'s raycaster-based
  `InteractionManager` (MIT, confirmed CDN-loadable) or a hand-rolled
  distance check are both legitimate; a simple distance check is likely
  the lower-effort correct choice here, since the "which object is
  nearest and in front of the character" test is simpler than a
  screen-space raycast once the camera is no longer the player's own
  eyes. Stage 7's outline-highlight visual treatment (an inverted-hull
  duplicate mesh) carries over unchanged — only what *triggers* it
  changes.

#### 8.4 The laundry-basket mechanic — carrying your own, and a real pickup-handoff feature

**Two distinct mechanics, confirmed with the user — do not conflate them:**

**(a) Your own basket — a pure visual mapping onto existing reservation
state, no new data.** The character model gains an attachable "basket"
child mesh (a simple box/lattice shape — part of the Furniture Kit, or a
small hand-built prop if the pack doesn't have one; not worth extensive
sourcing effort for one small prop), shown or hidden based on the
viewer's own current reservation state, read the same way `src/app.ts`'s
`GET /` already computes "my" row (`rows.find(r => r.person === identity)`):

- No reservation, or reservation status `waiting`/`claimed` (not yet
  started) → basket **visible** (carrying clothes to the machine).
- Reservation status `running` → basket **hidden** (clothes are in the
  machine).
- Reservation status `done`, not yet acknowledged picked up → basket
  **visible again** (going to collect the finished laundry) — "not yet
  acknowledged" is new state this stage adds anyway for mechanic (b)
  below (`pickedUpAt`), reused here for free.
- This needs no new route: it's computed from data `GET /laundry/
  machines-state` (Stage 2) or an equivalent small per-viewer endpoint
  already returns or can trivially be extended to return, keyed off the
  viewer's own identity cookie (the 3D scene already knows its own
  viewer's identity the same way the rest of the app does — via the
  cookie sent with every request).

**(b) Picking up someone else's laundry and handing it to a numbered spot
— a real new feature, per `plan.md`'s feature #18, built now because
this stage gives it a character to carry it.** This needs real new
schema, a real new authorization rule, and real new routes — scoped
precisely, not folded loosely into the 3D code:

**Schema** (`src/schema.ts`, via `drizzle-kit generate` — a new,
additional migration, never hand-edited into an existing one, per
`CLAUDE.md`'s migration rule):

```ts
// Set once a resident's own reservation reaches "done" and someone else
// (the next person queued for this exact machine) moves the clothes to
// a numbered drop-off spot because they need the machine now. A plain
// column, not a new table — one unclaimed handoff per reservation, never
// more than one at a time, same shape as the existing `notice` column's
// "one outstanding fact at a time" design.
pickupSpot: text("pickup_spot"), // one of a fixed list, e.g. "A1".."A6" — never free text, same discipline as room numbers
pickedUpAt: int("picked_up_at"), // set when the original owner confirms collection; null = still sitting in the spot
```

No new table: this is one fact about an existing `done` reservation, the
same way `dryerPromptDismissed` is one fact about an existing reservation
rather than a new entity.

**Fixed spot list**: a short constant array (e.g. 6 named spots, matching
how many the drop-off shelf model in 8.2 actually has room for) — defined
once in `src/queue.ts` or a new small `src/pickup-spots.ts`, the same
"fixed list, not freely typed" discipline `CLAUDE.md`'s App rules already
require for room numbers.

**Who may trigger a handoff — a new, deliberate exception to
`loadOwned`'s "only the reservation's own owner may act on it" rule,
documented as its own ADR, not silently added**: per `plan.md`'s feature
#18 description ("if the next person needs the machine before the
previous owner has collected their clothes") and confirmed by the user's
own framing throughout this conversation, the person allowed to move
someone else's finished laundry is **whoever currently holds the next
active (`waiting`) reservation on that exact machine** — i.e. the person
this handoff is *for*. Not any room, not staff, not whoever happens to be
nearby in the 3D scene. This is checkable with the same `activeReservations`-
style query `queue.ts` already uses elsewhere (front of the queue, after
the `done` one) — no new concept, a new permission *rule*, cross-
referenced from the new ADR back to `docs/adr/0002`/`0004` the same way
`docs/adr/0012` already does.

**Spot assignment is server-chosen, not user-chosen — confirmed with the
user after an initial misunderstanding was corrected.** The handoff
action takes no spot parameter at all: the server picks the first free
spot from the fixed list (simple linear scan — same "no fancy allocation,
correctness over cleverness" spirit as `nextJoinedAt`'s tie-avoidance
logic) and returns which one it picked. A user-chosen dropdown was
considered and rejected: it reopens exactly the "two people pick the same
free slot at once" race `nextJoinedAt`'s own comment already identifies
as a real failure mode for exactly this kind of "let the user pick from
a shared pool" UI, for no real benefit (the resident doing the moving has
no preference between physically identical numbered spots) — the
server deciding and then displaying the result is simpler and immune to
the race by construction.

**Routes** (new, small, following `src/app.ts`'s existing route shape —
not touching `src/queue.ts`'s exported fairness/claim functions, but
needing a new function there or in a sibling module, since this is
genuinely new queue-adjacent logic, not a reuse of `claim`/`join`):

- `POST /machines/:id/handoff` — the pickup-and-place action. Validates:
  caller holds the front `waiting` reservation on machine `:id` (the new
  authorization rule above), and there is a `done`, not-yet-`pickedUpAt`
  reservation on that same machine to hand off. Picks the first free spot
  (scanning existing `pickupSpot` values with `pickedUpAt IS NULL` across
  all reservations), sets it on the `done` reservation, and responds with
  which spot was chosen (so the 3D scene / 2D confirmation UI can display
  it back to the acting resident — **this is what the user means by
  "the user must see the spot number"**: not a choice, a *result*, shown
  plainly after the fact).
- `POST /reservations/:id/acknowledge-pickup` — the original owner
  confirming they've collected their laundry from the named spot. `
  loadOwned`-gated exactly like every other per-reservation action (this
  one *is* the owner acting on their own reservation, no exception
  needed here). Sets `pickedUpAt`, which is what frees the spot for reuse
  (a spot is "occupied" exactly when some reservation has `pickupSpot`
  set and `pickedUpAt` still null — no separate "spot" table needed, this
  derived check is enough, the same way `isIdle`/`activeReservations`
  already derive machine occupancy from reservation rows rather than a
  separate state table).
- Both actions get `logEvent` lines (`laundry_handed_off`,
  `laundry_pickup_acknowledged`), matching `docs/adr/0006`'s existing
  logging shape — this is exactly the kind of "who did what, including an
  action on someone else's behalf" event that logging infrastructure
  exists for.

**Notifying the original owner — reuses the existing `notice` mechanism,
with one schema change.** `notice`'s enum (`"moved_back" | "moved_up"`)
gains a third value, `"laundry_moved"` (another `drizzle-kit generate`
migration, or the same one as the `pickupSpot`/`pickedUpAt` columns if
done together — one migration per logical change is preferred, per how
crit 9/10's own migrations were kept one-concept-each, but this is a
small enough, clearly-related pair to combine if it reads more clearly
that way; decide at implementation time). `src/views.ts`'s existing
`notice === "moved_back"`/`"moved_up"` branches (two call sites, both
already found) gain a third branch rendering something like "Your
laundry was moved to Shelf A3 — collect it when you can," with an
acknowledge button posting to the new route above, reusing the exact
same notice-card visual treatment already used for the fairness-swap
notices (no new component).

**End-to-end flow, confirmed with the user across this conversation —
written out in full since it spans 3D scene, a 2D overlay, and the
server:**

1. In the 3D scene, a resident whose own reservation is the front
   `waiting` one on a machine, where that machine still shows someone
   else's `done`-but-not-`pickedUpAt` laundry, sees that machine
   highlighted as interactable (per 8.3's proximity-highlight) with
   something distinguishing this case from a normal free-machine
   interaction (e.g. a distinct icon/indicator above the machine, not
   just the same highlight every interactable object gets — exact visual
   treatment decided during implementation, flagged here so it isn't
   forgotten).
2. Interacting triggers `POST /machines/:id/handoff` immediately (no
   confirmation dialog needed before this step — the action is
   unambiguous and the only reasonable response to seeing this prompt,
   matching how claiming a machine from the 2D board is already a single
   action with no extra confirmation step). The character's basket-
   carrying visual state (8.4a) switches on — now carrying someone
   else's basket, distinguished from "your own basket" (8.4a) by a
   different prop colour or a small label, so a screenshot/observer can
   tell the two apart.
3. The resident walks (real WASD/joystick movement, no teleport, no
   skippable cutscene — confirmed with the user) to the drop-off area
   from 8.2.
4. Interacting with the drop-off area opens a 2D HTML overlay (same
   pattern as Stage 7.3's QR examine overlay — a 2D layer over the
   paused/dimmed 3D view, not a third input modality) showing: which
   spot was already assigned (the `handoff` call's response, held
   client-side since step 2 — the assignment already happened server-
   side at interaction time, not at this later confirmation moment; this
   overlay is a *result display + explicit confirm*, not a server call
   that happens now), and a single "Confirm placed" button.
5. Confirming closes the overlay, clears the character's "carrying
   someone else's basket" visual state, and updates the drop-off area's
   3D model to show that numbered spot as occupied (a small visible
   marker/colour change on that one spot, not the whole shelf) — driven
   by the same `/laundry/machines-state`-style refetch-on-SSE-event
   pattern Stage 2 already established, extended to cover the drop-off
   area's own state alongside machine state.
6. The original owner (any page — home page or 3D scene, whichever
   they're on) sees the new `notice` ("Your laundry was moved to Shelf
   A3") via the exact same mechanism the fairness-swap notice already
   uses, and acknowledges it via `POST /reservations/:id/
   acknowledge-pickup`, which frees the spot.

**Why no separate "spot number confirmation" step is needed before step
2's actual server call**: an earlier version of this plan (corrected mid-
conversation) assumed the resident would *choose* a spot via a dropdown
before the server acted. The user clarified the server should assign
automatically and the resident should simply *see* the result — this
removes an entire UI step (no form, no choice, no race condition to
guard against) and is simpler to build correctly, not a compromise.

#### Verify (Stage 8)

- A real model-loading smoke test: each GLTF loads without error, is
  visible at a reasonable scale/orientation (confirmed via screenshot,
  not just "no console error"), before building the rest of the room
  around it.
- Character movement/collision/animation: WASD and joystick both move
  the character (not the camera directly); the follow camera tracks
  correctly; the walk animation plays while moving and stops when
  stationary — confirmed via two screenshots a short movement apart,
  same verification shape Stage 1 already established.
- A full scripted run of the handoff flow against the real app (HTTP
  requests with managed cookies, `spec/support/`-style, likely a new
  `spec/laundry-handoff.test.ts`): room A reserves and finishes a wash
  (status reaches `done`); room B joins the same machine (front,
  `waiting`); room B calls `POST /machines/:id/handoff`, confirm it
  succeeds, returns a spot from the fixed list, and the spot isn't
  already occupied by another unacknowledged handoff; a second,
  different room attempting the same handoff (not holding the front
  reservation) gets rejected; room A's `/my-status` now shows the
  `laundry_moved` notice naming the right spot; room A calls
  `POST /reservations/:id/acknowledge-pickup`, confirm the spot is
  free again (a subsequent handoff for a different `done` reservation on
  a different machine can reuse it — test this explicitly, it's the one
  thing most likely to have an off-by-one or stale-read bug).
- Visual confirmation (Playwright screenshots) of: the new room layout
  (ceiling, lighting, sink/ironing/drop-off zones all visible, machines
  pulled off the wall with walkable space around them), the character
  model with its flat-colour material (not the untextured-caveat
  appearance), carrying-own-basket vs. carrying-someone-else's-basket
  states, the drop-off examine overlay showing an assigned spot, and the
  drop-off shelf's own numbered-spot-occupied visual state.
- `docs/adr/0013-laundry-handoff-authorization.md` (or next free number)
  documents the one real new decision: who may act on someone else's
  reservation, and why it's scoped exactly to "whoever's next in line for
  this machine," cross-referencing `docs/adr/0002`/`0004` the same way
  `docs/adr/0012` already does, and stating plainly this is a deliberate,
  narrow exception to `loadOwned`'s general rule, not a weakening of it.
- `src/queue.ts`'s existing exported functions (`join`, `claim`, `cancel`,
  etc.) remain unchanged in behaviour — the new handoff logic is new
  functions alongside them, not a modification of what already exists,
  keeping this plan's standing constraint intact even though this stage,
  unlike 1-7, does need genuinely new `queue.ts`-adjacent logic (the
  handoff authorization/spot-assignment rule has nowhere else sensible to
  live, being queue-state-dependent).

### Stage 9 — post-Stage-8 user feedback: two real problems found by actually using the build

Written after trying the Stage 8 build in a real browser (`pnpm dev`).
Two separate, unrelated problems were found. **Neither has a code fix
yet — this section records the investigation/design state so work can
resume cleanly in a future session; do not start implementing from this
section until the user explicitly says to.**

This section exists because of a real interruption worth recording: work
on both problems below was cut short mid-session when the course's
Claude Code proxy budget hit its hard weekly cap ($200/week, resets
Thursday 2026-11-05 09:00 Canberra time) and started rejecting API calls
outright. The user has asked the course convenor for a one-off bump via
Ed (per the course's own documented process for this). **If a future
session picks this up and still can't call the API, that's this same
budget wall, not a new problem — check whether the bump landed or wait
for the Thursday reset before assuming something is broken.**

#### 9.1 — the character disappears during movement (FIXED — see commit `f34d80a`)

**Status: fixed and merged into `main`.** Two independent causes, both
confirmed by direct runtime inspection, not guessed: (1) the `walk` clip's
`root.position` keyframe track fighting `characterRoot.position` for
control of the mesh's world position (fixed by stripping that one track
before creating the `AnimationAction`), and (2) a `SkinnedMesh`'s
bind-pose bounding sphere going stale once the skeleton animates, causing
three.js's frustum check to wrongly cull a character that's actually
on-screen (fixed by disabling `frustumCulled` on the character's meshes —
the standard handling for an animated `SkinnedMesh`, not a workaround).
Verified via a new, permanent `__laundryDebug._debugCharacter()` hook
(reads each mesh's real world position against `characterRoot.position` —
a nonzero gap is this exact bug recurring) across both a short (~1.5s)
and long (~5s) movement repro, with `pnpm check` green throughout. Full
root-cause writeup and the fix itself: commit `f34d80a` on this project's
git history. **The investigation notes below are kept as the historical
record of how the cause was actually found — useful context if something
in this area regresses, not a to-do list anymore.**

**Original symptom, confirmed by direct observation (Playwright +
screenshots against a real local dev server, not inferred):** the character model
(`/models/character.glb`) is visible in a screenshot taken immediately
after `/laundry` loads. In every screenshot taken even slightly after
simulated forward movement begins (via `window.__laundryDebug.pressKey("w")`),
the character model itself has vanished — only the floor shadow plane
remains visible. This happens from the very first frame of movement, not
gradually/at a distance.

**What's already confirmed, so the next session doesn't have to
re-derive it:**

- The character's *logical* position (`pos.x`/`pos.z`, and
  `characterRoot.position`, set each frame in the render loop's
  `characterRoot.position.set(pos.x, 0, pos.z)` line) updates correctly
  and smoothly — walked the character numerically from the south spawn
  point toward the north wall across several steps, values were sane
  throughout. **This rules out the movement/collision math
  (`clampToRoom`, `collidesAt`) as the cause** — whatever's wrong is a
  rendering/visibility problem, not a logic-produces-wrong-numbers
  problem.
- `window.__laundryGltfAnimations` (the clip-name list read off the
  loaded GLTF) returns the full real clip list (`static, idle, walk,
  sprint, jump, fall, crouch, sit, drive, die, pick-up, ...`), confirming
  the model file itself loads successfully and isn't corrupt.
  `window.__laundryBasket.isVisible()` also reports correctly (`false`
  on a fresh room with no reservation).
- A temporary inspection hook was drafted (not committed, reverted) that
  would read `characterRoot.children[0]`'s `.visible`, `.scale`,
  `.position`, a live `THREE.Box3` world bounding box, and each child
  mesh's `frustumCulled` flag — **this was never actually run before the
  budget wall hit**, so it's the concrete next step, not background
  research already done.

**Leading hypotheses to check first, in roughly the order a next session
should try them** (none confirmed yet — do not assume any of these is
the answer without actually checking, per the evidence-over-guessing
discipline this whole plan has followed):

1. **Stale cached bounding volumes after the material-override
   `traverse()` call** (`src/laundry-view.ts`'s `loadModel("/models/
   character.glb", ...)` callback replaces every mesh's material in a
   `traverse()`, but never calls `geometry.computeBoundingSphere()`/
   `computeBoundingBox()` afterward). Three.js's frustum-culling check
   uses each mesh's cached bounding sphere; if Kenney's export has an
   unusual or absent one, overriding the material doesn't invalidate it,
   and a culling check could wrongly exclude the mesh once the camera's
   relative position to it changes after the character starts moving
   (consistent with "visible at spawn, gone once the camera/character's
   relative geometry changes"). **Check**: log
   `mesh.geometry.boundingSphere` before and after the material
   override, and try setting `mesh.frustumCulled = false` on every child
   mesh as a diagnostic (not necessarily the final fix) to see if the
   model reappears during movement.
2. **The model is loaded twice via two different code paths that
   produce two different object graphs** — `loadModel("/models/
   character.glb", ...)` (adds the model to `characterRoot`, used for
   rendering) and a separate, direct `gltfLoader.load("/models/
   character.glb", ...)` call (used only to build the `AnimationMixer`
   and find `walk`/`idle` clips by name — see the comment in
   `src/laundry-view.ts` explaining this dual-load was deliberate,
   because `loadModel`'s shared-cache path only returns a *clone* of the
   scene, not the original `gltf.animations` array). **Check**: confirm
   whether `characterMixer` (built in the second load's callback,
   targeting `characterRoot.children[0]`) is actually driving the SAME
   object that's visible in the scene graph, or a different instance —
   if the two loads race and the mixer's `characterRoot.children[0]`
   reference is captured before the first load's model is actually
   added, it could end up animating something not in the scene, or (less
   likely but worth ruling out) the weight-blending logic could be
   driving a root-motion bone that collapses the whole rig's visible
   scale to zero once `walkAction`'s weight becomes nonzero.
3. **Camera near-plane/frustum interaction once the character is close
   to or behind the camera's actual render volume** — check
   `updateCamera()`'s `CAM_DISTANCE`/`CAM_HEIGHT` values and the
   camera's near/far planes (`new THREE.PerspectiveCamera(60, 1, 0.1,
   100)` — a 0.1 near plane is generous, making this less likely than
   hypothesis 1, but not yet ruled out).
4. **`characterRoot.visible` toggled somewhere unexpectedly** — a
   straightforward but worth-eliminating check: grep every assignment to
   `.visible` in the file and confirm none of them touch `characterRoot`
   or its children unintentionally.

**How to verify once a real cause is found**: re-run the exact Playwright
repro already used (load `/laundry`, screenshot immediately, simulate
`pressKey("w")` for ~1.5s via `__laundryDebug`, screenshot again) and
confirm the character is visible in the second screenshot too — this is
the same screenshot-based verification pattern every other stage in this
plan already uses, not a new verification approach to invent.

#### 9.2 — the room is too large, and the west-wall "public zone" needs to stop reading as a hangout spot

**Direct feedback from using the Stage 8 build, not a new feature
request**: the room built from the Stage 8.2 floor-plan sketch above is
too large relative to what a small residence laundry room should feel
like, and the drop-off/public area (the user's correction: explicitly
**not a sitting/socializing nook** — it exists purely to hold someone
else's finished laundry, and must read that way, not as a lounge corner)
needs a different footprint and placement than Stage 8.2 built.

**The user provided a real floor-plan reference image**
(`research/image.png` — not committed as of this writing, the user
placed it in `research/` directly) and confirmed, through several rounds
of the user correcting a sketched interpretation, the following **final,
confirmed layout** — this supersedes Stage 8.2's floor-plan sketch above
entirely for the next implementation pass:

```
                              -Z (north / far wall)
        ┌─────────────────────────────────────────────────────┐
        │  [W1][W2][W3][W4][W5]                          [D2] │
        │   (5 washers along the north wall)              [D1] │
        │                                                 [W8] │
        │                                                 [W7] │
-X      │                                                 [W6] │  +X
(west,  │            ┌──────────────┐                          │ (east,
 whole  │            │  sink + fold-│                          │  short
 wall = │            │  out ironing │                          │  wall:
 PUBLIC │            │  board,      │                          │  3 more
 ZONE — │            │  merged into │                          │  washers
 see    │            │  one free-   │                          │  + 2
 below) │            │  standing    │                          │  dryers,
        │            │  island,     │                          │  same
        │            │  centered in │                          │  wall,
        │            │  the east    │                          │  one
        │            │  floor area  │                          │  continuous
        │            │  (not        │                          │  run)
        │            │  against any │                          │
        │            │  wall)       │                          │
        │                                                      │
        │              (entry / player spawn,                   │
        │               centered on this wall)                  │
        └─────────────────────────────────────────────────────┘
                              +Z (south / entrance wall)
```

- **Machines, confirmed exact split (replaces 8.2's single-wall-of-10
  layout)**: **5 washers along the whole north wall**, then **3 washers +
  2 dryers along the whole east wall** (one continuous run on that wall,
  not grouped by type the way 8.2's single-wall layout grouped them) —
  totals 8 washers + 2 dryers, matching the real seeded machine count
  exactly (confirmed against `src/db.ts`'s seed data before writing this
  — this is not a new count invented for the room, it has to keep
  matching whatever the server actually returns, the same "computed from
  the real {id, label, type} list, never hardcoded to a specific number"
  principle `src/laundry-view.ts`'s own top-of-file comment already
  states).
- **The whole west wall is the public/drop-off zone** — not a corner
  zone sized like the sink (Stage 8.2's mistake, per the user's own
  "how's this supposed to fit clothes" complaint). It needs to actually
  be sized like a real shelving/table unit a person could set a laundry
  basket's worth of clothes on, spanning a meaningful fraction of the
  wall, not a small table-sized prop.
- **Explicit requirement: large, legible text labeling** on or above the
  drop-off zone (e.g. floating 3D text or a sprite/canvas-texture label —
  exact technique TBD at implementation time, but it must be readable at
  a normal approach distance, not a tiny sign) — the user was explicit
  that the current build has no textual indication this zone is the
  drop-off area at all, only the numbered spot-occupancy colour markers
  Stage 8.4 already built. This is additive to 8.4's existing
  `dropoffSpotMeshes` colour-marker system, not a replacement for it.
- **Sink + ironing table merge into one free-standing "island"** in the
  open floor area on the east side, **not against any wall** — matches
  the reference image's own "central island" treatment exactly (the
  reference shows a kitchen-style island with a sink and a pull-out
  ironing board built into one counter unit). This replaces Stage 8.2's
  separate west-wall sink + west-wall ironing-table placement entirely.
- **Explicitly ruled out, so it isn't re-proposed**: keeping the public
  zone as a small table matching the sink's footprint (Stage 8.2's actual
  built result) — rejected by the user as not large enough to plausibly
  hold laundry. A sitting/lounge treatment for the public zone (the
  reference image's own west-side "multi-purpose public/living zone"
  with a table and bench, meant for sitting and working) was also
  explicitly ruled out by the user: "按我们说的，这个位置是用来放衣服的，而不是聚会"
  (this spot is for *putting down laundry*, not socializing) — the
  reference image's architectural layout (zone position, room
  proportions, clean labeled-zone visual clarity) is worth learning from;
  its specific *furniture choice* for that one zone (a social table +
  bench) is not, and must not be ported over along with the rest of the
  layout.
- **Room size**: the user asked for significantly smaller than Stage
  8.2's built result ("目前的一半以内宽度" — within half the current
  width) — exact new dimensions aren't pinned down yet (TBD at
  implementation time, computed the same data-driven way Stage 8.2's own
  constants were, not hardcoded), but the controlling idea is: a believable
  small-residence laundry room, not a room sized to comfortably fit four
  separate zones with generous walking space around each, which is what
  Stage 8.2 actually produced.
#### 9.2 implementation plan (written before any layout code, confirmed with the user)

This replaces the "not yet decided" placeholder above — every open
question there is now resolved. Scope is `src/laundry-view.ts` only
(layout constants, collision boxes, and the new drop-off-zone build
block); nothing here touches `src/queue.ts`, `src/pickup-spots.ts`,
realtime/SSE wiring, movement/camera code, or the examine/QR interaction
logic — all of that is reused exactly as Stage 8 built it, per this
file's own "What I check after this stage" section below.

**1. Machine split, data-driven (replaces the single-wall layout
entirely).** Not hardcoded to "5 north, 3+2 east" — computed from
whatever `{id, label, type}` list the server actually returns, the same
principle the file's own top-of-file comment already states:

```
var dryers = machines.filter(isDryer);
var washers = machines.filter(not isDryer);
var eastSlotCount = Math.round(machines.length / 2);
var eastDryerCount = Math.min(dryers.length, eastSlotCount);
var eastWasherCount = eastSlotCount - eastDryerCount;
// east wall gets eastWasherCount washers + eastDryerCount dryers (dryers last, closest to the corner)
// north wall gets the remaining washers
```

Against the real seeded data (8 washers, 2 dryers) this resolves to north
wall = 5 washers, east wall = 3 washers + 2 dryers — exactly the
confirmed split — but the formula holds if the seed data ever changes,
rather than silently drifting out of sync with it the way a hardcoded 5/3
split would.

**2. East-wall machines need a real orientation fix, not just a position
change.** `machinePositionFor` currently only ever returns `facing:
Math.PI` (every machine on one wall, facing the same way). East-wall
machines face **west** (into the room) instead, and `addCollisionBox(cx,
cz, w, d)` is axis-aligned in world space — a machine rotated 90° has its
local `w`/`d` swapped in world X/Z. **The specific risk this plan writes
down in advance, per `CLAUDE.md`'s "name the failure mode" rule**: if the
east-wall branch reuses `footprint.w`/`footprint.d` unswapped when calling
`addCollisionBox`, the collision box is built the wrong shape — not
visibly wrong in a static screenshot (the box is invisible), only wrong
once someone actually walks along the east wall and either clips through
a machine or hits a wall of invisible collision several units from the
model. This is exactly the kind of bug `CLAUDE.md`'s planning rule exists
to catch on paper, not by shipping and hoping a screenshot happens to
include that angle. Fix: `addCollisionBox` for an east-wall machine gets
`(footprint.d, footprint.w)` — swapped — not `(footprint.w,
footprint.d)`. The exact rotation sign (`+Math.PI/2` vs. `-Math.PI/2`)
will be picked by the same trial-and-screenshot method every other
facing/orientation constant in this file was tuned by (`MODEL_BBOX`,
`QR_SIZE`, the status-light post) — written down here as a known
to-verify step, not pre-computed and assumed correct.

**3. Drop-off zone: real sourced shelving models, not a `table.glb`
reuse.** Confirmed via `poly.pizza`'s bundle listing for Kenney's
Furniture Kit (the same pack `SOURCES.md` already cites): the pack
includes **"Bookcase Open"**, **"Bookcase Open Low"**, and **"Bookcase
Closed"** models, CC0, real named entries in the bundle — not a
substitution. "Bookcase Open" (no doors, open shelving) is the closest
match to the reference image's floor-to-ceiling open-shelf unit and to
what this zone actually needs to show (clothes sitting visibly on a
shelf, at a glance, from across the room). This needs **new asset work**,
same shape as Stage 8.1's own model sourcing:
   - Download the itch.io GLB pack (`SOURCES.md`'s existing source), find
     the actual bookcase file name inside it (the itch.io page doesn't
     list individual file names, so this has to be confirmed by unzipping
     and looking, not assumed from the poly.pizza listing's own name
     string), and add it to `public/models/` with a `SOURCES.md` entry
     matching the existing per-model entries' format.
   - Verify it in an isolated preview exactly the way Stage 8.1 did before
     building the room around it (one `GLTFLoader.load()`, one
     screenshot) — confirm it reads as "a shelving unit you could set a
     laundry basket on," not something that turns out tiny, oddly
     textured, or closed-door once actually opened.
   - Measure its real bbox the `footprintOf`/`MODEL_BBOX` way (this file's
     own documented lesson: a guessed footprint silently misplaces things
     that look fine numerically but are invisible or wrong in a real
     screenshot) before placing the 6 pickup-spot markers on/in it.
   - Place **2-3 instances side by side** spanning a meaningful fraction
     of the west wall (matching the user's explicit rejection of a
     single small table-sized footprint) — not one scaled-up instance,
     which risks a visibly wrong aspect ratio (thin legs stretched to
     cover a wide span) the way a single enlarged `table.glb` would.
   - `dropoffSpotMeshes`'s existing recolour-on-occupancy logic
     (`SPOT_FREE_COLOR`/`SPOT_OCCUPIED_COLOR`) is unchanged — only the
     6 markers' `(x, z)` placement moves onto the new shelving geometry's
     real measured surface height(s), not the old single-table's `topY`.

**4. Drop-off text label: a billboard sprite, not 3D geometry.** A
`THREE.Sprite` with a `THREE.CanvasTexture` (text drawn onto an offscreen
`<canvas>`, used as the sprite's map) — a sprite always faces the camera
regardless of approach angle, which a flat plane of 3D text would not
without extra per-frame billboarding code. This needs zero new
dependencies (no font-loading library, matching `docs/adr/0003`'s no-build-
step constraint) and is a well-established three.js pattern, not a novel
technique. Text: **"DROP-OFF"** (confirmed with the user; kept short and
legible rather than a full sentence, matching this app's existing habit
of short, plain UI copy over explanatory paragraphs). Mounted above the
shelving units, large enough to read at the room's new, smaller approach
distance — tuned by screenshot, same as every other size constant in this
file.

**5. Sink + ironing table merge into one free-standing island.**
`sinkZ`/`ironZ` (currently two separate west-wall positions) are replaced
by one group positioned in open floor space (not against any wall),
holding both the existing `kitchenSink.glb` and `table.glb` (+ the
existing box "iron" prop) placed adjacent to each other inside that one
group — reusing both models and both already-tuned collision footprints
(sink 0.5×0.5, table 0.85×0.45) exactly as measured in Stage 8.2, just
recombined under one group transform instead of two independent world
positions.

**6. Room size.** `roomHalfWidth`/`roomHalfDepth` stay computed from
content (not hardcoded), but the inputs change: with both long walls now
carrying machines (5 on north, 5 on east — tighter than one wall carrying
all 10), the natural `rowWidth`-driven half-width comes out close to half
of Stage 8.2's built result on its own, which is what "within half the
current width" asked for — not a separate arbitrary shrink factor bolted
on afterward. Exact aisle/margin constants (`AISLE_DEPTH`, `WALL_MARGIN`,
the island's own clearance from the walls) are tuned by the same
screenshot method as every other constant here, not pre-computed.

**7. Ceiling lamps.** The existing `lampRowZ` grid is built for a
one-long-wall layout (two rows along Z only). The new near-square room
with machines on two different walls needs a general room-covering grid
(rows along both X and Z, or a simple N×M grid sized to
`roomHalfWidth`/`roomHalfDepth` directly) rather than a layout tied to
one wall's width.

**Verification approach once implemented**: the same Playwright
screenshot-overview pattern Stage 8.2 already used
(`laundry-stage8-overview-desktop.png`-style wide shots plus close-up
shots of the drop-off zone specifically), explicitly re-checked against
this section's requirements (room reads as smaller, drop-off zone reads
as large/obviously-for-laundry with visible text, island is free-standing
and centered, machine counts/positions match the confirmed split above,
east-wall collision is walked along and confirmed not to clip or
phantom-block) — not just "does it still run."

#### 9.2 built and verified

Implemented per the plan above, with one asset substitution and one real
bug found during verification — both real-world fit details worth
recording, not silent deviations.

- **`bookcaseOpen.glb` sourced for real**: downloaded the actual itch.io
  GLB pack (the free "name your own price, $0 is fine" flow needed a real
  Playwright-driven download — the page's own download-token endpoint
  expects a browser session, not a bare `curl`), confirmed CC0 by the
  pack's own bundled license text, and measured its real bbox the
  `footprintOf`/`MODEL_BBOX` way before placing anything: min `(0, 0,
  -0.25)`, max `(0.4, 0.88, 0)`. `public/models/SOURCES.md` records the
  exact source and the sibling variants not used.
- **Machine-count formula confirmed against the real seed data**: north
  wall = 5 washers, east wall = 3 washers + 2 dryers, exactly as planned.
- **Room size confirmed by the actual numbers, not just the arithmetic
  sketch above**: `roomHalfWidth` came out to 4.7 (full width 9.4) against
  Stage 8.2's own built 19.4 — almost exactly half, matching "within half
  the current width." Depth stayed close to Stage 8.2's own, as predicted
  (the request was specifically about width).
- **East-wall collision-box axis swap confirmed correct** by walking a
  real (non-teleported) path into both a washer on the east wall and the
  west-wall bookcases (whose 0.4x0.25 footprint, unlike a washer's
  near-square one, actually exercises the swap) — both stop cleanly at
  the model's edge, no clipping, no phantom block short of the model.
- **A real bug this stage's own verification found and fixed**: rewriting
  the drop-off zone from one `dropoffGroup` into three separate bookcase
  groups left `ensureRingFor()` (the proximity-highlight-ring code, called
  every frame via `setHighlight()`) still referencing the now-deleted
  `dropoffGroup` variable. Walking near the drop-off zone threw an
  uncaught `ReferenceError` inside the `requestAnimationFrame` callback —
  since nothing catches it, the callback never reschedules its own next
  frame, so the *entire render loop silently stops forever* the instant
  anyone gets close enough to the drop-off zone to trigger a highlight.
  This produced a symptom indistinguishable from "the character doesn't
  move" (position state was still updating under the hood; nothing was
  redrawn to show it) — worth noting as a *class* of bug (an uncaught
  exception inside `requestAnimationFrame` silently kills the whole render
  loop) even though it isn't the same bug Stage 9.3 investigated: this
  one only exists because today's own Stage 9.2 rewrite deleted
  `dropoffGroup`, so it can't explain the user's original Stage 8 report,
  which predates this change entirely. Fixed by
  reading `dropoffAnchor.position` directly (a real scene child with its
  own position) instead of a group that no longer exists as one object.
  **Caught by**: walking a real (non-teleported) path toward the
  drop-off zone with a `page.on("pageerror", ...)` listener attached —
  not by the typecheck (a dynamically-scoped `var` reference inside a
  template-string client script is invisible to `tsc`), and not by any
  single-point `teleportTo()` test run in isolation (those never
  triggered `setHighlight()`'s "newly in range" code path from outside
  the zone). **Lesson for future verification of this file**: a batch of
  `teleportTo()`-based point tests run back-to-back can produce confusing,
  seemingly-contradictory "stuck" results for two unrelated reasons — (1)
  teleporting a point *inside* a collision box's padded bounds (the box
  already includes `PLAYER_RADIUS`) looks identical to "collision is
  broken," when real walking from outside would simply never reach that
  point to begin with; (2) if an earlier point in the same browser session
  already crashed the render loop, every later point in that same
  `page` session will also read as "stuck," regardless of whether that
  specific point has any real problem — always re-run a suspicious result
  in a fresh `page`/fresh navigation before concluding it's real.

### Stage 9.3 (debug, deferred to a future session) — the character doesn't visibly move, and the first frame looks like a wall of fog

**Explicitly deferred.** The user's own direction for this session was to
spend it on Stage 9.2's layout, not open-ended debugging; this section
records real evidence from a short investigation so the next session
doesn't start from zero, not a finished diagnosis — **do not assume
either root cause below without re-confirming it first.**

**Symptom 1, user-reported: "the character is still stuck in the middle
of the room and doesn't move."**

Real evidence gathered this session, against the Stage 8 build running
locally (scratch port 8095, a throwaway scratch database, both cleaned up
afterward): dispatching a genuine `page.keyboard.down("KeyW")` (not the
`window.__laundryDebug.pressKey()` test hook) for ~2 seconds moved
`pos.z` from `3.9` to `-0.43` to `-0.52` across two separate runs — **the
underlying position state does change**, both with and without first
clicking the canvas to focus it. This means the bug is not "keyboard
input is ignored." The likely real bug is downstream of that: either the
character mesh isn't visually tracking `characterRoot.position` on
screen (a rendering/camera problem, the same family as the already-fixed
Stage 9.1 bug, but not confirmed to be the same cause), or whatever the
user actually saw was a different interaction path than a plain
"load the page and press W" — e.g. pointer lock's own `NotAllowedError`
(seen in every automated run here too, expected per Stage 7.2's own
"best-effort" design) leaving some input-handling state stuck. **Next
session's concrete next step**: repeat this exact repro in a real browser
(not Playwright) while watching the canvas, and/or extend
`_debugCharacter()`'s live comparison of `characterRoot.position` against
each mesh's actual world position across several seconds of continuous
movement, the same method that found Stage 9.1's two causes — don't
guess past this point without that comparison.

**Symptom 2, user's hypothesis: "possibly because the ceiling is too low,
the view clips through it the moment the scene loads."**

Real evidence gathered this session: the very first rendered frame after
navigating to `/laundry` (captured at `page.waitForTimeout(0)`, i.e. as
early as a screenshot can be taken) shows a **plain, textureless beige
gradient filling the whole canvas — no walls, no machines, no ceiling
geometry at all**, with the on-screen crosshair the only visible UI
element. This is consistent with the scene's GLTF models
(`loadModel()`'s async `gltfLoader.load()` calls — walls are actually
plain `BoxGeometry`/`PlaneGeometry` built synchronously, but the lamps,
drop-off table, and machines/sink/ironing table are all async-loaded
GLTFs) simply not having loaded/attached yet at that exact first frame,
combined with the scene's own `fog` and ambient lighting producing a
flat, hazy, undifferentiated colour that could easily be *mistaken* for
"the camera is embedded inside a low ceiling," without actually being
that. **This was not conclusively distinguished from a real
low-ceiling/spawn-point clipping bug in this session** — only the "first
frame is visually blank" fact is confirmed; whether that blankness is
"nothing has loaded yet" (a harmless, brief loading-order artifact) or
"the camera's actual steady-state position clips geometry" is still
open. **Next session's concrete next step**: use `_debugScene()`'s
`cameraPos` alongside a direct read of `wallHeight`/the character's spawn
`CAM_HEIGHT` to check numerically whether the resting camera position
ever sits inside/above the ceiling plane, *and* separately confirm via a
screenshot taken a full 2+ seconds after load (once every model has had
time to load) whether the "wall of fog" symptom persists once geometry
is actually in the scene — if it clears up once models load, this was
model-loading order, not a ceiling-height bug, and Stage 9.2's own new,
smaller room dimensions are a reasonable moment to re-check this fresh
rather than chasing it against the soon-to-be-replaced Stage 8.2
geometry.

**Scope note**: both symptoms are investigate-and-fix work against
Stage 8's existing movement/camera code, explicitly out of Stage 9.2's
own scope (Stage 9.2 is layout-constants-only, per that section's own
"nothing here touches... movement/camera code" line). Fixing either one
is real work for a dedicated stage of its own, not a drive-by fix bundled
into the layout commit.

**Re-investigated in a later session (after Stage 9.5): still not
resolved — only ruled one explanation out, not confirmed a fix.** The
user reported, again, after a hard refresh: the character stays fixed at
the center of the screen while walking; a red "basket" prop (Stage 8.4's
`basketMesh`, `BASKET_OWN_COLOR = 0xb5402a`) appeared to move relative to
the camera while the character itself didn't move relative to the room.

A first pass wrongly concluded this was just the normal third-person
follow-camera effect (the character staying near-centered on screen while
the room moves around it, since the camera offset tracks the character 1:1)
— that conclusion was reached by running `window.__laundryDebug` checks
directly against the user's own live `pnpm dev` server on port 8080,
**a violation of this file's own port-discipline rule** (scratch
verification must never touch 8080) and of CLAUDE.md's test-harness
rules, and it never actually reproduced the reported symptom (a
disconnect between the character and the basket) — it only confirmed
that `characterRoot.position` and the camera both change together, which
is consistent with either the normal design *or* a real bug, so it
proved nothing about which one is happening. A second pass, correctly
run against an isolated scratch server (port 8097, its own throwaway
database), confirmed `characterRoot.position` and the character model's
own live world bounding box move together frame-to-frame under a real
keyboard-driven walk — i.e. the local player's own primary character is
internally consistent. It did **not** reproduce the user's reported
basket/character disconnect, and did not investigate `basketMesh`'s own
position relative to `characterRoot` under real play conditions (only
confirmed `BASKET_OWN_COLOR`'s hex value matches a sampled pixel from the
user's screenshot, which only identifies *what* the red object is, not
*why* it appeared detached).

**Next session's concrete next steps, more specific than the original
two above:**
- Reproduce with the mouse drag-to-look active at the same time as WASD
  movement (Stage 9.4 changed the look scheme since this section was
  first written; the original investigation never tested look+move
  together, only keyboard alone).
- If `basketVisible` was `true` at the time of the user's screenshot,
  check whether `setBasketVisible`/`setBasketKind` ever runs *before*
  `characterRoot.add(basketMesh)` has executed (the `loadModel()`
  sync-if-cached/async-if-not hazard already found once this project,
  in `plans/laundry-presence.md`'s Stage 2 `entry`-ordering bug) — a
  basket mesh added to the wrong parent, or added twice, would explain a
  prop that doesn't track the character.
- Confirm reproduction happens on a true fresh load (not a stale tab) —
  the user's first report in this round turned out to be exactly that,
  so this needs ruling out again before trusting any new result as real.
- Never debug this again against port 8080; use a scratch port ≥8090 and
  a throwaway database, per this file's and CLAUDE.md's own existing
  rules — restated here because it was violated once already investigating
  this exact issue.

**The basket-visibility bullet above was confirmed, in a third pass, as
a real bug — though not the user's original character-stuck symptom.**
Correctly isolated this time (scratch port 8098, a fresh throwaway
database, a real reservation created server-side, `page.evaluate` reads
only taken after `refetchMachineState()`'s own fetch had resolved — the
earlier pass's "basket mesh visible: false" reading briefly looked like
confirmation, but turned out to be the test script's own read racing
ahead of the fetch, not the product bug itself; re-run with a longer wait
showed `window.__laundryBasket.isVisible()` correctly read `true`). The
real, reproducible bug is narrower than that first signal suggested:

`character.glb` (the local player's own model) is genuinely
network-loaded exactly once, asynchronously, the *first* time anything on
the page calls `loadModel("/models/character.glb", ...)` — which is this
character, at line ~606, not a remote character (those always run after,
once this load has already populated `modelCache`). `basketMesh` is only
ever constructed *inside that same async callback*
(`basketMesh = buildBasket(); ...; characterRoot.add(basketMesh);`).
Meanwhile `refetchMachineState()` — which can set `basketVisible = true`
via the server's `myBasketVisible` flag — is called immediately on page
load (line 1077), with no dependency on the character model having
finished loading first. `setBasketVisible(visible)` stores the
`visible` flag into the module-level `basketVisible` variable
unconditionally, but only writes it onto the real mesh's own
`.visible` property `if (basketMesh)` — guarding against exactly the
window where `basketMesh` is still `null`. If a resident's own basket is
already supposed to be visible (an active or done-unacknowledged
reservation) at the moment this race resolves unfavourably — the fetch
resolving before the character model finishes loading — the real
`THREE.Mesh`'s `.visible` is left at its construction-time default
(`false`, set explicitly right after `buildBasket()`), and **nothing
ever revisits it afterward** unless some *other* event happens to call
`refetchMachineState()` again later (an SSE `changed`/`machine-N` event,
or the handoff-confirm path at line 1349) — at which point `basketMesh`
now exists, and the correct value is applied retroactively. This was
confirmed directly: a scene-graph walk (finding `characterRoot` via
`machineGroups[1].parent`, then its own non-model child) showed the real
mesh's `.visible === false` while `window.__laundryBasket.isVisible()` —
reading the *state* variable, not the mesh — correctly returned `true`,
on a page where the race had resolved unfavourably on that particular
run (not reproducible every time, consistent with a race rather than a
deterministic bug — timing against a real network-loaded GLTF varies
run to run).

**This is the identical bug *shape* `plans/laundry-presence.md`'s Stage 2
`entry`-ordering bug already found once** (closing over/depending on an
object that `loadModel()`'s async-if-not-cached path hasn't created yet)
— a different variable, same root cause, the second time this exact
hazard has bitten this file. Worth a standing rule, not just a second
patch: anything that needs to act on `basketMesh` (or any other
object only created inside a `loadModel()` callback) must check for its
existence lazily at the moment it's *read*, not trust that setting a
flag once is enough — because the flag can be set before the mesh
exists, with nothing structurally guaranteeing a second write ever
happens.

**Fix** (Stage 9.6, below): make `setBasketVisible`/`setBasketKind`
re-apply themselves once the mesh is actually constructed, instead of
silently dropping the value when `basketMesh` is still `null`.

**Still not investigated**: the user's original symptom (the character
staying fixed relative to the room, not just centered on screen) remains
unreproduced. This basket race is a real, independently-confirmed bug,
but nothing above explains a *position* desync — only a *visibility*
one. The next session should treat these as two separate hypotheses
until one is actually confirmed against the user's own exact repro
steps (mouse-drag + WASD together, on a true fresh load).

### Stage 9.6 — fix: basket visibility can be set before the basket mesh exists

**Design.** `setBasketVisible`/`setBasketKind` both early-return (via
`if (basketMesh)`) when the character model hasn't finished loading yet,
silently dropping whatever value was requested. The fix: keep requesting
the *latest* value even when the mesh doesn't exist yet, and apply it the
moment the mesh is constructed — not a queue of pending calls (only the
*last* requested state actually matters, since `basketVisible`/
`basketKind` already are "last write wins" module-level variables), just
reading them once right after `characterRoot.add(basketMesh)` runs:

```js
basketMesh = buildBasket();
basketMesh.visible = basketVisible; // apply whatever was already requested, not a hardcoded false
basketMesh.material.color.setHex(basketKind === "other" ? BASKET_OTHER_COLOR : BASKET_OWN_COLOR);
characterRoot.add(basketMesh);
```

This removes the window entirely: whichever of "the model finishes
loading" or "the first `refetchMachineState()` resolves" happens first,
the final state is always correct, because the mesh is initialized from
the already-known `basketVisible`/`basketKind` values instead of a
hardcoded default that only a second, later event might ever correct.

**Verify**: reproduce the exact race from this session's own repro (a
fresh identity, a real reservation created before the first `/laundry`
load, a scratch server/database, port ≥8090) across several repeated
runs — the race is timing-dependent, so one passing run isn't enough;
confirm the scene-graph-walk check (`characterRoot`'s non-model child's
own `.visible`) matches `window.__laundryBasket.isVisible()` on every
run, not just most. `pnpm check` green; `git diff --stat` shows only
`src/laundry-view.ts` changed.

#### Stage 9.6 built and verified

Implemented exactly as designed: `basketMesh.visible`/`.material.color`
are now initialized from the already-known `basketVisible`/`basketKind`
variables at the moment the mesh is constructed, instead of a hardcoded
`false`. Verified against a fresh scratch server (port 8099, a throwaway
database) across 6 repeated runs, each with a distinct identity and
machine — a real reservation created server-side immediately before
navigating to `/laundry` (no artificial delay, to maximize the chance the
model-load and state-fetch races actually overlap the way a real user's
page load would), then a scene-graph walk confirming the real mesh's own
`.visible` matches `window.__laundryBasket.isVisible()`'s state-flag
reading. All 6 runs matched (`true`/`true`); before the fix, this same
repro had shown a real `false`/`true` mismatch on at least one run.
`pnpm check` green (39 tests) against a clean database (the verification
script's own repeated reservations had briefly broken `spec/offer.test.ts`
against the scratch server they ran on, by occupying every machine — not
a product regression, just that server's own state needing a fresh
database to re-check against); `tsc --noEmit` clean; only
`src/laundry-view.ts` changed.

The user's original symptom from this investigation (the character's own
position staying fixed relative to the room) remains **unconfirmed and
unfixed** — this stage only closes the basket-visibility race that
surfaced during the same investigation, a different, now-confirmed bug.
See the "Re-investigated in a later session" note above Stage 9.4 for
what's still open.

### Stage 9.4 — look interaction, machine detail diagnosis, a real indicator light, and an intentionally oversized interactable

Written after the user tried the Stage 9.2 build and raised four
questions about feel/visual polish. Each is investigated before any code
changes below, per this plan's own evidence-over-guessing discipline.

**9.4.1 — look control: drag-to-look, not move-to-look.** Confirmed by
reading the code: the current scheme is real pointer lock (`requestLock()`
calling `renderer.domElement.requestPointerLock()`, a `pointerlockchange`
listener, raw `mousemove` driving yaw/pitch whenever the lock is active) —
a first-person-shooter convention, not the "hold the mouse button down to
orbit, release to stop, cursor always visible" convention a 3D modelling
tool like SketchUp uses. The touch path (`lookZone`'s `touchstart`/
`touchmove`/`touchend`) is already drag-based, so desktop is the one
being brought in line with what touch already does, not a brand-new
interaction being invented.

**Change**: remove pointer lock entirely — `requestLock()`,
`requestPointerLock()`, the `pointerlockchange` listener, the
`laundry-lock-hint` element's visibility logic (the hint text and
element can go too, since "press ESC to exit look mode" stops being true)
— and replace the `document`-level raw `mousemove` listener with a
`mousedown`/`mousemove`/`mouseup` pair scoped to `renderer.domElement`:
`mousedown` records the starting cursor position and sets a `dragging`
flag; `mousemove` only updates yaw/pitch while `dragging` is true, using
the delta since the last move (not `movementX`/`movementY`, which are a
pointer-lock-specific API — a plain mouse's `clientX`/`clientY` delta
works without lock); `mouseup` (and `mouseleave`, so dragging doesn't get
stuck on if the cursor leaves the canvas mid-drag) clears the flag.

**The one real interaction conflict this change creates, thought through
before coding**: `renderer.domElement`'s existing `click` listener is
what fires `handleInteract()` (open a machine's QR, trigger a handoff,
etc.) — `click` fires after `mouseup` whenever `mousedown` and `mouseup`
land on the same element, which includes the end of an intentional
look-drag. Without a fix, every look-drag would also fire an unwanted
interact action the instant the mouse is released. **Fix**: track the
total cursor movement between the drag's `mousedown` and `mouseup`
(Euclidean pixel distance); in the `click` handler, skip
`handleInteract()` if that distance exceeded a small threshold (a
handful of pixels — enough to absorb natural hand jitter on a deliberate
click, not so much that a real look-drag could pass as a click). This is
the same "was this a click or a drag" distinction every drag-to-pan map
UI already has to solve, not a novel problem — no library needed for a
handful of lines.
**Also remove**: the `renderer.domElement.addEventListener("click",
requestLock)` fallback line (there's nothing left to lock), and
`hideExamineOverlay()`'s own `requestLock()` call (closing the examine
overlay no longer needs to re-acquire anything).
**Unaffected**: `yaw`/`pitch` state, `updateCamera()`, `clampToRoom`,
touch controls, and every other piece of camera math — only *how yaw/
pitch get updated from desktop mouse input* changes, not what they mean
or what consumes them.

**9.4.2 — why the washers look like they have different detail levels.**
Investigated directly, not guessed: extracted `washer.glb` into an
isolated preview scene (the same throwaway-preview method Stage 8.1 used
for every model before trusting it) and confirmed **every washer is the
exact same model** — one GLTF file, loaded once through the existing
`modelCache`, `clone()`d for every placement, 6 real meshes / 6 real
materials including a `glass` material for the door. A clean, well-lit,
head-on screenshot of this single file shows a full circular door, a
handle notch, and a two-slot control panel — identical detail on every
instance, confirmed by also inspecting the north-wall and east-wall
instances directly in the running room. **There is no model-detail bug.**
The visual impression of "some look plainer" is a rendering/perception
effect of the room's own tuned-down lighting (deliberately subtle
ambient+hemisphere, per this stage's own "three additive light sources
compound fast" lesson above) combined with viewing distance/angle and
`scene.fog` — a curved door reads as a flat rectangle once its shading
gradient gets compressed by distance, fog, and flat ambient light. Also
relevant to 9.4.3 below: the status-light post currently sits right in
front of this same door, which can visually compete with it.
**No model/asset change needed for this item** — see 9.4.3 for the
actual fix being made (a stronger light source directly on/near the
door reads as "more detail," without touching the model file at all),
and 9.4.4 for the complementary fix (making the machine itself bigger,
which is a far more direct answer to "I can't make out the detail" than
re-lighting alone).

**9.4.3 — the status light and the unclaimed-laundry ring: what they are,
and a more elegant design.** For the record (the user asked what these
even are): the free-standing post + coloured sphere is `statusLights`
(every machine's live free/claimed/running/your-turn/waiting state,
matching the 2D board's own colour key exactly — this is load-bearing
information, not decoration); the floating gold ring above a machine is
`unclaimedMarkers` (Stage 8.4's "this machine still has someone's
finished laundry sitting in it" flag, visible to everyone so a passerby
can see a handoff opportunity). Both are confirmed real, both are
currently the simplest possible placeholder shape (a sphere on a stalk;
a floating torus) — exactly the kind of "wire it up first, make it look
good later" debt this plan has accumulated elsewhere too.

**Confirmed correct per the user's own read of the model**: `washer.glb`'s
front face is not entirely door — the measured bbox is a rectangle, but
the door itself only occupies the lower-center two-thirds or so, leaving
a real flat strip across the top (the control-panel area, already
slotted in the model) and flat corners to either side of the door at
any height. A corner of the front face, away from the door's own raised
panel, is a real, flat, unobstructed mounting surface — the exact
"the previous attempt got wedged against the door's proud panel" failure
mode from Stage 8.2's own post-mortem (quoted in this file above) doesn't
apply to a *side* corner, only to a *center* mount close to the door.

**Change**: replace the stalk-mounted sphere with a small flush-mounted
disc (a slightly flattened cylinder or a `PlaneGeometry` with a circular
alpha-masked material — a flat disc reads as "an indicator light on a
panel" more than a sphere does, which reads as "a ball on a stick") at
the **top corner of the front face farthest from the door's own
geometry** — concretely, at local `(footprint.w * 0.85, footprint.h *
0.9, footprint.frontZ + small clearance)`, i.e. high and to one side,
inside the flat control-panel strip rather than anywhere near the door's
own raised panel. `postHeight`/`post`/`postZ` and the free-standing
cylinder mesh are removed entirely — the disc mounts with a tiny
clearance offset from `footprint.frontZ` directly (a few millimetres,
not the 0.25-unit stand-off the old stalk needed, since this position
was chosen specifically to avoid the door geometry the old center mount
kept colliding with). **This must be verified by screenshot before
trusting the numbers above** — this plan's own repeated lesson (the
original post-mounted light exists *because* an earlier flush attempt at
a different position failed silently) means "looks right on paper" does
not get skipped past a real render check this time either.
**Unclaimed-laundry ring**: kept as a ring (a correct, established
convention — "a status ring above an object" is a readable game-UI
pattern), but re-sized/re-positioned relative to `footprint.h` directly
once the new indicator-light position is settled, so the two don't
visually collide once the light moves from "off to the side on a stalk"
to "flush on the front face." Not merged into a door-material glow (the
alternative discussed and rejected): the user's own objection — a real
appliance's door does not change colour to signal status, so recolouring
it would read as *less* realistic, not more, even though it would have
been the smaller code change.

**9.4.4 — deliberately oversized machines, Kenney-asset-package style.**
The user's own framing — many open-world/sim games deliberately render
a key interactable larger than strict human-scale proportion would
suggest, specifically so a player can read its state/detail at a
glance, trading literal realism for legibility. Checked for feasibility
before committing to it, not assumed safe:

- **Floor-space impact: negligible.** `SPACING` (1.6 units between
  machine centers) was sized for the *old* ~0.39-wide model; even at a
  generous 1.8x scale (a washer becoming ~0.70 wide, ~0.85 tall), two
  adjacent machines' footprints (each ~0.70 wide, centered 1.6 apart)
  leave roughly 0.9 units of clear gap between their outer edges — ample
  room for both the character's own collision radius (`PLAYER_RADIUS =
  0.3`, i.e. a 0.6-wide character) and comfortable walking clearance.
  **No `SPACING`/room-size change needed** — Stage 9.2's own halved room
  footprint survives this change untouched.
- **Ceiling clearance: checked, fine.** A scaled height of ~0.85 against
  `wallHeight = 2.6` and the lamp fixtures' own mount height
  (`wallHeight - 0.3 = 2.3`) leaves well over a metre of clearance above
  the tallest scaled machine — no risk of a machine visually poking into
  a lamp or the ceiling plane.
- **Character stays at its current scale** — confirmed with the user:
  this is specifically the "make the interactable bigger relative to the
  avatar" game convention, not a uniform scene re-scale. Only the washer/
  dryer models (and everything that attaches to them: collision boxes,
  the indicator light from 9.4.3, the unclaimed-laundry ring, the
  examine/QR proximity anchor) scale up; the character, the room shell,
  the bookcases, the island, and the camera rig's own distances are
  unaffected.

**Implementation — one scale constant, applied consistently, not a
second set of guessed numbers**: introduce `var MACHINE_SCALE = 1.8;`
(exact value to be tuned by screenshot, this plan's established method —
1.8 is a starting point, not a final answer) and apply it in exactly two
places: (1) `modelRoot.scale.setScalar(MACHINE_SCALE)` on the loaded
GLTF root, inside the existing `loadModel(url, ...)` callback; (2)
`footprintOf(type)` multiplies the real measured `w`/`d`/`h`/`frontZ` by
`MACHINE_SCALE` before returning them. Because every other computed
value in this file (`addCollisionBox`'s args, the model's own centering
offset, the indicator-light position from 9.4.3, the QR anchor, the
unclaimed-ring height) already reads its numbers from `footprintOf()`'s
return value rather than from `MODEL_BBOX` directly, scaling inside
`footprintOf()` alone is sufficient to keep every one of those
*consistent with the visually scaled model* automatically — no second
place has to remember to apply the same factor. **This also fixes a
real pre-existing inconsistency this session's own investigation found**:
the unclaimed-laundry marker's vertical offset is currently a hardcoded
literal (`0.47 + 0.25`, with a comment calling `0.47` "the real washer/
dryer model's own measured height") instead of reading `footprint.h` —
harmless today only because `0.47` happens to equal the real unscaled
height, but it would silently stop matching the model's real (now
scaled) top the moment `MACHINE_SCALE` changes anything, without any
error or visual cue pointing at why. This gets fixed to read
`footprintOf(type).h` the same way every other placement in this file
already does, as part of this same stage — not deferred, since shipping
`MACHINE_SCALE` without this fix would reintroduce exactly the class of
silent-drift bug `footprintOf()` itself exists to prevent.

**Verification for this whole stage**: Playwright screenshots (the
established method throughout this plan) confirming — drag-to-look
works and releasing the drag doesn't fire a stray interact; a plain
click-without-drag still opens a machine's examine overlay; the new
indicator-light position sits flush on the panel, clearly visible,
clearly not overlapping the door, on both a north-wall and an east-wall
(rotated) machine; the unclaimed-ring still reads correctly relative to
the taller scaled machine; a real walk between two adjacent scaled
machines confirms no new collision/clipping; `pnpm check` green
throughout, `src/queue.ts` untouched.

#### 9.4 built and verified

Implemented per the plan above, with one real geometric bug found during
9.4.3's own screenshot verification — not present in the pre-stage code
as a visible defect, only exposed by adding something visible to check
against.

- **9.4.1 (drag-to-look)**: pointer lock, `requestLock()`, the
  `pointerlockchange` listener, and the `laundry-lock-hint` element/CSS
  are all gone. `mousedown`/`mousemove`/`mouseup`/`mouseleave` on
  `renderer.domElement` now drive yaw/pitch directly from `clientX`/
  `clientY` deltas while a `dragging` flag is set. Verified with real
  (non-debug-hook) Playwright mouse events: a `mousedown` + ten
  `mousemove` steps + `mouseup` changes the character's yaw and leaves
  the examine overlay closed; a plain `mousedown`+`mouseup` at the same
  point (no movement) opens the overlay when standing next to a machine;
  the same drag sequence performed *while already standing next to a
  machine* (the actual scenario `CLICK_DRAG_THRESHOLD` exists for) does
  not also open the overlay.
- **9.4.2**: confirmed diagnosis-only, as planned — no code change. Every
  washer instance is the same `washer.glb`, clone()'d through the shared
  model cache; the perceived detail difference is lighting/distance/fog,
  not a loading or asset bug.
- **9.4.3 (flush-mounted status light)**: the free-standing stalk+sphere
  is replaced with a `CylinderGeometry` disc mounted directly on
  `footprintOf()`'s own `frontZ`, offset to the top corner of the face
  away from the door. **A real bug found by this exact verification,
  not present before this stage's own visible light made it checkable**:
  the light (and the pre-existing QR/examine proximity anchor, which
  shares the same front-face-offset logic) used one hardcoded sign for
  "toward the room," which only happens to be correct on one wall — which
  wall is correct depends on each wall's own rotation (`p.facing`),
  since a model's local +Z axis points at a different world direction on
  the north wall than on the east wall. The north-wall lights were
  real-world positioned on the *wall* side of the model, nearly invisible
  from the room; the east wall (where the single hardcoded sign was
  already correct) looked fine, which is what let the bug through
  unnoticed until the north wall's lights were screenshotted. The
  examine anchor had the identical bug since an earlier stage, silently
  masked because `INTERACT_RANGE` (1.3) is wide enough to reach through
  the model and the wall from the room side regardless of which side the
  anchor actually sits on — it never rendered anything, so nothing ever
  made the misplacement visible before now. **Fix**: each `placedMachines`
  entry now carries a `frontSign` (`-1` north, `+1` east), and both the
  light's and the anchor's offset use `p.frontSign * (footprint.d / 2 +
  clearance)` instead of one fixed sign. Confirmed by screenshot on both
  walls after the fix: all 5 north-wall lights clearly visible, matching
  the east wall's already-correct appearance, with no regression there.
- **9.4.4 (`MACHINE_SCALE = 1.8`)**: applied inside `footprintOf()` only
  for `"washer"`/`"dryer"`, so every derived value (collision boxes, the
  model's own centering offset, the status light, the QR anchor, the
  unclaimed-ring height) reads the scaled numbers from one place. Also
  fixed the unclaimed-laundry ring's pre-existing hardcoded `0.47 + 0.25`
  height literal to read `footprintOf(type).h + 0.25` instead, so it
  stays correct now that the real top of the model has moved. Verified:
  a real (non-teleported) walk through the gap between two adjacent
  north-wall machines, driven by the real `pressKey`/`releaseKey` +
  per-frame movement/collision code, reaches the far side with no
  stopping and the character's x position held exactly at the gap's
  midpoint throughout; a forced-visible unclaimed-ring screenshot against
  a scaled machine shows the ring sitting cleanly above the model with no
  clipping or overlap with the status light.
- **Whole-stage checks**: `pnpm check` (typecheck + all 36 spec tests)
  green against a scratch server; `git diff --stat` confirms only
  `src/laundry-view.ts` and `src/views.ts` changed — `src/queue.ts`,
  `src/presence.ts`, `src/pickup-spots.ts`, and the presence spec/ADR
  from the concurrent presence work are untouched.

### Stage 9.5 — north-wall machines face the wall, not the room; an automated test for facing, not just a screenshot

User-reported, with a screenshot: most north-wall washers/dryers show
their door and control panel to the wall, not the room. Confirmed before
writing a fix, not assumed: a small headless-Playwright probe
(`window.__laundryMachineGroups`, read-only, no code change) dumped every
machine's real `group.rotation.y` —

```
north wall (machines 1-5): rotY = Math.PI (3.14159...)
east wall  (machines 6-10): rotY = -Math.PI/2
```

— then a standalone rotation check confirmed what those numbers do to the
model's own local +Z axis (bbox.max.z, the door/panel face, per
`MODEL_BBOX`'s own convention):

```
rotateY(local +Z, theta=Math.PI)     -> world (0, -1)   // north wall
rotateY(local +Z, theta=-Math.PI/2)  -> world (-1, 0)   // east wall
```

The room interior from the north wall's own position is world `+Z`
(south, toward the spawn point); from the east wall it's world `-X`
(west, into the room). So the east wall's `-Math.PI/2` is correct — its
local +Z does point at `(-1, 0)`, matching the interior direction — but
the north wall's `Math.PI` sends local +Z to `(0, -1)`, the *wall's own
far side*, not `(0, 1)`. The comment on that line (`"faces +Z, into the
room — unchanged from Stage 8.2"`) was simply wrong and had been wrong
since Stage 8.2; nothing visible depended on the model's own front-face
rotation before 9.4.3 added the status light, and the status light/anchor
bug 9.4.3 found and "fixed" was a *different* bug on the same root cause,
not this one.

**Why 9.4.3's `frontSign` fix didn't catch this.** `frontSign` only
flips the *sign used by code placing things relative to the model* (the
status light's and QR anchor's own offset) — it was never applied to
`group.rotation.y = p.facing` itself, the actual model rotation. 9.4.3's
own screenshot check only looked at whether the light was visible from
the room, which it now is (on the *back* of a backwards-facing machine,
which still reads as "the side facing the room" once the whole model is
rotated 180°) — it never checked the door/panel geometry itself, so a
light correctly showing through to the room side of a machine that is
itself facing backward passed that check without anyone noticing the
machine was backward. This is why the status light "looked fine" in the
9.4.3 screenshots while the machines underneath it were already wrong.

**The actual fix**: stop hand-picking `facing` per wall by trial
screenshot and derive it from each wall's own interior direction, the
same `atan2` convention `characterRoot.rotation.y` already uses elsewhere
in this file for "rotation that makes local +Z point at a given world
direction":

```js
function facingToward(dx, dz) { return Math.atan2(dx, dz); }
// north wall: interior is +Z from the wall -> facingToward(0, 1) = 0
// east wall:  interior is -X from the wall -> facingToward(-1, 0) = -Math.PI/2
// west wall (bookcases): interior is +X     -> facingToward(1, 0) = Math.PI/2
```

North wall's `facing` becomes `0` (not `Math.Pi`); east wall's `facing`
stays `-Math.PI/2` (already correct, now derived rather than guessed);
`BOOKCASE_FACING` stays `Math.PI/2` (already correct by the same check:
`rotateY(local +Z, Math.PI/2) = (1, 0)`, the room's +X from the west
wall). Once `facing` is correct on every wall, `frontSign` becomes
redundant — the "room-facing side" is just local `+Z` everywhere, with no
per-wall sign flip needed — so `frontSign` is deleted from
`placedMachines`, and the status light's/anchor's offsets drop back to a
single `+1` (equivalently, no sign at all). This is a net deletion, not
a parallel system kept alongside the fix: keeping `frontSign` around
after fixing `facing` would leave two independent "which way is the room"
encodings that could drift apart again exactly the way they already did
once.

**Automated test, not just another screenshot.** A screenshot confirms
today's build; it doesn't stop the next wall, the next furniture item, or
the next hand-picked rotation constant from repeating the same mistake
unnoticed, the way 9.4.3's own screenshot check did. The real risk this
class of bug shares: a `rotation.y` constant picked by eye for one wall,
with no check tying it back to *that wall's own* interior direction.
Three constraints on any fix:

- It must check the real code's own numbers, not a hand-copied re-
  statement of them (`sim/`'s rule against copying queue logic into a
  test applies here too: a copied rotation formula could pass while the
  real one is wrong).
- `LAUNDRY_SCRIPT` runs as a `<script type="module">` string embedded by
  `laundryPage()`, with no bundler (ADR 0003's no-build-step constraint)
  — nothing in `spec/` can `import` a function out of it directly today.
- It must not need a browser. No `spec/*.test.ts` file uses Playwright
  today, and this repo's Dockerfile/CI image has no Chromium in it — a
  geometry check doesn't need to render anything to verify a rotation
  constant maps a local direction to the correct world direction; adding
  a whole browser dependency to CI for this one check would be a heavy,
  slow way to test arithmetic.

**Design**: pull the *whole* room-geometry computation out of
`LAUNDRY_SCRIPT` into a small, plain TypeScript module,
`src/laundry-layout.ts`, with no `THREE`/DOM import — not just
`placedMachines`'s x/z/facing. `roomHalfWidth`/`roomHalfDepth`/`northZ`/
`eastX`/`westX`/`southZ` are derived from the same `SPACING`/
`CORNER_MARGIN`/etc. constants `placedMachines` already depends on;
splitting only the machine positions out and leaving the room-shape
numbers to be recomputed a second time inside `LAUNDRY_SCRIPT` would
create exactly the duplication this stage exists to remove — two
independent copies of "where is the north wall" that could silently
drift apart the same way `facing` and `frontSign` already did once.

```ts
// src/laundry-layout.ts
export interface PlacedMachine {
  id: number;
  type: string;
  x: number;
  z: number;
  facing: number; // radians; rotateY(local +Z, facing) must point at (interiorX, interiorZ)
  wall: "north" | "east";
}

export interface LaundryLayout {
  roomHalfWidth: number;
  roomHalfDepth: number;
  northZ: number;
  eastX: number;
  westX: number;
  southZ: number;
  placedMachines: PlacedMachine[];
}

export function layoutRoom(machines: { id: number; type: string }[]): LaundryLayout {
  // the exact SPACING/eastSlotCount/northMachines/eastMachines/room-size
  // arithmetic already in LAUNDRY_SCRIPT, moved here verbatim (not
  // re-derived), plus facing computed via facingToward(interiorX, interiorZ)
  // instead of a hand-picked constant per wall.
}
```

`laundryPage()` (`src/laundry-view.ts`) calls `layoutRoom(machines)` once
server-side and serializes the result into the existing
`<script type="application/json" id="laundry-machines">` data island
(replacing the current bare `{id,label,type}` list with
`{machines, layout}`, so the client still gets each machine's own
`label` for the UI text it already reads); `LAUNDRY_SCRIPT`'s client code
reads `roomHalfWidth`/`northZ`/`placedMachines`/etc. straight from that
JSON instead of recomputing any of it, removing the duplication risk
entirely rather than keeping two copies in sync by hand.
`footprintOf`/`MODEL_BBOX`/`WEST_ZONE_DEPTH`/`ISLAND_CLEARANCE`-derived
prop placement (sink, table, bookcases, lamps) stay in `LAUNDRY_SCRIPT`,
reading the now-shared `westX`/`northZ`/`southZ` rather than
recomputing them — they're genuinely display/model-only (bbox
measurements, `THREE` geometry), not something a non-browser test needs.

`spec/laundry-layout.test.ts` (pure function test, no server, no
Playwright, following this file's own existing non-Playwright pattern):
for every entry `layoutRoom(SEED_MACHINES).placedMachines` returns,
compute the world direction its own `facing` sends local `+Z` to
(`{x: Math.sin(facing), z: Math.cos(facing)}`, the same formula
`facingToward`'s inverse implies), compute that wall's own defined
interior direction (`north: (0,1)`, `east: (-1,0)`), and assert the dot
product of the two is `> 0.9` (clearly toward the room, not merely
non-negative — a wall rotated 90° off would dot to 0, not negative, and
should still fail). This fails loudly on exactly the bug just found
(north's old `Math.PI` dots to `-1` against `(0,1)`) and on the general
class (any future wall whose `facing` doesn't actually point at its own
declared interior direction), without rendering anything.

**Verify**: `layoutRoom` output's `x`/`z`/`wall`/room-size values for the
real seeded machine list match today's already-verified-by-screenshot
positions exactly (a regression check on the extraction itself, not just
the new facing logic); `spec/laundry-layout.test.ts` fails against the
pre-fix `Math.PI` north constant (confirmed by temporarily reverting it
in a throwaway check) and passes after the fix; a fresh Playwright
screenshot (scratch server, port ≥8094, killed and port-confirmed-free
after) of the north wall shows every door/panel facing the room, matching
the east wall's already-correct appearance; `pnpm check` green.

#### 9.5 built and verified

Implemented per the plan above. `src/laundry-layout.ts` (new file, no
`THREE`/DOM import) holds `layoutRoom()`: the exact room-size/wall-position
arithmetic previously inline in `LAUNDRY_SCRIPT`, plus `facing` now derived
per wall from `facingToward(interiorX, interiorZ)` instead of a hand-picked
constant. `laundryPage()` calls it once and serializes
`{ machines, layout }` into the existing JSON data island;
`LAUNDRY_SCRIPT`'s client code reads `roomHalfWidth`/`northZ`/
`placedMachines`/etc. from that JSON instead of recomputing any of it.
`frontSign` is gone entirely — the status light's and QR anchor's own
offsets are a plain `footprint.d / 2 + clearance` everywhere now that
`facing` itself is correct on every wall.

- **Root cause, confirmed before fixing**: a headless Playwright probe
  read `window.__laundryMachineGroups`' real `rotation.y` values
  (north wall: `Math.PI`; east wall: `-Math.PI/2`), and a standalone
  rotation check confirmed what those do to the model's local +Z (the
  door/panel face): north's `Math.PI` sends it to world `(0,-1)`, the
  wall's own far side, not `(0,1)` (the room, toward the south/spawn
  wall) — the line's own comment ("faces +Z, into the room") had been
  wrong since Stage 8.2. East's `-Math.PI/2` was already correct
  (`(-1,0)`, matching its own interior direction). 9.4.3's `frontSign`
  never touched `group.rotation.y` itself — it only flipped the *status
  light's and QR anchor's own offset sign* — so a backwards machine's
  light still ended up showing through to the room side, which is why
  9.4.3's own screenshot check passed while the door underneath stayed
  wrong.
- **Fix verified**: `window.__laundryMachineGroups` reads `rotY: 0` for
  all 5 north-wall machines after the fix (was `Math.PI`); positions
  (`x`/`z`) for every machine are bit-for-bit unchanged from before the
  fix, confirming `layoutRoom()`'s extraction didn't also shift anything
  it wasn't meant to. A fresh screenshot from the same vantage as the
  user's original bug report shows all 5 north-wall doors/panels facing
  the room, matching the east wall's unchanged appearance; a second
  screenshot of the west wall (drop-off shelving, sink, ironing table)
  confirms no regression there.
- **Automated test**: `spec/laundry-layout.test.ts`, a pure-function test
  (no server, no Playwright) against the real `layoutRoom()`. Confirmed
  to actually catch the bug class, not just the one instance: temporarily
  reverting the north wall's `facing` back to a hardcoded `Math.PI` made
  the facing-direction test fail with `dot = -1.00` against the north
  wall's own declared interior direction; restoring the fix made it pass
  again. A second test pins the real seeded split (5 north / 5 east, IDs
  1-5 north and 6-10 east) as a regression check on the extraction itself,
  separate from the facing logic.
- **Whole-stage checks**: `pnpm check` green (39 tests, up from 36 —
  the 3 new `laundry-layout.test.ts` cases) against a scratch server
  (port 8095, killed and port-confirmed-free after); `tsc --noEmit`
  clean; `git status` confirms only `src/laundry-view.ts` changed plus
  the two new files (`src/laundry-layout.ts`,
  `spec/laundry-layout.test.ts`) — no other stage's files touched.
- The yellow ring above a machine (the user's second question, answered
  from the code, then confirmed by forcing it visible in a screenshot)
  is `unclaimedMarkers` (Stage 8.4): a small gold torus shown above any
  machine still holding someone else's unclaimed laundry, visible to
  every viewer regardless of who could act on it. It intentionally
  shares `UNCLAIMED_MARKER_COLOR` with the highlight ring's and flash
  colour's own `0xffd54a` (both signal "something needs attention"), but
  is a separate mesh with its own distinct shape (a floating ring above
  the model) and visibility rule (tied to `unclaimedLaundry` server
  state, not to player proximity) — not the same object as the proximity
  highlight ring on the floor, and not a bug.

## What I check after this stage

- A real two-device rehearsal (one screen running `/laundry`, one actual
  phone scanning) before trusting this at a crit/demo — same shape as
  crit 10's own "rehearse the actual format before trusting it" stage.
- `pnpm check` green against the deployed image, not just local.
- Nothing in `src/queue.ts` changed — if a diff touches it, that's a
  signal this stage scope-crept into re-deciding fairness/ownership
  logic instead of reusing it.
- Stage 8's own constraint is separate and explicit: new functions may
  be added to `src/queue.ts` for the handoff feature (8.4), but every
  *existing* exported function's behaviour must be provably unchanged
  (covered by the existing `spec/*.test.ts` files continuing to pass
  unmodified).
