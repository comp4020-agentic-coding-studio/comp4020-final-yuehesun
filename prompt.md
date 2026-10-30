# 3D walkthrough, Stage 7 (remaining) + Stage 8 — one unattended run, budget-capped

Written for one unattended agent run on branch `3d-walkthrough` (already
checked out, with the plan/ADR/research/CSS groundwork already committed
at `db86e4b`). Nobody will read your questions or answer them: this file,
`CLAUDE.md` (its "Unattended runs" section governs this run),
`plans/3d-walkthrough.md`, `docs/adr/0012-3d-walkthrough.md`, and
`research/3d-booking/asset-sourcing.md` are the whole brief. Where this
file and the plan differ, this file wins — it's the more carefully
scoped-for-unattended-execution version of the same design.

## 0. Budget is the binding constraint this run — read this first

This course's Claude Code usage runs through a shared, metered budget.
**The student's own stated cap for this specific run is $80 USD** — not
the course's own weekly cap, a personal limit on top of it. There is no
reliable way to query mid-run exactly what this run itself has spent (the
course proxy's `/api/me` reports whole-week totals across everything,
not per-run), so this run manages its own risk by **structure**, not by
checking a live number:

- **Commit after every meaningfully complete unit of work, not just at
  stage boundaries.** If this run is stopped partway through (by running
  out of budget, by a time limit, by anything), committed work survives;
  in-progress work doesn't. This matters more here than in any prior run
  on this project.
- **A hard retry cap on anything visual/subjective**: for any step whose
  correctness depends on a human judgment call from a screenshot (does
  this model look right, does the character's proportions read as
  intended, does the room layout look reasonable) — **at most 2 correction
  attempts total**. If it's still not right after 2 fixes, commit what you
  have, write exactly what's wrong and what you tried in `HANDOFF.md`
  under a clearly-labeled "needs a human visual pass" heading, and move
  on to the next piece of work. Do not loop a 3rd, 4th, 5th time chasing
  a visual judgment call — that is exactly the failure mode that burns
  budget fastest and produces the least committed progress per dollar.
- **Order of work matters for partial-completion value**: do the stages
  in the order below. If this run has to stop early for any reason, a
  partially-done Stage 8.2 (floor plan) sitting on top of a *fully done*
  Stage 7 and Stage 8.1 (assets wired in, loading correctly) is a much
  more useful stopping point than a rushed, broken attempt at everything.
  Never skip ahead to a later sub-stage to "get something flashy done"
  while an earlier one is left half-finished.
- **No batch/bulk anything.** Every operation in this run processes one
  thing at a time, verified, before the next — no "generate all 10
  machine placements then check at the end," no "write the whole handoff
  feature then test it all at once." This is slower per-unit but each
  unit's cost is bounded and visible, which is what matters when the
  total budget is capped and unknown-in-flight.
- If you genuinely cannot tell whether you're approaching the budget
  limit, **err toward stopping and handing off early with clear
  `HANDOFF.md` notes**, not toward continuing on the assumption there's
  room. An incomplete-but-documented stopping point costs nothing extra;
  overshooting a hard personal budget cap is the one outcome worse than
  stopping early.

## 1. Ground rules (same shape as the prior runs on this branch)

- **Nobody is there.** Never ask a question, never stop to wait for a
  reply. Where you would ask, make the smallest reasonable call, record
  it and why in the commit message and `HANDOFF.md`, and keep going.
- **Scope is Stage 7's remaining sub-stages (7.2, 7.3) plus all of Stage
  8**, both as written in `plans/3d-walkthrough.md`. Stage 7.1 (the home-
  page button) and its CSS groundwork (the `.laundry-entry-cta`,
  `.laundry-lock-hint`, `.laundry-examine-overlay` rules) are **already
  committed** — build on them, don't redo them. Stage 4 (a real phone
  scanning a real deployed QR code) remains explicitly out of scope, as
  it has for every run on this branch — no physical phone, no deployment,
  no amount of remaining time or budget changes that.
- **`src/queue.ts`'s existing exported functions are not modified.**
  Stage 8.4's new handoff logic is **new** functions (in `src/queue.ts`
  or a new sibling module — your call, see 8.4 below for the specific
  tradeoff), never a change to `join`, `claim`, `cancel`, `start`,
  `finish`, `acceptOffer`, `declineOffer`, `queueDryer`, or any other
  existing export's behavior. Every existing `spec/*.test.ts` file must
  continue to pass unmodified — if making Stage 8.4 work seems to require
  changing one of these functions, stop and reconsider the approach
  (likely: the new logic needs its own function that *calls* the
  existing ones, not a change to them), and if truly stuck, document the
  conflict in `HANDOFF.md` rather than forcing a change through.
- **Already decided — do not reopen**: everything in
  `docs/adr/0012-3d-walkthrough.md` (QR codes carry no token/protection),
  identity stays a bare `roomXXX` cookie (ADR 0002/0004), the app stays
  one Fly machine / one Dockerfile / no required frontend build step
  (ADR 0003).
- **Do not edit** `README.md`, `PROCESS.md`, `process-notes.md`, or
  `reflections/`. Suggestions for those go in `HANDOFF.md`. `plan.md`'s
  "Current state" section may be appended to (never rewritten).
- **Ports:** never 8080. Your own verification servers use 8090 or
  above — **check `spec/restart.test.ts` first**, which hardcodes port
  8091 for its own server; a prior run on this branch collided with it
  by accident (documented in `HANDOFF.md`'s "3D walkthrough" section) —
  avoid 8091 for your own scratch servers specifically, use 8092+.
  Every server is killed the moment a check finishes, with the port's
  freedom confirmed (`ss -tlnp`) immediately after — not deferred.
- Never write test data into the deployed app or `.data/app.db`. Use a
  scratch `DATABASE_PATH` for every server you start.
- `pnpm check` is green before every commit.
- If the same check fails twice after an honest fix attempt, stop and
  reconsider the approach (this is the same rule as the visual-retry cap
  in section 0, generalized to any kind of failure, not just visual
  ones) — don't attempt a near-identical third fix.

## 2. The Playwright/WebGL environment fix — still in place, read before using Playwright

Same fix as the prior run on this branch: `~/.bashrc` exports
`LD_LIBRARY_PATH` to include `/home/syh/.local/playwright-libs/usr/lib/
x86_64-linux-gnu` (missing system libs on this WSL2 distro, fixed outside
the repo, no root needed). This makes Chromium launch and WebGL render
correctly (SwiftShader software rendering — no GPU, but a genuinely
correct render) in an **interactive bash shell**. If you open a shell
that doesn't source `~/.bashrc` (some non-interactive invocations don't)
and a Playwright launch fails with `libnspr4.so: cannot open shared
object file`, export that same `LD_LIBRARY_PATH` value directly in that
shell's command rather than re-diagnosing the problem from scratch — it
has already been solved once on this machine.

## 3. Read first

- `plans/3d-walkthrough.md` — Stage 7 (all of it, including 7.1 which is
  already built — read it to understand what exists) and Stage 8 in
  full. This prompt restates the in-scope parts but the plan has more
  design reasoning; read it, don't just skim this prompt.
- `docs/adr/0012-3d-walkthrough.md` — short, the one existing decision.
- `research/3d-booking/asset-sourcing.md` — the exact models, exact
  source URLs, exact license statements, and the GLTFLoader-via-CDN
  loading mechanism this stage uses. Read in full before writing any
  loader code.
- `src/laundry-view.ts` — the entire file. This is what Stage 7/8 both
  modify most. Pay particular attention to: the first-person camera/
  movement/collision code (`clampToRoom`, `collidesWithMachine`,
  `applyCameraTransform`, the `keys`/`joystickVector` input state) which
  Stage 8.3 repurposes for a character rather than the camera directly;
  the QR mesh code (`qrMeshes`, `QR_SIZE`, the ring/QR placement
  constants) which Stage 7.3 replaces; the `__laundry*` window-exposed
  debug hooks, which existing verification relies on and which this run
  should extend (new hooks), not remove.
- `src/views.ts` — `page()` (the shared HTML shell), the already-
  committed CSS for `.laundry-entry-cta`/`.laundry-lock-hint`/
  `.laundry-examine-overlay`, and the two existing `notice === "moved_back"`/
  `"moved_up"` branches (search for them — there are two call sites) that
  Stage 8.4's new `"laundry_moved"` notice value needs a third branch
  alongside.
- `src/schema.ts` and `src/queue.ts` in full — Stage 8.4 adds columns and
  new functions; understand the existing shape (`notice`'s enum,
  `dryerPromptDismissed`'s "one fact about an existing reservation, no
  new table" pattern, `loadOwned`'s authorization shape, `activeReservations`)
  before extending it.
- `spec/room-limit.test.ts` and `spec/laundry-scan.test.ts` — the house
  style for a spec file that drives the real app over HTTP with a cookie
  jar, and (critically) **check every existing `spec/*.test.ts` file's
  own comment for which machine IDs it already owns** before picking
  machine IDs for Stage 8.4's new spec — all of machines 1-10 are
  currently claimed by one file or another (see each file's own header
  comment); you may need to either find a genuinely free ID, reuse an
  existing file's machine within a state that file's own tests don't
  occupy at the same time, or (if truly no ID is free) ask yourself
  whether the test can run against a freshly-seeded machine inserted
  just for this test — decide and document which, don't guess silently.
- `Dockerfile` and `.dockerignore` — Stage 8.1 needs a new `COPY public
  ./public` line (the image currently copies `src`, `drizzle`,
  `README.md`, `sim/results.json` — no `public/` yet) and confirmation
  `.dockerignore` doesn't exclude it.
- `package.json` — `@hono/node-server@2.1.3` already provides
  `@hono/node-server/serve-static` (confirmed available in
  `node_modules` already — no new dependency needed for serving the
  downloaded model files).

Before changing anything: start the app on a spare port (8092+) with a
scratch `DATABASE_PATH`, run `APP_URL=http://localhost:<port> pnpm check`,
confirm green, stop the server, confirm the port free. This is your
baseline.

## 4. Stage 7 (remaining): 7.2 and 7.3

(7.1, the home-page button, is already committed — skip it.)

### 4.1 Stage 7.2 — automatic pointer lock + corner hint

- On entering `/laundry`, call `renderer.domElement.requestPointerLock()`
  immediately after the scene is set up, rather than waiting for a click
  (the existing click-to-lock listener can stay as a fallback — many
  browsers decline a lock request not triggered by a user gesture, so
  don't remove the click handler, just also try automatically on load).
- Listen for `document.pointerlockchange` and toggle the already-
  committed `.laundry-lock-hint`'s `is-visible` class based on whether
  `document.pointerLockElement === renderer.domElement` — visible only
  while actually locked, exactly matching the CSS comment's intent.
- The hint's text content ("Press ESC to exit look mode" or equivalent —
  exact wording your call) is a plain text node inside the existing
  `.laundry-canvas-wrap` div structure in `laundryPage()`
  (`src/laundry-view.ts`) — add the element there, matching how
  `.laundry-crosshair` is already added as a sibling inside that wrapper.
- **Verify**: Playwright, load `/laundry`. Note whether the automated
  browser context's initial lock request succeeds or is declined (headless
  Chromium's behavior here may differ from a real browser with a real
  user gesture) — either way, confirm the hint element exists in the DOM
  and that its visibility correctly tracks `pointerLockElement` by
  triggering a lock via the existing click-to-lock path and checking the
  hint becomes visible, then simulating an unlock (dispatch Escape or
  call `document.exitPointerLock()`) and confirming the hint hides again.
  Document in the commit message which path (automatic vs. click-
  fallback) actually fired in this environment.

### 4.2 Stage 7.3 — QR becomes an examine-overlay interaction

**Build this directly against Stage 8.3's third-person/proximity-based
interaction model, not against the current first-person/screen-center-
raycast model that's about to be replaced.** Per the user's own explicit
decision (recorded when this run was planned): doing a first-person
version first and then redoing it for third-person would waste work.
Concretely, this means **doing Stage 8.3 (the third-person character
rewrite) before finishing Stage 7.3** is a reasonable sequencing choice if
it makes the interaction code simpler to write once instead of twice —
your call on exact ordering within this run, but don't build and verify
a first-person raycast interaction model only to immediately discard it
within the same run.

- Remove the large, always-visible QR plane entirely (`qrMeshes`,
  `QR_SIZE`, the `textureLoader.load(...)` call wiring a QR texture onto
  it) — replaced by:
  - A small, deliberately illegible "worn paper strip" texture or flat-
    coloured plane on each machine's face (a plain small rectangle,
    e.g. a muted off-white/grey material with a faint darker scribble
    texture if easy to produce, or just a flat plain colour if not — this
    is set dressing, not the interaction target itself, so don't spend
    disproportionate effort on it).
  - A proximity/look-based highlight (per Stage 8.3's interaction model —
    see below) that activates when the player is near/facing a machine,
    using an inverted-hull outline technique (a slightly-scaled duplicate
    mesh in a flat highlight colour, rendered behind the real one via
    `THREE.BackSide` — confirm this specific technique renders correctly
    via a screenshot before relying on it, it's a common but fiddly
    effect to get right the first time).
  - Interacting (click, or the equivalent touch/gamepad action already
    used for other interactions in this scene) while highlighted opens
    the already-committed `.laundry-examine-overlay` — populate it with
    the machine's label and an `<img>` whose `src` is that exact
    machine's real `/machines/:id/qrcode.png` (this is the one part of
    this feature where using a plain `<img>` instead of a WebGL texture
    actually matters for correctness — native pixel resolution avoids
    the texture-filtering softness `HANDOFF.md` already flagged from
    Stage 3/6). A close control (button + Escape) hides the overlay
    (`is-hidden` class) and returns control to the 3D view (re-requesting
    pointer lock the same way initial entry does).
- **Verify**: confirm the QR image inside the overlay still decodes
  correctly (reuse Stage 3's jsQR round-trip check against the actual
  `<img src>` URL, not just the route in isolation — this is the one
  thing that would silently regress if the overlay somehow referenced
  the wrong machine's image). Confirm the overlay opens only when
  actually highlighted/interacting with a machine, not from an arbitrary
  click elsewhere in the scene. Screenshot: a machine's plain "worn
  strip" at rest, the highlight state, and the open overlay — save
  alongside the existing `research/screens/laundry-stage*.png` set as
  `laundry-stage7-*.png`.

## 5. Stage 8.1 — real assets, verified before building around them

- Download the specific files identified in
  `research/3d-booking/asset-sourcing.md`: Washer, Dryer, Kitchen Sink
  (or Bathroom Sink — your call, whichever reads better once seen),
  Lamp Square Ceiling or Lamp Round Ceiling, at least one plain table
  model (reused for both the ironing table and drop-off shelf per the
  plan), and one Mini Characters character model (pick one; they're
  interchangeable for this purpose) **with its texture file** (the
  research's documented caveat: download the character's full source
  pack, not a single extracted `.glb`, so the texture reference
  resolves — even though this stage overrides the material in code
  anyway, fetching the complete, correctly-referenced asset first is the
  safer order of operations).
- Save them under `public/models/*.glb`. Add a `public/models/SOURCES.md`
  (one line per file: filename, source URL, license — CC0 per the
  research, credit Kenney by name even though CC0 doesn't require it,
  matching this repo's existing habit of citing sources throughout
  `research/3d-booking/`).
- Wire up static serving: `app.use("/models/*", serveStatic({ root:
  "./public" }))` (or equivalent — `@hono/node-server/serve-static`'s
  actual API, check its real signature rather than guessing) in
  `src/app.ts`. Add `COPY public ./public` to the `Dockerfile`'s runtime
  stage (alongside the existing `COPY sim/results.json` line).
- Load each model once via `GLTFLoader` (imported via the exact pinned-
  version jsDelivr URL pattern `research/3d-booking/asset-sourcing.md`
  confirmed: `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js`,
  matching the existing `THREE_BASE` construction in
  `src/laundry-view.ts`) in complete isolation first — a throwaway test
  page or a temporary addition to `/laundry` that just places one model
  in an otherwise-empty scene — and **screenshot it before writing any
  more code**. Confirm it actually looks like what it's supposed to be
  (per the research's own flag that model detail wasn't independently
  verified). This is the first budget-capped visual-judgment checkpoint
  from section 0: if a model looks wrong or fails to load correctly
  after 2 correction attempts (wrong scale, wrong orientation, missing
  texture), commit whatever state it's in, document the problem
  precisely in `HANDOFF.md`, and either fall back to a simplified
  primitive-built version of that specific object (acceptable per the
  plan's own research-confirmed fallback: "a round door is doing most of
  the work" for reading as a washing machine) or move on and flag it —
  don't burn further budget perfecting one model's import.
- **Character material override**: once the character model loads,
  traverse its mesh hierarchy and replace every material with a single
  new `MeshStandardMaterial` (one flat colour, your choice, no texture
  map) — per the plan's explicit decision, this satisfies "head and body
  one single colour" and sidesteps the external-texture caveat
  entirely. Keep the model's skeleton/animation data untouched; only
  materials are replaced.

## 6. Stage 8.2 — floor plan (write the layout sketch before coding it)

**Per `plans/3d-walkthrough.md`'s own instruction, write a short floor-
plan description into that plan file (a new subsection under 8.2, or a
simple ASCII top-down sketch) before writing the layout code** — same
"design before CSS" discipline `research/design-plan.md` already
established for the 2D UI, applied here. This doesn't need to be
elaborate: zone placement (washer bank, dryer bank, sink, ironing area,
drop-off area, relative to the room's walls and an entry point), rough
dimensions, and confirmation that every machine has walkable space on
its front-facing side. Commit this as its own small commit before the
3D code that implements it.

Then build it:

- Machines (8 washers + 2 dryers — read the real count from the server-
  provided data, same as the existing code already does, don't hardcode
  8+2) arranged with walkable aisle space in front of each row, pulled
  back from the walls behind them (not flush against a wall).
- Sink, ironing table (a table model + a simple small box "iron" prop —
  no need to source a separate iron model), and the drop-off area
  (another table/shelf, with visual room for the fixed number of named
  spots Stage 8.4 defines — decide the exact spot count based on what
  reads reasonably on the model, e.g. 6, and keep the two numbers
  consistent) are all placed in the layout per the sketch above.
- A ceiling plane closes the room from above. 2-3 ceiling lamp models
  placed along it, each with an accompanying `THREE.PointLight` or
  `THREE.SpotLight` (tuned to Stage 6's existing warm palette — reuse
  its colour values, don't invent a new palette). **This replaces**
  Stage 6's single directional "sun" light as the primary light source —
  remove or substantially dim it; an indoor room lit like it's under
  open sky will look wrong, and a screenshot should make this obviously
  correct or obviously wrong (another checkpoint subject to section 0's
  2-attempt cap).
- Collision boxes (`machineBoxes`-equivalent, extended to every new solid
  object — sink, tables, not just machines) so the character can't walk
  through the new furniture either.
- **Verify**: screenshots from a few vantage points (not an exhaustive
  tour) confirming: the ceiling/lighting looks like an indoor room, not
  outdoors; the new zones are visibly present and distinguishable from
  each other; machines have visible walking space in front of them, not
  touching a wall. Save as `research/screens/laundry-stage8-layout-*.png`.

## 7. Stage 8.3 — third-person camera and character

- Replace the first-person camera-is-the-player model: a character root
  `Object3D` (holding the loaded, recoloured Mini Character model) is
  what `pos.x`/`pos.z` and movement input now drive, instead of the
  camera directly. The camera becomes a child rig offset behind/above the
  character, using `lerp` (position) and a matching rotational ease each
  frame to follow rather than snapping — read
  `research/3d-booking/asset-sourcing.md`'s cited pattern (the three.js
  discourse threads and Medium walkthrough) for the concrete shape before
  implementing from scratch.
- **Collision**: adapt the existing `clampToRoom`/`collidesWithMachine`
  functions to operate on the character's position (its feet, i.e. the
  same `pos.x`/`pos.z` state that already exists, just now interpreted as
  the character's location rather than the camera's) — the underlying
  AABB math doesn't need to change, only what it's checked against (now
  also the Stage 8.2 furniture's collision boxes, not just machines).
- **Walk animation**: use `THREE.AnimationMixer` on the loaded character,
  playing its walk clip (inspect `gltf.animations` to find the right
  clip name/index — don't assume a specific name without checking) while
  `forwardInput`/`strafeInput` (the existing computed values) are
  nonzero, paused/reset to an idle frame when both are zero. Call
  `mixer.update(dt)` inside the existing render loop (`frame(now)`),
  using the same `dt` already computed there.
- **Interaction targeting — proximity-based, not screen-center raycast**:
  for each interactable object (machines, the drop-off area), compute
  distance from the character's current position; the nearest one within
  some threshold range (your call on exact distance — tune by actually
  walking up to things in a screenshot-verified test, not guessed) gets
  the Stage 7.3 highlight treatment. Only one object highlighted at a
  time (the nearest in range), matching how Stage 7.3's design assumed a
  single highlighted target. This replaces the plan's original Stage 7
  screen-center-raycast idea entirely — do not build both.
- **Input mapping stays conceptually the same**: WASD/joystick still
  produce `forwardInput`/`strafeInput` the same way; mouse-drag/look-zone
  now orbits the follow camera around the character (adjusting the
  camera rig's offset angle) rather than directly setting first-person
  yaw/pitch — but the character's own facing direction should track
  movement direction (facing the way it's walking), the standard third-
  person convention, rather than facing wherever the camera happens to
  be looking.
- **Verify**: Playwright screenshots confirming: the character model is
  visible on screen (not just a floating camera), the follow camera
  tracks it correctly after simulated movement (two screenshots a short
  movement apart, same pattern Stage 1 established, now checking the
  character's screen position stays roughly centered/followed rather
  than the room appearing to move around a fixed point), the walk
  animation visibly differs between a moving frame and a stationary one
  (if this is hard to confirm from a single screenshot, check the
  `AnimationMixer`'s/action's playing state via the `__laundryDebug`
  escape hatch instead — extend it with a new inspectable property
  rather than inventing a separate verification path), and proximity
  highlighting activates/deactivates correctly as the character's
  position is moved near/away from an interactable object (drive this
  via the existing `__laundryDebug.pressKey`/movement simulation, not a
  new untested input path).

## 8. Stage 8.4 — the laundry-basket mechanic and the real handoff feature

Read `plans/3d-walkthrough.md`'s Stage 8.4 section in full before writing
any code here — it's long and specific for a reason; this prompt
summarizes but the plan has the complete reasoning, including why spot
assignment is server-chosen (not user-chosen) and the exact end-to-end
flow across the 3D scene, a 2D overlay, and the server.

### 8.4a — your own basket (visual only, no new data)

- The character gains an attachable basket child mesh (reuse a Furniture
  Kit model if one fits, e.g. a small crate/box model, or a simple hand-
  built box/lattice shape if nothing fits well — don't over-invest in
  sourcing effort for this one small prop, per the plan's own note).
- Visibility driven by the viewer's own current reservation state (same
  `rows.find(r => r.person === identity)` lookup pattern `src/app.ts`'s
  `GET /` already uses): visible when `waiting`/`claimed`/`done`-not-yet-
  acknowledged, hidden when `running`. This needs the 3D scene to know
  its own viewer's reservation state — extend the existing
  `GET /laundry/machines-state` response (or add a small sibling
  endpoint) to include this, keyed off the request's own identity
  cookie, the same way every other identity-aware route already works.

### 8.4b — the real handoff feature

**Schema** (`src/schema.ts`, via `drizzle-kit generate` — run the actual
command, producing a real new migration file; never hand-edit an existing
one):

- `pickupSpot: text("pickup_spot")` — one of a fixed list (define the
  list as a constant, e.g. in a new `src/pickup-spots.ts` or alongside
  the handoff logic — your call), never free text.
- `pickedUpAt: int("picked_up_at")` — null while sitting in the spot, set
  once acknowledged.
- `notice`'s enum gains `"laundry_moved"` alongside the existing
  `"moved_back"`/`"moved_up"` — decide whether this is the same migration
  as the two columns above or a separate one; either is defensible, pick
  one and move on rather than deliberating.

**New logic — where it lives is your call, with a real tradeoff to
weigh, not a default to copy blindly**: `activeReservations` and
`loadOwned` in `src/queue.ts` are module-private (not exported) today.
The new handoff functions need equivalent queries (who's at the front of
a machine's queue, confirming a reservation's ownership for the
*acknowledge* step). Either (a) add the new handoff functions directly in
`src/queue.ts` alongside the existing ones (reusing the private helpers
directly, no export needed), or (b) export the minimum needed from
`queue.ts` and put the new functions in a sibling module. (a) is likely
simpler and keeps all queue-adjacent logic in one place; (b) keeps
`queue.ts` itself untouched in line count, which might read as a cleaner
diff against the "don't modify existing exports" rule even though adding
new, separate functions to the same file was never actually prohibited —
re-read section 1's rule carefully: it prohibits changing *existing*
exports' *behavior*, not adding new code to the same file. Pick (a)
unless a concrete reason during implementation says otherwise.

**Authorization rule — the one new, documented exception to `loadOwned`'s
general pattern**: whoever holds the current front `waiting` reservation
on machine `:id` may act on a *different*, `done`-and-unacknowledged
reservation on that same machine (to hand its owner's laundry off). This
is scoped exactly that narrowly — not any room, not whoever's nearby in
the 3D scene, only the person this handoff is actually for. Write this
as a new function (e.g. `canHandoff(machineId, personName)` or inline in
the route handler, your call), not a change to `loadOwned` itself (which
stays exactly as general-purpose and strict as it is today for every
other action).

**Routes** (`src/app.ts`):

- `POST /machines/:id/handoff` — validates the authorization rule above,
  finds the `done`-not-yet-`pickedUpAt` reservation on that machine (404
  if none), picks the first free spot from the fixed list (scan existing
  `pickupSpot` values where `pickedUpAt IS NULL` across all reservations;
  simple linear scan, no need for anything fancier), sets it on that
  reservation, sets its `notice` to `"laundry_moved"`, and responds with
  which spot was assigned (the response body/shape is this run's own
  call — JSON is fine, this is called from the 3D scene's own JS, not a
  form submission) so the client can display the result. Logs
  `laundry_handed_off` per `docs/adr/0006`'s existing shape (room,
  machine, spot, and the reservation being handed off).
- `POST /reservations/:id/acknowledge-pickup` — `loadOwned`-gated exactly
  like every other per-reservation action (this one really is the
  owner acting on their own reservation). Sets `pickedUpAt`, clears the
  `notice`. Logs `laundry_pickup_acknowledged`.

**Notice rendering** (`src/views.ts`): find the two existing
`row.notice === "moved_back"` / `"moved_up"` branches and add a third
case for `"laundry_moved"`, reusing the exact same notice-card visual
treatment, with text naming the assigned spot and a button posting to
the new acknowledge route — no new visual component.

**3D scene wiring** (`src/laundry-view.ts`): a machine showing someone
else's unacknowledged finished laundry gets a distinct visual indicator
(different from the normal "free to reserve" highlight — your call on
exact treatment, e.g. a different highlight colour or a small icon above
the machine) when the character is near it and holds the front `waiting`
reservation there. Interacting calls `POST /machines/:id/handoff`
immediately (no confirmation dialog first — matches how claiming from
the 2D board is already a single action), switches the character's
basket-carrying visual state to a distinct "carrying someone else's
basket" appearance (different colour/marking from the player's own
basket in 8.4a, so the two are visually distinguishable), and stores the
returned spot assignment client-side. Walking to the drop-off area and
interacting with it opens the examine-overlay pattern (reusing the
already-built `.laundry-examine-overlay` CSS/structure from Stage 7.3)
showing which spot was assigned and a "Confirm placed" button — pressing
it clears the carrying-state and closes the overlay (the actual
assignment already happened server-side at the machine interaction; this
overlay is confirmation/display, not a second server call that assigns
anything — only the drop-off area's own visible spot-occupied state needs
a client-side update, which can simply come from the next
`/laundry/machines-state`-style refetch rather than a separate call).

### Verify (Stage 8.4)

Write `spec/laundry-handoff.test.ts` (check every existing spec file's
own machine-ID comment first, per section 3's note, and document which
machine ID(s) you chose and why):

- Room A reserves and completes a wash (reaches `done`). Room B joins
  the same machine (front, `waiting`). Room B calls
  `POST /machines/:id/handoff`: succeeds, returns a spot from the fixed
  list.
- A third room, not holding the front reservation on that machine,
  attempts the same handoff: rejected (403, matching `loadOwned`'s
  existing rejection shape elsewhere in the app).
- Room A's `/my-status` now shows the `laundry_moved` notice naming the
  assigned spot.
- Room A calls `POST /reservations/:id/acknowledge-pickup`: succeeds,
  clears the notice.
- **The spot becomes reusable**: a second, independent handoff (a
  different room/machine/reservation) after the first is acknowledged
  gets a spot from the now-free pool, including possibly the exact spot
  just freed — test this explicitly, since a stale-read or off-by-one
  bug here is the single most likely defect in this feature.
- Every existing `spec/*.test.ts` file still passes unmodified — run the
  full `pnpm check`, not just the new file, before committing this stage.

Playwright screenshots: the distinct "unacknowledged laundry" indicator
on a machine, the character carrying someone else's basket (visually
distinct from carrying its own), the drop-off examine overlay showing an
assigned spot, and the drop-off shelf's own occupied-spot visual state.
Save as `research/screens/laundry-stage8-handoff-*.png`.

## 9. Documentation (in scope)

- `docs/adr/0013-laundry-handoff-authorization.md` (confirm this is
  actually the next free number — check `docs/adr/` first): the one real
  new decision, following the shape of `docs/adr/0012`: what's being
  decided (a scoped, documented exception to `loadOwned`'s general rule),
  why (per `plan.md` feature #18 and the end-to-end flow this stage
  implements), what it doesn't reopen (cross-reference ADR 0002/0004 —
  identity itself is unchanged; this is about a new authorization rule,
  not a new identity mechanism).
- `plan.md`: append (don't rewrite) a new "Current state" entry
  describing what this run shipped, and update the feature list's #18
  entry from "gap, no crit assigned" to done, with a pointer to the new
  ADR.
- `public/models/SOURCES.md` as described in section 5.
- Do **not** touch `README.md`, `PROCESS.md`, `process-notes.md`,
  `reflections/`.

## 10. `HANDOFF.md`

Append a new section (don't overwrite prior runs' entries — this repo's
`HANDOFF.md` already has sections from two prior runs; follow that
pattern) covering:

- What shipped, stage by stage, with commit hashes.
- Every judgment call made without asking, and why.
- **Every visual-judgment checkpoint that hit the 2-attempt cap** (section
  0) — exactly what was tried, what's still wrong, flagged clearly for
  the user's own follow-up pass. This is the single most important thing
  to get right in this `HANDOFF.md`, given the budget constraint — be
  thorough here even if brief elsewhere.
- Which machine ID(s) the new `spec/laundry-handoff.test.ts` uses and why
  (per section 3's instruction to check existing files first).
- Whether the automatic pointer-lock request succeeded or fell back to
  click-to-lock in this environment (section 4.1).
- The exact floor-plan sketch/description written for Stage 8.2, if not
  already fully captured in the plan file itself.
- Confirm no server is left listening on any port used this run.
- An honest accounting of scope: if budget pressure caused anything in
  this prompt to be skipped or simplified beyond what's described, say so
  plainly rather than silently delivering less than specified.

## Definition of done

- [ ] Stage 7.2: pointer lock requested automatically on entry (or
      documented fallback), corner hint tracks lock state correctly.
- [ ] Stage 7.3: QR codes are no longer large always-visible in-scene
      planes; machines show a plain placeholder at rest, highlight when
      targeted, and open a native-resolution `<img>`-based examine
      overlay on interaction — verified via a real jsQR decode of the
      overlay's actual image source.
- [ ] Stage 8.1: real CC0 GLTF models for washer, dryer, sink, a table
      (ironing/drop-off), a ceiling lamp, and a character are loaded,
      license-sourced in `public/models/SOURCES.md`, served via a new
      static route, and copied into the Docker image.
- [ ] Stage 8.2: a floor-plan sketch is committed before the layout code;
      machines have walkable space in front of them, not flush against a
      wall; the room has a ceiling and indoor point/spot lighting
      replacing Stage 6's directional "sun" as primary light.
- [ ] Stage 8.3: a third-person character (not the first-person camera)
      is what WASD/joystick input moves; the camera follows it; walk
      animation plays while moving; proximity-based highlighting
      replaces the screen-center raycast for interaction targeting.
- [ ] Stage 8.4a: the player's own basket visibility tracks their real
      reservation state (waiting/claimed/done-unacknowledged = visible,
      running = hidden).
- [ ] Stage 8.4b: the handoff feature is real — new schema via
      `drizzle-kit generate`, a documented authorization exception
      (new ADR), server-assigned (not user-chosen) spots, the full
      pickup → carry → drop-off → confirm → notify-owner →
      acknowledge → spot-freed loop works end to end against the real
      app, covered by a new passing spec file, with every pre-existing
      spec file still green.
- [ ] `src/queue.ts`'s pre-existing exported functions are behaviorally
      unchanged (new functions may be added).
- [ ] `pnpm check` green.
- [ ] No server left listening on any port used this run.
- [ ] Every visual-judgment checkpoint either passed within 2 attempts or
      is clearly flagged in `HANDOFF.md`, not silently left broken or
      endlessly retried.
- [ ] `plan.md`'s Current state appended (not rewritten); `HANDOFF.md`
      appended (not overwritten).
- [ ] `README.md`, `PROCESS.md`, `process-notes.md`, `reflections/`
      untouched.
- [ ] Nothing pushed, nothing deployed.
- [ ] Work is committed incrementally throughout, not held until the end
      — per section 0, this is a budget-risk mitigation, not a style
      preference.
- [ ] The last commit deletes `prompt.md`.
