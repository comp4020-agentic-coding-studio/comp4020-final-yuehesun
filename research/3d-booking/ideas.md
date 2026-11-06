# Implementation ideas — 3D, operable, connected to the real system

Synthesis of `prior-art.md`, `qr-interaction.md`, `tech-stack.md`, and
`webxr-scanning.md` into concrete directions. No direction is chosen here —
this is input for a decision, then a `plans/` entry gets written for
whichever one is picked.

## Shared foundation, true regardless of which idea below is picked

- **Render layer**: three.js or A-Frame, added as a `<script>` tag to a new
  Hono JSX page/route — no bundler, no change to `docs/adr/0003-tech-stack.md`.
- **Data**: the 3D scene reads the *same* live machine state `board-state.ts`
  already computes for the 2D board (status, next room, time left) — either
  via a fresh `fetch()` of a small JSON endpoint, or by reusing crit 9's
  existing SSE stream (`realtime.ts`) and updating 3D object appearance on
  each event, the same way the 2D board already re-renders on each push.
  **No new queue logic, no new source of truth** — `CLAUDE.md`'s rule that
  "the documented fairness rule is the only thing that decides turn order"
  is untouched either way, since the 3D scene only *reads* `queue.ts`'s
  output and *triggers* its existing actions (claim/start/cancel), never
  reimplements any ordering decision itself.
- **QR codes**: generated server-side with the `qrcode` npm package, one per
  machine, encoding a URL to that machine's existing claim route.
- **Scanning**: the resident's/marker's own phone camera app (Option A in
  `webxr-scanning.md`) — not an in-page scanner. This keeps the demo honest
  (it's what a real resident would do) and sidesteps Safari's missing
  `BarcodeDetector` support entirely.
- **Identity bridge**: scanning a machine's QR lands on `/identity` (our
  existing room-number entry page) if no `person` cookie is set yet, then
  continues straight to that machine's claim page — satisfying the "scan →
  land on a page that lets you act" shape Bill described, without adding any
  login/account mechanism (`docs/adr/0004-identity-format.md` untouched).

---

## Idea 1 — "Walk the room" first-person/orbit 3D scene, QR rendered on each machine

**What it feels like to use**: open a new route, e.g. `/room`, on a laptop
or the deployed phone browser. A 3D laundry room renders — ten low-poly
washer/dryer models arranged along a wall, lit, with each machine's drum
glowing a colour that matches its live status (free/unclaimed/claimed/
running — reusing the exact status vocabulary `board-state.ts` already
defines). The camera can orbit/pan around the room (`OrbitControls` in
three.js, or A-Frame's default camera rig), or — more ambitiously — be
walked through at human eye height with WASD/touch-drag, the way a first-
person walkthrough tool works. Hovering or clicking a machine pulls up a
label with its live status (same text the 2D board already shows). Each
machine also displays a QR code rendered directly in the 3D scene — a flat
textured plane positioned "on" the machine, generated server-side and
textured onto the 3D object. The marker, physically holding a phone (or
using a second device) while looking at this scene on a screen, scans that
on-screen QR code with their real camera app, which opens `/machines/:id`
in their own phone's browser — a genuinely real claim against the genuinely
deployed app.

**Tech needed**: three.js or A-Frame (CDN script tag), glTF or primitive-
shape models for the room/machines (free low-poly washer/dryer models exist
on sites like Sketchfab/Poly Pizza, or simple box-and-cylinder primitives
built directly in code — no art budget required to look intentional if kept
stylized/low-poly, following the prior-art pattern of isometric/low-poly
digital twins rather than attempting photorealism), the `qrcode` npm package
for the in-scene texture, a small JSON/SSE feed for live status.

**What's hard about it**: getting the room to actually look good (lighting,
camera framing, machine model quality) is a real design-craft task, not just
wiring — this is the part most likely to look "a generic 3D demo" if rushed,
per the prior-art finding that every shipped example kept the 3D simple and
put the design effort into the *data binding*, not the geometry. First-
person walking adds real complexity (collision/boundaries so you can't walk
through a wall) that orbit/pan mode avoids entirely for a room this size —
worth deciding orbit-vs-walk explicitly (see Isometric/top-down vs
first-person research in `prior-art.md`'s takeaway: small spaces don't
obviously benefit from full first-person).

**Ties into `queue.ts`/identity**: purely additive — a new read-only view
plus QR codes pointing at routes that already exist. No change to any
existing route's behaviour.

---

## Idea 2 — Isometric "digital twin" board (LaundryView's own idea, taken further)

**What it feels like to use**: instead of an explorable 3D space, a single
fixed isometric illustration of the whole laundry room (like LaundryView's
existing static isometric view, but *live* and *operable* instead of a
static wayfinding image) — all ten machines visible at once from one angle,
each rendered with depth/shading so it reads as a real 3D object, each
coloured/labelled by live status, each independently clickable to reveal its
QR code (e.g. a click pops a QR into a modal/panel rather than painting it
permanently into the scene). No camera movement needed — the whole value is
"see the entire room's real state at a glance, then scan the one machine
you want."

**Tech needed**: same three.js/A-Frame choice, but a fixed orthographic
camera instead of orbit controls — meaningfully less code (no camera-control
library configuration, no walk boundaries) and, per the prior-art research,
isometric views are explicitly noted as faster/cheaper to produce and more
legible for "see the whole layout at once" use cases than a walkthrough.

**What's hard about it**: less dramatic/impressive than a walkable scene —
if the goal is specifically to *wow* a marker with "I can walk into a 3D
laundry room," this idea undersells that. But it is the most direct, lowest-
risk evolution of what LaundryView already ships commercially, just made
operable (QR-to-claim) where LaundryView's own isometric view is purely
informational.

**Ties into `queue.ts`/identity**: identical to Idea 1 — read-only
visualization layer, QR-triggered navigation to existing routes.

---

## Idea 3 — Real AR-style handheld scan sequence (no pre-rendered 3D room; the "3D" *is* the live walk itself)

**What it feels like to use**: skip rendering a 3D room in the browser
entirely. Instead, physically print the QR codes (one per "virtual machine
position," e.g. ten printed cards/signs laid out in a real room, hallway, or
even just across a table at the crit) and have the marker **actually walk
up and scan a real, physical code** with their own phone, exactly as a
resident would in a real dorm laundry room — because the "3D environment" is
the real, physical space the printed codes are placed in, not a rendered
one. The web app's job is then just the thing it already does well: once
scanned, show a clean, fast, mobile-first claim page.

**Tech needed**: almost none beyond what already exists — `qrcode` npm
package to generate ten printed codes, a short physical setup (cards/signs
with each machine's code + maybe a laundry-room photo backdrop for
atmosphere).

**What's hard about it**: this is the cheapest and most reliable option, but
it's a **logistics solution, not a software one** — it directly satisfies
Bill's literal description ("pull out my phone IRL, point it at the washing
machine") but does it by changing *how the demo is staged*, not by adding
a new feature to the app. It also only works in person, not for someone
assessing the deployed URL remotely — which may or may not matter depending
on how the final project is actually marked (worth checking the final
project's marking format before leaning on this). Listed here because it's
a genuinely distinct direction — "spend the effort on staging the demo"
vs. "spend the effort on building a virtual room" — not because it's
obviously worse; for a marker physically present, it may be *more*
convincing than a rendered 3D scene, since there's no risk of the 3D
render looking rough.

**Ties into `queue.ts`/identity**: zero code changes beyond generating and
printing the QR codes — the claim flow is exactly what exists today.

---

## Idea 4 — Replay-based 3D playback (lowest-effort, extends existing crit 10 work)

**What it feels like to use**: rather than a live, operable room, extend the
already-built `/simulation` "Play the simulation" replay (crit 10 extension
Stage 14, `ReplayFrame` data, `src/views.ts`'s `REPLAY_SCRIPT`) by rendering
each frame onto a 3D room instead of a 2D table — same recorded data, same
non-interactive single playback, just a 3D visual skin. A separate,
*operable* QR-claim flow (Idea 1, 2, or 3's claim mechanism) would still
need to be built alongside this for the "real system" half of Bill's
feedback — this idea alone only addresses the "watch a day play out
spatially" half, not "operate a real claim."

**Tech needed**: same renderer choice, reusing the exact `ReplayFrame`
schema already designed and committed in `plans/crit-10.md`'s Stage 14.

**What's hard about it**: this is explicitly **not** a sufficient response
to Bill's feedback on its own — he specifically said the existing simulation
+ bots already fall short because they're not something you can "fully
demonstrate" with real action; a 3D skin on the same non-operable replay
doesn't change that underlying gap, no matter how good it looks. Including
it here only because it's a real, very low-cost add-on *worth stacking on
top of* whichever operable idea (1/2/3) gets picked — e.g. Idea 2's
isometric live board could visually double as the replay's rendering
target, reusing one 3D room asset for both the live view and the recorded
playback.

**Ties into `queue.ts`/identity**: none — this is the one idea that touches
only `sim/`-adjacent code, not the live app's claim flow at all.

---

## Recommendation (input for your decision, not a final call)

**Idea 2 (isometric, fixed-camera, operable) as the core, with Idea 3's
"use your real phone" staging layered on top at the actual crit, and Idea
4's replay skin reusing the same 3D room asset as a bonus** is the
combination I'd lean toward, for three reasons:

1. It's the direction every real shipped product in `prior-art.md`
   converged on independently (LaundryView's own isometric view, Caucus's
   3D floor plan, the RPI digital twin) — not because it's the safe
   choice, but because a fixed, legible view of the *whole* room, with
   per-object live state, is what actually reads as "this could run a real
   laundry room," which is exactly the pitch-to-the-manager framing Bill
   asked for.
2. It avoids the one real open risk in Idea 1 (first-person walkthrough) —
   that a rushed first-person scene reads as "generic 3D tech demo" rather
   than "considered interface" — without giving up any of the "operable,
   connected to the real system" substance Bill's feedback is actually
   about.
3. Idea 3's staging (scan a real, physical printed code with your own
   phone at the actual crit) directly and cheaply satisfies the most
   literal part of Bill's description, and costs nothing in app code — it's
   a staging decision for crit day, fully compatible with whichever
   rendered-room idea gets built.

If the priority is instead specifically "make the marker say wow, I'm
standing in a 3D laundry room" — independent of how directly it maps to
prior art — **Idea 1 (walkable 3D scene)** is the one to pick, accepting
the added design-craft risk named above.

## Flagged friction points against existing locked decisions

- **`docs/adr/0003-tech-stack.md`** (single Dockerfile, no build step, one
  Fly machine): **no conflict** for any idea above — three.js/A-Frame/
  PlayCanvas-web-components/`<model-viewer>` all load via CDN `<script>`
  tag from existing Hono JSX pages; React Three Fiber is the only
  considered option that would conflict (needs a bundler), and it isn't
  recommended here.
- **`docs/adr/0004-identity-format.md`** (room-number-only, no accounts, no
  login): **no conflict**, provided the QR-scan flow routes through the
  *existing* `/identity` room-number page rather than inventing a new
  "login page" (which is literally how Bill's own suggestion was worded —
  the fix is substituting our existing identity page for his "log-in page"
  wording, not building what he described verbatim).
- **`CLAUDE.md`'s fairness-order rule** ("the documented fairness rule is
  the only thing that decides turn order"): **no conflict** for any idea
  above, since every idea is either read-only (visualizing existing state)
  or a new *entry point* into existing claim/cancel/start actions — none of
  them introduce a new way to change queue position.
- **Worth a new decision, not a conflict**: if Idea 1's QR-in-3D-scene
  approach is picked, there's a genuine open design question of *where*
  physically the QR needs to be scannable from — a QR rendered inside a
  WebGL canvas, viewed on a shared screen, scanned by a second physical
  phone, is a three-hop chain (render → display → scan) that's worth a
  short dry run before trusting it at the actual crit, the same way
  `plans/crit-10.md` Stage 6 already called for a dry run of the two-
  Chrome-profile logging demo before trusting it live.
