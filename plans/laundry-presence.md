# Laundry presence plan — seeing other residents in the 3D room

## Read first

- Overall vision: [`plan.md`](../plan.md) — background, the full feature
  list, the project's multi-user requirement this stage finally makes
  *visible* in the 3D room (the data has always been multi-user; nobody
  could previously see another resident's character there).
- [`plans/3d-walkthrough.md`](3d-walkthrough.md) — the room, camera,
  character model, and interaction system this stage builds on top of,
  unchanged. Read its Stage 8.3 (third-person camera/character) and
  Stage 9.4 (if built by the time this is picked up) before touching
  `src/laundry-view.ts` — this plan adds a second *kind* of character
  (remote, not locally controlled) to a file that currently only knows
  about one.
- `docs/adr/0002-identity.md` / `docs/adr/0004-identity-format.md` —
  identity is a bare room number, never verified, remembered per browser.
  This stage reuses that exactly: a remote character's label is just
  whatever room number is on that browser's `person` cookie, the same
  trust level as every other place this app already shows a room number
  to other users (e.g. "waiting behind room304" on the 2D board).
- `src/realtime.ts` — the existing SSE tick (every 500ms, broadcasts a
  change *signal*, never state) this stage's new transport is modelled on
  the shape of but does **not** extend directly — see "Why not just reuse
  `/events`" below for why a separate channel is the right call here.
- `fly.toml` — confirms the deployment topology this plan's architecture
  depends on: **one Fly machine, `--ha=false`, no horizontal scaling**.
  This matters specifically because presence state (below) is designed as
  in-process memory, never a database table — that's only safe because
  there is provably one Node process ever running this app in production.
  If that ever changes (a second machine, a different host), this
  design's core assumption breaks and needs revisiting, not just a config
  tweak.

## Background

**What prompted this.** While reviewing Stage 9.2's finished room layout,
the user asked two linked questions: (1) is the room number a visitor
signs in with bound to the character they control in the 3D room at all
(it isn't — `laundryPage(machines)` never receives an `identity`
parameter, unlike every 2D-board rendering function in `src/views.ts`,
which all take one), and (2) why doesn't the character turn to face the
direction the camera is looking when standing still (confirmed: facing
is only updated inside the movement branch, `characterRoot.rotation.y =
Math.atan2(dx, dz)` runs only when `moving` is true).

Both observations point at the same underlying gap: the 3D room, despite
sitting on top of a fully real multi-user queue (the thing the final
project's own multi-user requirement is about), is visually
single-player. Two residents could be standing in the same real laundry
room at the same real moment, each with their own browser open to
`/laundry`, each seeing an empty room with only their own character in
it. This plan's purpose is narrow and specific: let residents actually
*see* each other in the room, which is a real, honest demonstration of
"this is a shared space," not a feature invented to pad the feature list.

**Explicitly not in scope for this plan** (keeps this from sprawling into
a second communication channel, which `plan.md`'s own standing rule
forbids — "talking is optional, never required"):
- No chat, no proximity voice, no way for one resident's browser to send
  arbitrary data to another's. The only thing transmitted is "where is
  my own character, and which way is it facing" — the same category of
  information a room number already makes public everywhere else in this
  app (ADR 0002's own stance: identity is never a secret).
- No interaction *between* two characters (no bumping, no pushing, no
  shared physics). Each browser still only collides against the static
  room geometry, never against another browser's reported position — see
  "Collision: deliberately none" below for why.
- Not a way to grow usage (no "invite a flatmate to see you in the
  room," no notification when someone else enters) — `plan.md`'s own
  rule against features that exist purely to drive engagement.

## What "presence" means here, precisely

A **presence record** is the smallest data one browser needs to publish
so every other browser can draw a reasonable stand-in for it:

```
{ identity: string, x: number, z: number, yaw: number, moving: boolean, lastSeenMs: number }
```

- `identity` — the room number from that browser's own `person` cookie
  (ADR 0004 format, already validated at `POST /identity` time — this
  plan does no new validation, it only reads a cookie that's already
  trusted everywhere else in the app).
- `x`/`z` — `characterRoot.position`'s own x/z, exactly as
  `window.__laundryDebug.getCharacterPosition()` already exposes for
  debugging. No `y` — every character in this room stays on the same
  flat floor plane (confirmed: `characterRoot.position.set(x, 0, z)`
  never varies y anywhere in the existing code).
- `yaw` — the character's own facing (`characterRoot.rotation.y`), not
  the camera's look yaw. A remote viewer needs to know which way *the
  character* faces to render it correctly; the camera rig behind it is
  purely local to the controlling browser and never transmitted.
- `moving` — whether to play the walk-cycle blend or rest on idle, so a
  remote character's animation matches what it's actually doing, not
  inferred (inferring "moving" from position deltas on the receiving end
  would lag by a full report interval and be wrong the instant a report
  is dropped — sending the boolean directly is simpler and exactly as
  cheap).
- `lastSeenMs` — **not sent by the client**; stamped by the server on
  receipt (`clock.now()`, this app's one required time-reading seam —
  `src/queue.ts`'s own rule in `CLAUDE.md` about never calling
  `Date.now()` directly doesn't apply to this new module since presence
  never touches queue/fairness logic, but using `clock.now()` anyway
  costs nothing and keeps one convention instead of two competing ones
  in the same codebase). This is what age-based cleanup (below) checks
  against — never trust a client-reported timestamp, since a parked/
  backgrounded tab could send a stale one.

One browser tab = one presence record. A resident with two tabs open to
`/laundry` on the same room number shows as two separate characters, not
merged — there is no stable per-tab identity to deduplicate on anyway
(the `person` cookie is per-browser, not per-tab), and two stray
characters from the same room number is a harmless, honest reflection of
"two tabs are actually open," not a bug to engineer around.

## Why this needs a new transport, not an extension of `/events`

`src/realtime.ts`'s existing SSE stream broadcasts **discrete change
signals** ("machine 3's queue changed, go re-fetch it") on a 500ms tick,
specifically because the underlying state (queue rows) changes rarely
and in discrete jumps — a join, a claim, a timer firing. Presence is the
opposite shape: **continuous, high-frequency, always-changing** data (a
walking character's x/z changes every frame) that every connected
browser needs a fresh copy of on a steady cadence, not "only when
something changed." Folding presence into the existing digest-diffing
tick (`lastDigest`/`digestOf` in `src/realtime.ts`) would mean either (a)
running that diff check against every connected browser's position 2+
times a second — a shape that module was never designed for and would
bloat on every unrelated queue-state tick, or (b) broadcasting positions
unconditionally on a *different* schedule from the rest of that tick,
which is already effectively a second system living inside the first
one. Building presence as its own small, explicit module is the more
honest reflection of what it actually is, not a layering violation.

**What presence reuses from `/events` rather than duplicating**: nothing
at the transport level — it gets its own SSE stream, `GET
/laundry/presence-stream` (see "Transport" below) — but conceptually it
copies the same already-proven shape (SSE out, a `setInterval` tick
driving what gets sent, a heartbeat so Fly's proxy doesn't drop an idle
connection) rather than inventing a new pattern. This is deliberate
repetition of a working shape, not a missed opportunity to share code —
the two tick loops have different jobs and different frequencies, and
trying to parameterize one function to do both would be the premature
abstraction `CLAUDE.md`'s own house style explicitly argues against ("No
half-finished implementations... don't design for hypothetical future
requirements... three similar lines is better than a premature
abstraction").

## Architecture

### New module: `src/presence.ts`

A small, explicitly in-memory, explicitly non-persistent module —
deliberately kept separate from `src/queue.ts` and never imported by it,
the same isolation `src/pickup-spots.ts` already demonstrates for a
different reason. Presence state must never be reachable from, or
confused with, anything that decides queue order or fairness.

```ts
export interface PresenceRecord {
  identity: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  lastSeenMs: number;
}

// keyed by a random per-tab session id (see "Per-tab id" below), not by
// identity — two tabs on the same room number are two independent entries
const records = new Map<string, PresenceRecord>();

export function report(tabId: string, identity: string, x: number, z: number, yaw: number, moving: boolean): void {
  records.set(tabId, { identity, x, z, yaw, moving, lastSeenMs: clock.now() });
}

export function removeStale(maxAgeMs: number): void {
  const cutoff = clock.now() - maxAgeMs;
  for (const [tabId, rec] of records) {
    if (rec.lastSeenMs < cutoff) records.delete(tabId);
  }
}

export function remove(tabId: string): void {
  records.delete(tabId);
}

export function all(): PresenceRecord[] {
  return Array.from(records.values());
}
```

**Per-tab id, not identity, as the map key.** Generated client-side once
per page load (`crypto.randomUUID()` — available in every browser this
app's own `THREE_VERSION`-pinned-CDN approach already assumes, no
polyfill needed) and sent alongside every report. This is what correctly
keeps two tabs on the same room number as two separate dots instead of
one clobbering the other's position every time both report in quick
succession. The id is never persisted, never shown to a user, and never
used for anything but map-key identity within one server process's
uptime — it is not a second identity system layered over ADR 0004's
room-number identity, it is purely a plumbing detail for this one
in-memory map.

**Why `removeStale` is pull-based (called from the broadcast tick, see
below) rather than a `setTimeout` per record**: a per-record timer is
one more thing to clear correctly on every update (re-arm on every
report, cancel on explicit removal) for no real benefit at this scale —
at most a few dozen concurrent tabs in a single laundry room's realistic
usage, scanning the whole map once per broadcast tick is cheap and
simpler to reason about, matching this codebase's own general preference
for the simplest thing that's obviously correct over a premature
optimization.

### Routes: `src/app.ts`

Two new routes, both guarded by the same `IDENTITY_COOKIE` check every
other `/laundry*` route already uses — presence data is meaningless
without knowing whose cookie is reporting it, same reasoning
`/laundry/machines-state` already applies.

```ts
// POST /laundry/presence — one browser tab's own position report.
// Fire-and-forget from the client's own perspective (no response body
// needed beyond a bare 204) — this is telemetry, not an action with a
// user-visible consequence, so there's nothing to render back.
app.post("/laundry/presence", async (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.json({ error: "sign in first" }, 400);

  const body = await c.req.json();
  // Validate shape defensively — this is the one new endpoint in the app
  // that accepts a POST body shaped by client-side JS rather than a form
  // field, so malformed/missing fields are a real possibility (a stale
  // tab mid-reload, a future client bug), not just a hostile-input worry.
  if (typeof body.tabId !== "string" || typeof body.x !== "number" || typeof body.z !== "number" || typeof body.yaw !== "number") {
    return c.json({ error: "malformed presence report" }, 400);
  }
  presence.report(body.tabId, identity, body.x, body.z, body.yaw, !!body.moving);
  return c.body(null, 204);
});

// POST /laundry/presence/leave — an explicit "I'm gone" signal, sent via
// navigator.sendBeacon on pagehide/beforeunload (see "Client: reporting"
// below) so a deliberate tab close/navigation removes the character
// immediately instead of waiting out the stale-record timeout. This is a
// best-effort nicety, not load-bearing correctness — removeStale's
// timeout-based cleanup (see below) is what actually guarantees a dead
// tab's character eventually disappears even if this never fires (a
// crashed tab, a killed browser process, a lost network connection on
// the way out).
app.post("/laundry/presence/leave", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body && typeof body.tabId === "string") presence.remove(body.tabId);
  return c.body(null, 204);
});
```

**Why a bare `POST` + a separate `GET .../presence-stream` (SSE) for the
broadcast side, instead of a request/response pair** — because every
connected browser needs every *other* browser's current positions on a
steady cadence regardless of whether it personally just reported one;
this is a broadcast-to-many, not a reply-to-one, which is exactly what
`src/realtime.ts`'s existing SSE already does for queue-state changes.

```ts
// GET /laundry/presence-stream — SSE, one stream per connected /laundry
// tab, broadcasting everyone else's current positions on a steady tick.
// Modelled on GET /events' existing shape (src/realtime.ts), but a
// separate stream and a separate Set<SSEStreamingApi> — see "Why this
// needs a new transport" above for why these two are kept apart rather
// than merged.
app.get("/laundry/presence-stream", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.text("sign in first", 400);

  return streamSSE(c, async (stream) => {
    presence.addStream(stream);
    stream.onAbort(() => presence.removeStream(stream));
    while (!stream.closed && !stream.aborted) {
      await stream.sleep(60_000);
    }
  });
});
```

### Broadcast tick: inside `src/presence.ts`, started from `app.ts`'s boot sequence

```ts
const REPORT_INTERVAL_MS = 200; // how often one client sends its own position
const BROADCAST_MS = 250;       // how often the server pushes everyone's positions out
const STALE_MS = 5_000;         // a record not refreshed in this long is dropped
const HEARTBEAT_MS = 20_000;    // same reasoning as realtime.ts's own: Fly's proxy drops a silent connection

export function startPresenceLoop(): void {
  setInterval(() => {
    removeStale(STALE_MS);
    broadcast();
  }, BROADCAST_MS);

  setInterval(() => {
    for (const stream of streams) {
      if (stream.closed) continue;
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => undefined);
    }
  }, HEARTBEAT_MS);
}

async function broadcast(): Promise<void> {
  const payload = JSON.stringify(all());
  for (const stream of streams) {
    if (stream.closed) continue;
    await stream.writeSSE({ event: "positions", data: payload }).catch(() => undefined);
  }
}
```

**Why `BROADCAST_MS` (250ms) is coarser than `REPORT_INTERVAL_MS`
(200ms)**: deliberately not 1:1 — the broadcast tick batches whatever
reports have arrived since the last tick into one payload sent to every
listener, rather than re-broadcasting on every single incoming report
(which would mean N clients reporting independently could trigger up to
N broadcasts per 200ms window, each one re-sending *everyone's* position
to *everyone* — wasteful and unbounded in the number of connected
clients). A fixed broadcast tick, independent of how many reports came
in, bounds total bandwidth to one `O(connected clients)` payload every
250ms regardless of how many clients there are reporting into it.

**Every connected browser receives its own position back too** (the
payload is everyone's records, not "everyone except you") — the client
ignores its own `tabId` on receipt rather than the server filtering per-
recipient, which would mean building a different payload per connection
instead of one shared `JSON.stringify(all())` call reused for every
listener. Trivially cheap to filter client-side; meaningfully simpler
server-side.

### Client: reporting (`src/laundry-view.ts`, inside the existing render loop)

```js
var tabId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Math.random());
var lastReportAt = 0;
var REPORT_INTERVAL_MS = 200;

function reportPresence(now) {
  if (now - lastReportAt < REPORT_INTERVAL_MS) return;
  lastReportAt = now;
  var moving = /* the same `moving` boolean the render loop already computes each frame */;
  fetch("/laundry/presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tabId: tabId, x: characterRoot.position.x, z: characterRoot.position.z, yaw: characterRoot.rotation.y, moving: moving }),
    keepalive: true, // survives a page unload that happens to race the last report
  }).catch(function () { /* a dropped report just means this tick's position arrives late/not at all — next tick corrects it */ });
}
```

Called once per frame from inside the existing `frame(now)` loop
(immediately after the existing movement-update block, so it always
reports this frame's *new* position, not last frame's), throttled to
`REPORT_INTERVAL_MS` internally rather than wrapped in a separate
`setInterval` — avoids a second timer source fighting with
`requestAnimationFrame`'s own variable cadence.

**Leave signal**, registered once at scene setup:

```js
function sendLeaveBeacon() {
  var body = JSON.stringify({ tabId: tabId });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/laundry/presence/leave", new Blob([body], { type: "application/json" }));
  }
}
window.addEventListener("pagehide", sendLeaveBeacon);
```

`sendBeacon` specifically (not a synchronous `fetch`) because it's
designed to reliably fire during page unload without blocking
navigation — the standard, well-supported pattern for exactly this "tell
the server I'm leaving" case, not a novel technique.

### Client: receiving and rendering remote characters (`src/laundry-view.ts`)

```js
var remoteCharacters = {}; // tabId -> { root: THREE.Group, mixer, walkAction, idleAction, targetX, targetZ, targetYaw }

var presenceSource = new EventSource("/laundry/presence-stream");
presenceSource.addEventListener("positions", function (e) {
  var records = JSON.parse(e.data);
  var seenTabIds = {};
  records.forEach(function (rec) {
    if (rec.tabId === tabId) return; // skip our own report, per "every browser receives its own position too" above
    seenTabIds[rec.tabId] = true;
    upsertRemoteCharacter(rec);
  });
  // remove any locally-tracked remote character no longer present in this
  // broadcast (it left, or went stale server-side) — the server's record
  // set is authoritative, the client never decides this on its own.
  Object.keys(remoteCharacters).forEach(function (id) {
    if (!seenTabIds[id]) removeRemoteCharacter(id);
  });
});
```

**`upsertRemoteCharacter(rec)`**: if `remoteCharacters[rec.tabId]`
doesn't exist yet, build one — load `character.glb` via the existing
`loadModel()`/`modelCache` path (free: the model is already cached from
loading the local player's own character, so this is an instant
`clone()`, not a second network fetch), apply the **same flat-colour
material override** the local character already uses but keyed by a
colour derived from `rec.identity` (see "Per-identity colour" below,
not the fixed `0xd9a066` the local player uses, so remote characters are
visually distinct from the local one and from each other), and —
critically, learned from Stage 9.1's own root-cause writeup, applied
*pre-emptively* here rather than waiting to rediscover the same bug —
set `frustumCulled = false` on every mesh (the stale bind-pose bounding
sphere problem applies to any animated `SkinnedMesh`, not specifically
the local player's own instance) and build its own independent
`AnimationMixer`, calling `clipAction()` **against the exact same
`walkClip`/`idleClip` objects** the local character already loaded and
fixed (no `.clone()` needed — confirmed by reading the existing code:
`gltfLoader.load("/models/character.glb", ...)`'s callback finds
`walkClip`/`idleClip` by name once via
`THREE.AnimationClip.findByName(gltf.animations, ...)`, and
`stripRootMotion()` mutates that *same* clip object's `.tracks` in
place, the one time it's called — so these module-level `walkClip`/
`idleClip` variables, once set, are already the right shared, already-
fixed objects to reuse directly). This is exactly what `AnimationMixer`'s
own API is designed to support: a mixer binds a clip's tracks to one
target's bones per `clipAction()` call, so N independent mixers can each
call `clipAction()` against the same shared `AnimationClip` object with
zero cross-talk — but this only works if `walkClip`/`idleClip` are
hoisted to variables reachable from `upsertRemoteCharacter()` (currently
they're local to the `gltfLoader.load(...)` callback's scope and go out
of scope once that callback returns — this plan's own concrete to-do for
Stage 2: lift `var walkClip, idleClip;` to the same outer scope
`walkAction`/`idleAction` already live in, and assign them inside the
existing callback instead of declaring them with `var` there). A
text-sprite room-number label (reusing `makeTextSprite(text)`'s technique
— `CanvasTexture` + `Sprite`, built in Stage 9.2 for the "DROP-OFF" sign,
no new text-rendering approach needed) floats above the head, built once
per remote character and left in place as its position updates. **Not a
direct, unmodified call to the existing `makeTextSprite()`**: that
function's canvas (512x128, opaque paper-coloured panel, `sprite.scale.set(1.6,
0.4, 1)`) was sized and styled for a large, static, floor-mounted sign
read from across a room — a small per-character floating name tag wants
a smaller scale (so it doesn't visually dominate the character it's
labelling) and likely a semi-transparent or borderless background (an
opaque panel floating above every head would look like a sign, not a
name tag). Factor the canvas-drawing logic out into a small
`buildLabelSprite(text, opts)` helper that both the drop-off sign and
this new per-character tag call with their own size/style options,
rather than copy-pasting `makeTextSprite`'s body a second time with
different constants hardcoded — exact size/opacity values still to be
tuned by screenshot, this file's established method, not derived up
front.

If the record already has a tracked character, don't snap its
`root.position`/`rotation.y` directly — set `targetX`/`targetZ`/
`targetYaw` on the tracked entry and let the render loop interpolate
toward them every frame (see "Interpolation" below). Update
`walkAction`/`idleAction` weights based on `rec.moving`, the same
weight-blend shape the local character's own walk/idle transition
already uses (`frame()`'s existing `targetWalkWeight`/`setEffectiveWeight`
lines), just driven by the received `moving` flag instead of locally
computed `forwardInput`/`strafeInput`.

**`removeRemoteCharacter(tabId)`**: `scene.remove(entry.root)`, dispose
of its label sprite's texture (`texture.dispose()` — the one real
cleanup this file needs that its existing code has never needed before,
since nothing has ever been *removed* from the scene mid-session until
now), delete the map entry.

**Interpolation, inside the existing `frame(now)` loop**, after the
existing per-frame logic:

```js
Object.keys(remoteCharacters).forEach(function (id) {
  var rc = remoteCharacters[id];
  var REMOTE_LERP = 0.25; // snappier than CAM_LERP's 0.12 — a report arrives only every ~200-250ms, so a laggier lerp would visibly trail
  rc.root.position.x += (rc.targetX - rc.root.position.x) * REMOTE_LERP;
  rc.root.position.z += (rc.targetZ - rc.root.position.z) * REMOTE_LERP;
  // yaw needs shortest-path interpolation, not a naive linear lerp — a
  // turn crossing the +-PI wraparound (e.g. from 3.0 to -3.0 radians,
  // a small real turn) would otherwise spin the long way around.
  var dYaw = ((rc.targetYaw - rc.root.rotation.y + Math.PI) % (2 * Math.PI)) - Math.PI;
  rc.root.rotation.y += dYaw * REMOTE_LERP;
  if (rc.mixer) rc.mixer.update(dt);
});
```

**The yaw-wraparound detail is written down explicitly here because it's
a real, easy-to-miss bug class** (a naive `a + (b - a) * t` lerp on an
angle breaks exactly at the wraparound boundary, producing a visible
360°-minus-a-bit spin instead of the small real turn that happened) —
not discovered by this plan through testing, caught by thinking through
the yaw representation before writing the interpolation code, per
`CLAUDE.md`'s own planning-first rule for "a bug that would only surface
by actually running it."

### Per-identity colour

```js
function colourForIdentity(identity) {
  var hash = 0;
  for (var i = 0; i < identity.length; i++) hash = (hash * 31 + identity.charCodeAt(i)) >>> 0;
  var hue = hash % 360;
  return new THREE.Color("hsl(" + hue + ", 55%, 55%)"); // fixed saturation/lightness keeps every generated colour readable against the room's own warm-neutral palette
}
```

A deterministic hash, not a random colour — the same room number always
renders the same colour across every connected browser and across a
reload, which matters for actually recognizing "that's room304 again,"
not just seeing an arbitrary colour. `identity` is always ADR
0004-validated (`room` + 1-4 digits) before it ever reaches this
function, so there's no untrusted-input concern in hashing it.

### Collision: deliberately none

A remote character is rendered but **never added to `collisionBoxes`**.
Two real reasons, both worth recording so this isn't mistaken for an
oversight later: (1) collision against a *moving* target needs
continuous re-checking against its latest interpolated position every
frame, which is a meaningfully different (and more complex) system than
this file's existing collision model, built entirely around static
boxes computed once at scene-build time; (2) even in a real shared
laundry room, two people occupying the exact same floor space for an
instant while passing each other is a normal, harmless occurrence — it
doesn't need preventing, and attempting to "solve" it by shoving one
player's local simulation sideways when a remote character's
interpolated position happens to overlap would be a visible, confusing
correction with no real benefit. Characters can visually overlap; this
is accepted, not treated as a bug.

## ADR

A new ADR, `docs/adr/0014-laundry-presence.md` (0014 is the next free
number — confirmed against `docs/adr/`'s real current contents, 0001
through 0013, before writing this), written before Stage 1's code, per
`CLAUDE.md`'s own planning-first rule for exactly this kind of decision.
Full draft, ready to use as-is or adjust lightly once written:

```markdown
# 0014: Presence state is in-memory, never persisted

## Status

Proposed.

## Context

plans/laundry-presence.md adds a way for one resident's browser to see
another resident's character moving in the shared 3D room. This needs
every connected browser's current position, continuously, which is a
different shape of state from everything else this app tracks — every
other piece of state (a reservation, a machine, a pickup spot) lives in
the SQLite database and survives a restart (plan.md's own persists
requirement). Before building this, one real decision had to be made:
does a resident's position belong in that same database, or not?

## Decision

**No persistence.** `src/presence.ts` keeps every connected browser's
last-reported position in a plain in-memory `Map`, cleared on every
server restart and never written to `src/schema.ts`/migrated via
drizzle-kit. A stale entry (no report in `STALE_MS`) is dropped on a
timer; an explicit tab close sends a best-effort leave signal for
faster cleanup, but nothing here is ever the source of truth for
"was someone in the room" after the fact.

This is only safe because of this app's actual deployment topology
(fly.toml): one Fly machine, `--ha=false`, no horizontal scaling.
Presence state living in one process's memory is complete and correct
specifically because there is only ever one process. If a future change
ever runs more than one instance of this app, this design silently
stops working (two instances would each think they're the only
source of truth, and a resident connected to instance A would never see
a resident connected to instance B) — this ADR exists partly so that
decision gets re-examined if that ever changes, not rediscovered by
debugging a confusing production symptom.

## Consequences

- A server restart (a deploy, a crash, Fly's own auto-stop-when-idle
  behaviour) clears every visible character until each browser's own
  next report/broadcast cycle repopulates it — within a few hundred
  milliseconds of reconnecting, not a data-loss concern since nothing
  here was ever meant to survive a restart.
- Presence never touches `src/queue.ts`, `src/schema.ts`, or any
  `drizzle-kit` migration — keeping it architecturally impossible for
  a position report to affect fairness, reservation state, or anything
  CLAUDE.md's test-harness rules already protect.
- Adding a second Fly machine in the future requires revisiting this
  design (likely: a shared pub/sub layer, or accepting that presence
  becomes per-instance) — not a drop-in config change.
```

## Fixing the local character's own facing, before broadcasting it

The user's second original observation (the character doesn't turn to
face the camera's own look direction while standing still) is a **local**
bug — it has nothing to do with the network/multi-user layer above, and
would be exactly as true in a world with only one character ever rendered.
It's included in this plan, not left for a separate stage, for a concrete
reason: presence broadcasts `characterRoot.rotation.y` as the `yaw` every
other browser uses to orient a remote copy of this exact character. If
the local facing logic stays as-is, every *other* resident will see a
clearly wrong thing — a character that only turns while walking and then
freezes facing some arbitrary stale direction the instant it stops,
regardless of where its own camera is actually looking. What used to be a
minor single-player quirk nobody but the local player could ever notice
becomes a visible, shared-with-everyone bug the moment presence ships —
so it has to be fixed as part of this same plan, not after.

**The fix, read directly from the existing code before writing this**:
`characterRoot.rotation.y = Math.atan2(dx, dz)` (inside `frame()`'s
`if (moving) { ... }` block) is the only place facing is ever set. The
simplest correct fix — matching this project's own established
third-person convention (facing tracks *movement* direction, not camera
look direction, documented at that exact line already) — is to **also**
set facing from `yaw` the instant movement stops, once, rather than
leaving it at its last moving value forever:

```js
var wasMoving = false; // tracked across frames, just above the frame() function
// ...inside frame(now), after the existing `if (moving) { ... }` block:
if (!moving && wasMoving) {
  // Just stopped: snap facing to match the camera's own look direction
  // once, rather than leaving it pointed wherever the last step happened
  // to aim it. Deliberately a one-time snap, not a continuous "always
  // face the camera" binding — continuously coupling facing to yaw while
  // stationary would fight this file's own established convention that
  // facing tracks *movement*, not look direction (the comment already at
  // the `Math.atan2` line above), the moment movement resumes.
  characterRoot.rotation.y = yaw;
}
wasMoving = moving;
```

This is intentionally the smallest fix that solves the actual complaint
("the character's resting pose looks like it's facing an arbitrary stale
direction") without changing this file's own documented facing-tracks-
movement convention while walking. **Not chosen**: continuously binding
`characterRoot.rotation.y = yaw` on every stationary frame — rejected
because it would make the character instantly snap-turn in place every
time the player merely moves the mouse while standing still, which reads
as twitchy/unnatural compared to a real person's actual stand-and-look
behaviour (a person's body doesn't spin to match every small head turn).
A one-time snap on the moving-to-stopped transition is the minimal,
correct middle ground — verified by screenshot before trusting this
description, per this plan's own evidence-over-guessing standard, not
assumed correct from the code alone.

This fix belongs in **Stage 2** below (it touches the same `frame()` loop
Stage 2's own presence-reporting code is added to, and should be verified
together with the first real multi-browser check, since "does the
broadcast yaw look right on a remote character" is the real test of
whether this fix actually worked — a screenshot of only the local
character's own resting pose wouldn't catch a case where the fix is
subtly wrong but happens to look fine from the controlling player's own
camera angle).

## Stages

### Stage 1 — server-side presence module and routes

- `src/presence.ts`: `PresenceRecord`, `report`/`removeStale`/`remove`/
  `all`, the `streams: Set<SSEStreamingApi>` + `addStream`/`removeStream`
  pair (mirroring `realtime.ts`'s own shape), `startPresenceLoop()`.
- `src/app.ts`: `POST /laundry/presence`, `POST /laundry/presence/leave`,
  `GET /laundry/presence-stream`, and calling `presence.startPresenceLoop()`
  alongside the existing `realtime.startRealtimeLoop()` call at boot.
- `docs/adr/0014-laundry-presence.md`, written before Stage 2's client
  code, per this plan's own "write the ADR before implementation" note
  above.
- **Verify**: a spec file (`spec/laundry-presence.test.ts`, matching this
  repo's existing `spec/*.test.ts` convention of testing the real running
  app over HTTP) that — posts two different tabIds under two different
  identities, confirms both show up in a payload read off the SSE stream;
  posts a leave for one tabId, confirms it drops out of the next
  broadcast; confirms a record with no report for longer than a short
  test-tuned stale window (inject a shorter `STALE_MS` for the test via
  the same kind of seam `clock.ts` already provides elsewhere, rather
  than waiting out the real 5-second default in a test) is dropped even
  without an explicit leave. No browser/Playwright needed for this
  stage — it's pure server behaviour.
  **Correction to an earlier draft of this plan**: checked before writing
  this — **no existing `spec/*.test.ts` file reads an SSE stream's body
  at all**, not even the pre-existing `/events` stream (every realtime
  check elsewhere in this codebase is done by polling ordinary
  non-streaming endpoints or via Playwright screenshots, never by
  reading SSE chunks in a vitest spec). There is no existing pattern to
  copy here — this is new ground, not a shortcut being skipped. A plain
  `fetch()`'s `response.body` is a web-standard `ReadableStream` in
  Node's own `fetch` implementation; the concrete approach is
  `const reader = response.body.getReader()`, decode chunks with
  `new TextDecoder().decode(...)`, and parse the accumulated text for
  `event: positions\ndata: ...\n\n`-shaped frames (SSE's plain wire
  format — no library needed, this project has never taken an SSE-client
  dependency and shouldn't start here). Budget real time in Stage 1 for
  getting this parsing loop right the first time, rather than assuming
  it is a five-minute afterthought.

### Stage 2 — client: reporting, receiving, and the local facing fix

- `src/laundry-view.ts`: `tabId` generation, `reportPresence()` wired
  into the existing `frame(now)` loop, the `pagehide` leave-beacon
  listener, the `EventSource("/laundry/presence-stream")` subscription
  and `upsertRemoteCharacter`/`removeRemoteCharacter` handling.
- **The local-facing-snap fix** from "Fixing the local character's own
  facing, before broadcasting it" above (`wasMoving` tracking, the
  `characterRoot.rotation.y = yaw` snap on the moving-to-stopped
  transition) — landed in this same stage since it's what makes the
  broadcast `yaw` this stage starts sending actually correct.
- Lift `walkClip`/`idleClip` out of the `gltfLoader.load(...)` callback's
  local scope into the same outer scope `walkAction`/`idleAction` already
  live in (the concrete to-do flagged above, under "Per-identity colour"/
  the `AnimationMixer`-sharing discussion) — needed before
  `upsertRemoteCharacter()` can reference them.
- **Verify**: **correction to an earlier draft of this plan** — checked
  before writing this: no existing `spec/*.test.ts` file uses Playwright
  or browser contexts at all; every existing multi-actor scenario (e.g.
  `spec/offer.test.ts`'s holder/candidate rooms) simulates a second
  "device" with nothing more than a second `cookie` string and a second
  `fetch()` call, via `spec/support/queue-client.ts`'s `identityCookie()`
  helper — no browser needed, since the server doesn't know or care
  whether two different cookies came from two tabs or two physical
  phones. This stage's own client-rendering logic genuinely does need a
  real browser (three.js scene state, `window.__laundryDebug`-style
  inspection), but **simulating the "other resident" does not** — one
  real Playwright page (room A, actually running the client code this
  stage adds) is enough, with room B's own position reports sent as
  plain `fetch()` POSTs to `/laundry/presence` from the test script
  itself (a second `identityCookie()`-obtained cookie, exactly like
  every other existing spec's second actor), not a second browser. This
  is simpler than two contexts, costs nothing in verification coverage
  (room A's client code can't tell the difference between a real second
  browser and a scripted `fetch` reporting the same shape of data), and
  matches this codebase's consistent preference for the simplest thing
  that actually exercises the real code path. Confirm room A's page
  shows room B's character appear after a scripted report, moves when a
  second scripted report changes position, and disappears within a
  reasonable window after a scripted leave-beacon-equivalent `POST
  /laundry/presence/leave` call (covers the explicit-leave path); a
  second check — stop sending room B's reports entirely and confirm the
  character disappears once the server's own `STALE_MS` elapses — covers
  the timeout fallback path, both need checking, not just the happy one.
  Read `remoteCharacters` back via a new debug hook
  (`window.__laundryRemoteCharacters`), the same way every other piece of
  this file's state already is exposed for Playwright inspection.
  **Also verify the facing-snap fix specifically**: walk room A's
  character, stop, rotate the camera (drag-look, once Stage 9.4 ships —
  or raw mouse-look if this lands first) to face a different direction
  than the last movement direction, and confirm (via
  `window.__laundryDebug.getCharacterPosition().yaw` compared against
  `characterRoot.rotation.y`, or a screenshot showing the character's own
  model orientation) that the character snapped to match the look
  direction once movement stopped — not continuously re-snapping on every
  small mouse movement while stationary, and not left facing the stale
  pre-stop direction either.

### Stage 3 — visual polish

- Per-identity colour (`colourForIdentity`), the floating room-number
  label sprite, yaw-wraparound-safe interpolation tuning (`REMOTE_LERP`'s
  exact value — start at 0.25 per the sketch above, tune by screenshot
  like every other constant in `plans/3d-walkthrough.md`'s own history).
- **Verify**: screenshots (the established method throughout the sibling
  3D-walkthrough plan) confirming two differently-identified remote
  characters render in visibly different colours with legible floating
  labels, a walk/idle animation blend that looks natural (not teleporting
  between report ticks), and a character turning through a wraparound
  angle rotates the short way, not the long way around.

## What this deliberately does not do

- No persistence of any presence data across a server restart — by
  design (see the ADR). A restart clears every connected browser's
  remote-character view until each tab's next report/broadcast cycle
  repopulates it, within `BROADCAST_MS`.
- No limit on how many concurrent characters can be shown — a real
  laundry room's realistic occupancy (a handful of people) never
  approaches a scale where this would matter; adding a cap now would be
  solving a problem that doesn't exist yet, the same reasoning
  `CLAUDE.md`'s house style applies against premature engineering
  elsewhere.
- No attempt to reconcile a remote character's reported position against
  this app's own collision geometry server-side (e.g. rejecting an
  impossible report) — presence is a *display* layer over an
  honor-system position report, the same trust level this whole app
  already extends to every room-number identity claim (ADR 0002/0004). A
  malicious client could report a bogus position; the worst outcome is
  seeing a character in a wall, which is a display oddity, not a
  fairness/security problem (presence never touches `queue.ts`, so it
  cannot affect who's next for a machine).
