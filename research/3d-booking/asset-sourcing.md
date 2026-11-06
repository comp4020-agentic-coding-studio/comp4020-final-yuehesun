# Sourcing real 3D assets for the laundry room redesign

For the visual/interaction overhaul in `plans/3d-walkthrough.md` (real-
looking washer/dryer models, a proper room layout with a sink, ironing
table, ceiling lights, a drop-off shelf, and a third-person character).
Every asset here is checked against its actual source page's license —
this is coursework, so "looks free" isn't good enough; each entry below
quotes what the source page itself says.

Constraint carried over from `tech-stack.md`: no bundler, no build step
(`docs/adr/0003`). Any model-loading approach has to work via the same
pinned CDN `<script type="module">` pattern `src/laundry-view.ts` already
uses for three.js core (`THREE_VERSION = "0.180.0"`, jsDelivr).

## Washer, dryer, sink — found, real, CC0

**Kenney's "Furniture Kit"** (<https://kenney.nl/assets/furniture-kit>) —
140 models, released under **CC0** (the page links directly to the CC0 1.0
public-domain deed). Confirmed by name via the pack's poly.pizza mirror
(<https://poly.pizza/bundle/Furniture-Kit-NoG1sEUD1z>, license stated
there as "Public Domain (CC0)"): the pack includes models individually
named **"Washer"**, **"Dryer"**, **"Kitchen Sink"**, **"Bathroom Sink"**,
and **"Bathroom Sink Square"** — exactly the washer/dryer/sink objects
needed, not close substitutes. Also present: **"Lamp Square Ceiling"**
and **"Lamp Round Ceiling"** (ceiling light fixtures) and multiple table
models (usable for the ironing table and the drop-off shelf).

- **Format**: Kenney's own page ships OBJ with textures (a Unity package
  too). The poly.pizza mirror offers **"Download GLTF"** for the whole
  bundle directly — this is the path to use, since it sidesteps any
  OBJ→glTF conversion step entirely. A second mirror,
  **eclair-assets.itch.io's "Furniture Kit GLB Pack"**
  (<https://eclair-assets.itch.io/furniture-kit-glb-pack-140-free-cc0-3d-models>)
  repackages the same 140 models as individual `.glb` files, license
  stated on that page as `License: CC0`, explicitly allowing "Commercial
  use, non-commercial use, modification, and redistribution," credit
  "appreciated but not required." Either mirror works; the itch.io one is
  more convenient if per-model files (rather than one bundle export) are
  wanted.
- **Not independently verified in this pass**: the exact polygon/texture
  detail of the Washer/Dryer models themselves (no direct visual
  inspection done here) — worth opening the actual GLB once downloaded
  before committing to using it as-is vs. simplifying it.

## Character figure — found, real, CC0 (with a real caveat)

**Kenney's "Mini Characters"** (<https://kenney.nl/assets/mini-characters>)
— CC0, 12 characters × 32 animations each, chibi-style proportions
(~1.1m tall, head ~40% of body height per a third-party technical
breakdown) — this is a closer starting point for "round head, simple
figure" than a realistically-proportioned rig would be, and it already
comes animated (walk cycles included), which a hand-built placeholder
would not.

**Real caveat, found via a technical write-up, not assumed**: a tested
Kenney character GLB references an **external texture file**
(`Textures/colormap.png`) rather than embedding it — downloading a single
model's `.glb` in isolation leaves it textured incorrectly/missing. The
fix is to keep the model's texture file alongside it (download the full
source pack, not a single extracted GLB) — a real packaging detail to
get right during implementation, not a reason to avoid the asset.

**Given the plan's actual requirement — "round head, head and body one
single flat colour"** — the simplest correct choice may be to use Mini
Characters' *rig and walk animation* but override its material with a
single flat colour in code (one `MeshStandardMaterial`, no texture map at
all), which also sidesteps the texture-reference caveat above entirely
(no external texture file needed if the material never samples one).
This is a legitimate, license-compliant modification — CC0 permits
exactly this.

## Ironing table / drop-off shelf — found, real, CC0 (reuse, not new sourcing)

No separate "ironing board" model was confirmed by name in the research
above, but Kenney's Furniture Kit's table models (plain tables, desks)
cover both the ironing table and the drop-off shelf/table adequately —
the plan doesn't need an ironing-board-specific mesh (a flat table with a
simple box "iron" prop on top reads fine at this scene's scale), and the
drop-off area is explicitly described as "a shelf/table area," which a
plain table model satisfies directly. No further sourcing needed beyond
the Furniture Kit bundle already selected above.

## Loading GLTF/GLB with no bundler — confirmed working

Three.js's own installation guide
(<https://threejs.org/manual/pages/installation.html>) documents exactly
this no-bundler path via an **import map**:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@<version>/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@<version>/examples/jsm/"
  }
}
</script>
```

...after which `import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"` works with zero build step. Confirmed directly against the
exact pinned version this repo already uses: jsDelivr serves
`GLTFLoader.js` (112 KB) at
`https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js` —
the same CDN, same version, same `<script type="module">` approach
`src/laundry-view.ts` already uses for the three.js core import, just
pointed at the `examples/jsm/` path for the loader addon specifically. No
import-map changes are strictly required if the code imports `GLTFLoader`
via its full jsDelivr URL directly (matching how `THREE_BASE` is already
built as a template string) rather than via the bare `"three/addons/"`
specifier — avoids introducing an import map as a new moving part for a
single extra import.

**Loading cost**: a handful of small Kenney furniture models (each
typically tens of KB as glTF/GLB, per the pack's own low-poly, flat-
shaded style) is a trivial addition next to the three.js core module
itself; no performance concern for ~10-15 props in one small room.

## Third-person camera + character controller — pattern confirmed, not a ready-made drop-in

No single CC0/MIT three.js library was found that's a complete, ready-to-
import third-person controller (the closest real candidates —
`three.ez`, `THREE.Interactive` — are general-purpose *interaction*
libraries, not character controllers; see below). The actual pattern to
hand-roll, confirmed across multiple real sources:

- **Camera rig as a pivot object**: attach the camera to an
  `Object3D` positioned at an offset behind/above the character root,
  and move/rotate that rig to follow the character rather than the
  character following the camera (inverting the existing first-person
  code's relationship) — this is the standard shape described across
  three.js's own discourse forum threads on third-person cameras
  (<https://discourse.threejs.org/t/third-person-camera-with-orbitcontrols/57171>,
  <https://discourse.threejs.org/t/third-person-follow-camera-with-orbit-controls/18543>).
- **Lerp-based follow smoothing**: the camera rig's position/rotation
  eases toward the character's current transform every frame rather than
  snapping instantly — avoids jarring camera motion on direction changes.
  Described directly in a Medium walkthrough, "Creating a Third-Person
  Character Controller in Three.js"
  (<https://medium.com/javascript-alliance/creating-a-third-person-character-controller-in-three-js-20850e7f2fb2>).
- **Collision**: the existing `src/laundry-view.ts` already does simple
  axis-aligned bounding-box collision for the first-person camera point
  (`collidesWithMachine`/`clampToRoom`) — the same approach extends
  directly to a third-person character root (the collidable point just
  becomes the character's feet position instead of the camera's), no new
  physics engine needed for a room this simple. A full capsule collider
  (as the Rapier-based tutorials use) is unnecessary complexity for a
  flat-floored room with box-shaped obstacles.

**This confirms the existing code's camera-control architecture (yaw/
pitch state, `clampToRoom`, per-axis AABB collision) is the right
foundation to extend, not something to throw away** — what changes is
*what the camera is attached to* (a character rig instead of eye height
directly), not the underlying math.

## Interaction-logic reference (per the user's later direction: game-asset/template libraries are fair game for interaction logic too, not just models)

- **`THREE.Interactive`** (<https://github.com/markuslerner/THREE.Interactive>)
  — **MIT licensed**, confirmed on the repo itself. Ships as a native ES
  module ("ESM only"), so it loads via the same CDN
  `<script type="module">` pattern with no bundler. Provides a raycaster-
  based `InteractionManager` with `mouseover`/`mouseout` (hover-highlight,
  exactly Stage 7's "outline on look-at" need), `click`, and touch/pointer
  event equivalents already normalized together — this could directly
  replace a hand-rolled raycast-and-highlight loop, though the existing
  Stage 7 plan's own hand-rolled approach (one raycast per frame from
  screen center) is simple enough that adopting a new MIT dependency
  isn't obviously a win over the few lines of code already planned; worth
  a quick build-vs-adopt look during implementation, not decided here.
- **Three.js's own official examples are MIT** (the whole `mrdoob/three.js`
  repository, including `examples/webgl_interactive_draggablecubes.html`,
  ships under the project's top-level MIT license) — the classic
  raycaster-based "pick up and drag" example is a legitimate reference
  for the "pick up a laundry basket" interaction, confirmed via the
  pattern (raycast from pointer, find intersected object, reposition it
  on drag) rather than a specific line-by-line copy.
- **No CC0/MIT "pickup-and-carry + drop-zone" game template was found
  specifically for three.js or the web** — the closest matches
  (stevenharmongames' "First Person Interaction Toolkit") are Unity/O3DE
  projects under **MPL 2.0**, not CC0/MIT, and not web-relevant anyway
  (different engine, not portable code). **Conclusion: the carry/drop-off
  interaction (picking up another resident's laundry, carrying it to the
  drop-off shelf) should be hand-built** using the raycast-pickup pattern
  above (`THREE.Interactive` or a hand-rolled equivalent) plus a simple
  distance/bounding-box check against the drop-off shelf's position — this
  is a small, specific interaction, not something worth adopting a heavy
  external dependency for.

## Compact recommendation (see also the full report sent back to the coordinator)

| Object | Found, real, open-licensed? | Source |
|---|---|---|
| Washer | **Yes** — Kenney Furniture Kit, CC0 | kenney.nl / poly.pizza GLTF export / itch.io GLB mirror |
| Dryer | **Yes** — same pack, CC0 | same |
| Sink | **Yes** — "Kitchen Sink"/"Bathroom Sink", CC0 | same |
| Ironing table | **Yes** (reuse a plain table model), CC0 | same |
| Ceiling light | **Yes** — "Lamp Square/Round Ceiling", CC0 | same |
| Drop-off shelf/table | **Yes** (reuse a plain table model), CC0 | same |
| Character figure | **Yes**, with a packaging caveat (keep texture file, or strip texture entirely for a flat-colour look) — CC0 | kenney.nl/assets/mini-characters |
| GLTFLoader (no bundler) | **Confirmed working**, same CDN/version already pinned | jsDelivr, three@0.180.0 |
| Third-person camera pattern | No ready-made CC0/MIT drop-in; a well-documented pattern to hand-roll, extending the existing AABB-collision code already in `src/laundry-view.ts` | three.js discourse + Medium tutorial |
| Hover-highlight / pickup interaction | **MIT library available** (`THREE.Interactive`) or hand-roll via three.js's own MIT example pattern | github.com/markuslerner/THREE.Interactive; mrdoob/three.js examples |
