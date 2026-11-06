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
