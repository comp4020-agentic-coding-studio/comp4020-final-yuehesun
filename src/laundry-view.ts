import { html, raw } from "hono/html";
import type { Machine } from "./schema.ts";
import type { QueueRow } from "./queue.ts";
import { DRYING_TYPES } from "./drying-types.ts";
import { WASHING_TYPES } from "./washing-types.ts";
import { identityPage, machineCard, page, type Html } from "./views.ts";
import { layoutRoom } from "./laundry-layout.ts";

// plans/3d-walkthrough.md: a third-person 3D walkthrough of the laundry
// room, reachable from the home page at any time (not gated on having a
// reservation — docs/adr/0012's sibling decision in the plan). Split into
// its own file rather than growing the already-large src/views.ts further,
// the same reason src/board-state.ts was split out.
//
// Stage 8 rewrote this from Stage 1-7's first-person camera-is-the-player
// model into a real explorable room: a character the player moves (instead
// of the camera directly), real CC0 GLTF models (public/models/, see
// SOURCES.md) instead of placeholder boxes, and proximity-based
// interaction (instead of a screen-center raycast, which only made sense
// for a first-person "crosshair" convention). Machine *positions* are
// computed client-side from the same {id, label, type} list the server
// already has (one JSON data island below), so live state binds onto
// these same objects by id with no layout change, and the layout
// automatically adapts if the machine count ever changes.

// Pinned three.js version (checked against jsDelivr at the time this was
// written) — no bundler, loaded as a native ES module directly from the
// CDN, per docs/adr/0012 / research/3d-booking/tech-stack.md's "no build
// step" constraint. Pinning one exact version (not "latest") so a CDN
// update elsewhere can't silently change this scene's behaviour. GLTFLoader
// is imported the same way, from the same CDN/version, confirmed working
// with zero bundler in research/3d-booking/asset-sourcing.md.
const THREE_VERSION = "0.180.0";
const THREE_BASE = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

// GLTFLoader.js's own source imports THREE via the bare specifier "three"
// (confirmed by inspecting the fetched file before relying on this), which
// only resolves with an import map in scope — the three.js core module
// itself is still imported by full URL below, matching THREE_BASE's
// existing construction; the import map exists solely so the *loader
// addon's own internal import* has something to resolve against.
const IMPORT_MAP = `{"imports": {"three": "${THREE_BASE}/build/three.module.js"}}`;

const LAUNDRY_SCRIPT = `
import * as THREE from "${THREE_BASE}/build/three.module.js";
import { GLTFLoader } from "${THREE_BASE}/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "${THREE_BASE}/examples/jsm/utils/SkeletonUtils.js";

(function () {
  var wrap = document.getElementById("laundry-canvas-wrap");
  var dataEl = document.getElementById("laundry-machines");
  if (!wrap || !dataEl) return;
  var pageData = JSON.parse(dataEl.textContent || "{}");
  var machines = pageData.machines || [];

  // --- Stage 9.2 floor plan (plans/3d-walkthrough.md's own
  // user-confirmed sketch, replacing Stage 8.2's single-wall layout
  // entirely): machines split across two walls (north -Z, east +X); the
  // whole west wall (-X) is the drop-off/public zone; sink+ironing merge
  // into one free-standing island in open floor, not against any wall;
  // spawn/entry at the south wall (+Z). Stage 9.5: this geometry (room
  // size, wall positions, each machine's x/z/facing) is computed once,
  // server-side, by src/laundry-layout.ts's layoutRoom() — not
  // recomputed here — so a non-browser test (spec/laundry-layout.test.ts)
  // can check the same numbers this scene actually renders, instead of a
  // second hand-copied version of this arithmetic that could silently
  // drift from the real one. ---
  var layout = pageData.layout;
  var roomHalfWidth = layout.roomHalfWidth;
  var roomHalfDepth = layout.roomHalfDepth;
  var northZ = layout.northZ;
  var eastX = layout.eastX;
  var westX = layout.westX;
  var southZ = layout.southZ;
  // placedMachines is north-wall-then-east-wall, not machines[]'s own id
  // order — every lookup below keys off p.id, never array index, so this
  // reordering can't misplace a machine's live state or QR link.
  var placedMachines = layout.placedMachines;
  var orderedMachines = placedMachines.map(function (p) {
    return machines.find(function (m) { return m.id === p.id; });
  });

  // A rough waist-ish height for things that aren't the machine models
  // themselves (the drop-off anchor, the unclaimed-laundry marker above a
  // machine) — not used for the machine models' own placement, which uses
  // each model's real measured bbox (footprintOf) instead, per this
  // stage's own bbox-measurement fix below.
  var GENERIC_WAIST_HEIGHT = 0.9;

  // --- renderer / scene / camera ---
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f3ec); // --paper
  scene.fog = new THREE.Fog(0xf6f3ec, 9, 24);

  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.appendChild(renderer.domElement);

  function resize() {
    var w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / (h || 1);
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  // --- lighting: Stage 8.2 replaces Stage 6's single directional "sun"
  // (which read as sunlight through a solid ceiling, wrong for an indoor
  // room) with ceiling point lights at each lamp fixture's position,
  // tuned to the same warm palette. A low ambient keeps shadowed corners
  // from going fully black. ---
  scene.add(new THREE.AmbientLight(0xfff4e0, 0.45));
  // A soft hemisphere light reads more like real indoor bounce lighting
  // than ambient alone (ambient lights every surface identically
  // regardless of orientation, which is part of why the room read flat in
  // this stage's own first screenshot check) — sky colour close to the
  // ceiling paint, ground colour close to the floor tone. Kept deliberately
  // subtle: an earlier attempt at 0.75 ambient + 0.5 hemisphere + strong
  // point lights blew the whole scene out to white, confirmed by this
  // stage's own screenshot check — three additive light sources compound
  // fast, so each needs tuning down together, not just the one that looks
  // wrong in isolation.
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0xded7c8, 0.25));

  // --- room shell: floor, four walls, a ceiling (Stage 8.2 — Stage 1 had
  // no ceiling at all, an open-topped box). ---
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomHalfWidth * 2, roomHalfDepth * 2),
    new THREE.MeshStandardMaterial({ color: 0xded7c8, roughness: 0.9 }), // --rule
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  var wallHeight = 2.6;
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.95 }); // --paper
  function addWall(x, z, w, d) {
    var wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
    wall.position.set(x, wallHeight / 2, z);
    wall.receiveShadow = true;
    scene.add(wall);
    return wall;
  }
  addWall(0, -roomHalfDepth, roomHalfWidth * 2, 0.15);
  addWall(-roomHalfWidth, 0, 0.15, roomHalfDepth * 2);
  addWall(roomHalfWidth, 0, 0.15, roomHalfDepth * 2);

  // Stage 10: a door on the south wall, directly behind the character's
  // own spawn point (southZ) — the wall a resident would actually be
  // facing on walking in. The wall itself is split into two side segments
  // (not one full-width wall) so there's a real gap, not a painted-on
  // door that still blocks movement; this doesn't need its own collision
  // box since none of the four room walls are in collisionBoxes at all —
  // the room boundary is clampToRoom's own roomHalfWidth/roomHalfDepth
  // range, not per-wall boxes, so a gap here is purely visual and doesn't
  // risk letting the character walk through the *wall* on either side of
  // it (clampToRoom still stops at roomHalfDepth regardless).
  var DOOR_WIDTH = 1.1, DOOR_HEIGHT = 2.1;
  var doorSideWidth = (roomHalfWidth * 2 - DOOR_WIDTH) / 2;
  addWall(-(DOOR_WIDTH / 2 + doorSideWidth / 2), roomHalfDepth, doorSideWidth, 0.15);
  addWall(DOOR_WIDTH / 2 + doorSideWidth / 2, roomHalfDepth, doorSideWidth, 0.15);
  // A lintel above the doorway, closing the gap between the door's own
  // height and the room's full wallHeight, so the opening doesn't read as
  // a full-height missing wall segment.
  var lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH, wallHeight - DOOR_HEIGHT, 0.15), wallMat);
  lintel.position.set(0, DOOR_HEIGHT + (wallHeight - DOOR_HEIGHT) / 2, roomHalfDepth);
  lintel.receiveShadow = true;
  scene.add(lintel);

  // A simple panel door, inset slightly into the doorway (not flush with
  // the wall's own face) and shown mostly closed — reads as a real door
  // rather than an empty doorway, without needing a hinge/open-close
  // interaction the room doesn't otherwise support for anything else.
  //
  // Real bug fixed here: the door panel used to be centered at
  // DOOR_WIDTH * 0.08 (0.088 for DOOR_WIDTH=1.1) instead of 0 — the
  // doorway gap itself (the two side walls above) is centered on x=0, so
  // that offset pushed the panel visibly off-center within its own frame,
  // reading as "the door and frame don't line up." DOOR_PANEL_WIDTH/
  // DOOR_PANEL_HEIGHT are named here (not inlined into the geometry call)
  // specifically so the handle's own x position below is derived from the
  // same panel width, not a second hand-copied fraction that could drift
  // from it the same way the original offset did.
  var DOOR_PANEL_WIDTH = DOOR_WIDTH * 0.92, DOOR_PANEL_HEIGHT = DOOR_HEIGHT * 0.97;
  var doorMat = new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.7 }); // a wood tone distinct from --paper walls
  var door = new THREE.Mesh(new THREE.BoxGeometry(DOOR_PANEL_WIDTH, DOOR_PANEL_HEIGHT, 0.06), doorMat);
  door.position.set(0, DOOR_PANEL_HEIGHT / 2, roomHalfDepth - 0.05);
  door.castShadow = true;
  door.receiveShadow = true;
  scene.add(door);
  var doorHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0x9aa7b0, metalness: 0.6, roughness: 0.4 }),
  );
  doorHandle.rotation.z = Math.PI / 2;
  doorHandle.position.set(-DOOR_PANEL_WIDTH * 0.35, DOOR_PANEL_HEIGHT * 0.5, roomHalfDepth - 0.08);
  scene.add(doorHandle);

  var ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(roomHalfWidth * 2, roomHalfDepth * 2),
    new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 1, side: THREE.DoubleSide }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = wallHeight;
  scene.add(ceiling);

  // --- generic axis-aligned collision, extended in Stage 8.2 to cover
  // every solid prop (sink, tables), not just machines — the character's
  // feet position is checked against this list, same shape as Stage 1's
  // original machine-only collidesWithMachine/clampToRoom. ---
  var PLAYER_RADIUS = 0.3;
  var collisionBoxes = [];
  function addCollisionBox(cx, cz, w, d) {
    collisionBoxes.push({
      minX: cx - w / 2 - PLAYER_RADIUS, maxX: cx + w / 2 + PLAYER_RADIUS,
      minZ: cz - d / 2 - PLAYER_RADIUS, maxZ: cz + d / 2 + PLAYER_RADIUS,
    });
  }

  // --- GLTF loading: one shared loader, a small cache keyed by URL so
  // placing several copies of the same model (e.g. every washer) only
  // fetches/parses it once — clone() reuses the parsed geometry/material
  // graph cheaply for each placed instance.
  //
  // Real bug found investigating the "character doesn't visibly move"
  // report: plain Object3D.clone(true) (three.js's generic clone, used
  // here until now) does NOT correctly clone a rigged/skinned model.
  // THREE.SkinnedMesh.copy() (which Object3D.clone() calls internally)
  // assigns this.skeleton = source.skeleton — a bare reference, not a
  // deep copy — so every clone of character.glb kept pointing at the
  // one skeleton object that lives on the cached, never-added-to-the-
  // scene original gltf.scene. That original's bones are never moved by
  // anything (characterRoot.position is what this file actually drives),
  // so the bones stay frozen at the origin forever — the mesh's own
  // bounding box reflects characterRoot's position correctly, but the
  // skinned mesh's actual rendered shape is driven by the frozen bones,
  // which is why the character visually never seemed to move even though
  // every position variable this file tracks was provably correct.
  // Confirmed directly: skeleton.bones[0].getWorldPosition() stayed at
  // [0,0,0] regardless of characterRoot.position, and the root bone's own
  // parent chain never included characterRoot at all. SkeletonUtils.clone
  // (three.js's own addon specifically for this) deep-clones the skeleton
  // and rebinds every SkinnedMesh to its own cloned bones; it's a safe
  // drop-in for loadModel()'s existing non-skinned models too (furniture/
  // machines), since it clones a plain Object3D graph identically to
  // Object3D.clone() when there's no skeleton to rebind.
  var gltfLoader = new GLTFLoader();
  var modelCache = {};

  // Retries a failed GLTF load a few times before giving up — found
  // investigating a real user report: the character's walk/idle
  // animations never played at all on one real page load, self-resolving
  // on a later reload with no code change. Fly.io's "stop when idle, cold
  // start on the next request" deploy mode (fly.toml's
  // auto_stop_machines) means the very first request after a cold start
  // can hit a flaky network moment neither this file nor the browser's
  // own HTTP stack retries on its own — gltfLoader.load()'s error
  // callback here used to just console.error and give up silently (for
  // character.glb's own animation-data load, there wasn't even an error
  // callback at all, so a failure was invisible and permanent for that
  // page load). A few retries with a short backoff covers a transient
  // blip without masking a genuinely broken/missing file (which will
  // still fail after every retry and log clearly).
  var LOAD_RETRY_ATTEMPTS = 3;
  var LOAD_RETRY_DELAY_MS = 400;
  function loadGltfWithRetry(url, onSuccess, onFailure) {
    var attempt = 0;
    function tryLoad() {
      attempt++;
      gltfLoader.load(url, onSuccess, undefined, function (err) {
        if (attempt < LOAD_RETRY_ATTEMPTS) {
          console.warn("retrying " + url + " after load failure (attempt " + attempt + "/" + LOAD_RETRY_ATTEMPTS + ")", err);
          setTimeout(tryLoad, LOAD_RETRY_DELAY_MS);
        } else {
          console.error("failed to load " + url + " after " + LOAD_RETRY_ATTEMPTS + " attempts", err);
          if (onFailure) onFailure(err);
        }
      });
    }
    tryLoad();
  }

  function loadModel(url, onReady) {
    if (modelCache[url]) { onReady(cloneSkinned(modelCache[url].scene)); return; }
    loadGltfWithRetry(url, function (gltf) {
      modelCache[url] = gltf;
      onReady(cloneSkinned(gltf.scene));
    });
  }

  // Every real GLTF furniture model's bounding box, measured directly
  // (Box3().setFromObject() against the actual downloaded file, not
  // estimated) before writing any placement code — the exact
  // {min:[x,y,z], max:[x,y,z]} each model reports, in its own local
  // space, corner-origin (not centered — confirmed the same way). A real
  // bug this stage hit twice before measuring properly: guessing an
  // approximate "footprint" (w/d numbers that merely looked plausible)
  // repeatedly placed the status light and examine anchor outside the
  // model's real geometry, invisible from any angle. Using the measured
  // bbox directly removes the guessing entirely — "the front face" is
  // bbox.max.z, exactly, not an approximation of it.
  var MODEL_BBOX = {
    washer: { min: [0, 0, -0.35], max: [0.39, 0.47, 0.04] },
    dryer: { min: [0, 0, -0.35], max: [0.39, 0.47, 0.03] },
    bookcase: { min: [0, 0, -0.25], max: [0.4, 0.88, 0] }, // bookcaseOpen.glb, measured the same way (Stage 9.2)
    // Stage 10: real measured bbox for kitchenSink.glb/table.glb
    // (Box3().setFromObject() against the actual files, same technique as
    // every other entry here) — added because the island's own collision
    // boxes (below) used to be built from a hand-picked center point that
    // never matched where these two models actually render (see the
    // sink/table placement comment below for the root-cause writeup); a
    // real MODEL_BBOX entry is what lets them use the exact same
    // corner-origin-aware placement convention the machines already do.
    sink: { min: [0, 0, -0.45], max: [0.43, 0.49, 0] },
    table: { min: [0, 0, -0.447373331], max: [0.841487944, 0.326733977, 0] },
  };
  // Stage 9.4.4: washers/dryers are rendered deliberately larger than
  // their real measured size — the "oversized interactable" convention
  // many open-world/sim games use so a key object's state/detail reads
  // at a glance, trading literal human-scale realism for legibility. Not
  // a uniform scene scale: the character, room shell, bookcases and
  // island are all unaffected (MACHINE_SCALE is applied only for the
  // "washer"/"dryer" types below, never "bookcase"). Checked against
  // SPACING (1.6) and wallHeight (2.6) before picking 1.8 — see
  // plans/3d-walkthrough.md Stage 9.4.4 for the floor-space/ceiling-
  // clearance arithmetic that confirmed this doesn't need a room-size or
  // spacing change.
  var MACHINE_SCALE = 1.8;
  // Stage 10: the sink/ironing-table island is background detail, not
  // something a resident acts on the way they do a machine's QR/claim —
  // it doesn't need MACHINE_SCALE's own "reads at a glance from across
  // the room" treatment, just enough of a bump that it doesn't look
  // undersized next to the now-1.8x machines. A smaller, separately
  // tuned factor, checked against ISLAND_CLEARANCE (2.4, in
  // src/laundry-layout.ts) before picking 1.3: the island's own two
  // models (sink 0.43x0.45, table 0.84x0.45) at 1.3x scale fit well
  // inside that clearance with walking room to spare on every side.
  var DECOR_SCALE = 1.3;
  function footprintOf(type) {
    var b = MODEL_BBOX[type] || MODEL_BBOX.washer;
    var scale = (type === "washer" || type === "dryer") ? MACHINE_SCALE : (type === "sink" || type === "table") ? DECOR_SCALE : 1;
    return {
      w: (b.max[0] - b.min[0]) * scale,
      d: (b.max[2] - b.min[2]) * scale,
      frontZ: b.max[2] * scale,
      h: b.max[1] * scale,
      scale: scale, // the one place model-placement code below reads this, so modelRoot.scale and every derived position stay consistent with a single source of truth
    };
  }

  // --- machines: real washer.glb/dryer.glb models, tagged with their
  // real id so live state (below) can find them again. Each model's own
  // origin sits at a floor corner, not its center (confirmed in the
  // isolated preview before writing this) — wrapped in a THREE.Group
  // whose origin IS the floor-center placement point, with the model
  // offset within that group by -w/2,-d/2, so every other piece of code
  // here (collision, placement, the examine-target anchor) can keep
  // treating "position" as floor-center, matching Stage 1's original
  // convention, with the corner-origin quirk isolated to one offset
  // right here.
  //
  // Live state is shown via a small status-light disc on the machine's
  // face, NOT by recolouring the model itself — a real finding from this
  // stage's own screenshot check: overriding every sub-mesh's material to
  // a flat state colour (the approach Stage 1-7's placeholder boxes used,
  // where "the whole box" and "the status colour" were the same surface)
  // completely erases a real model's own detail on a multi-material mesh
  // like washer.glb (door, panel, glass all become one indistinguishable
  // green block). A status light is how a real appliance shows status
  // anyway, so this is a better fit for the medium, not just a technical
  // workaround. ---
  var machineGroups = {}; // machineId -> THREE.Group
  var statusLights = {}; // machineId -> Mesh, the thing live state actually recolours
  var qrAnchors = {}; // machineId -> THREE.Object3D, the point the examine overlay's "you are here" check uses
  var mineMarkers = {}; // machineId -> Mesh, Stage 10's "this machine is yours" downward marker

  placedMachines.forEach(function (p) {
    var type = p.type === "dryer" ? "dryer" : "washer";
    var bbox = MODEL_BBOX[type];
    var footprint = footprintOf(type);
    // A machine rotated 90° (the east wall) has its local w/d swapped in
    // world X/Z — addCollisionBox is axis-aligned in world space, so the
    // east-wall branch below passes (d, w), not (w, d). Written down in
    // plans/3d-walkthrough.md's own Stage 9.2 section before this code was
    // written, as the one orientation bug that wouldn't show up in a
    // static screenshot, only once someone actually walks that wall.
    if (p.wall === "east") {
      addCollisionBox(p.x, p.z, footprint.d, footprint.w);
    } else {
      addCollisionBox(p.x, p.z, footprint.w, footprint.d);
    }

    var group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.rotation.y = p.facing;
    group.userData.machineId = p.id;
    scene.add(group);
    machineGroups[p.id] = group;

    // The model root is offset by the *negative of its own measured
    // bbox min, scaled* — not a symmetric "-w/2" guess — this is what
    // makes "position" on the group mean "the model's true horizontal
    // center, floor-level" exactly, regardless of where the model's own
    // corner origin happens to sit relative to its geometry. Confirmed
    // necessary by this stage's own bbox measurement: the model is NOT
    // symmetric around its origin (min.x is 0, not -w/2), so halving
    // width/depth and negating was silently wrong even though it looked
    // like a reasonable centering formula. Stage 9.4.4: bbox.min itself
    // is still the raw unscaled measurement (MODEL_BBOX never changes),
    // so it's multiplied by footprint.scale here to land in the same
    // scaled units footprint.w/d already are — modelRoot.scale is set to
    // the same factor below, so the model's own geometry and this
    // centering offset agree on what "scaled" means.
    var url = "/models/" + type + ".glb";
    loadModel(url, function (modelRoot) {
      modelRoot.scale.setScalar(footprint.scale);
      modelRoot.position.set(
        -bbox.min[0] * footprint.scale - footprint.w / 2,
        0,
        -bbox.min[2] * footprint.scale - footprint.d / 2,
      );
      modelRoot.traverse(function (node) {
        if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
      });
      group.add(modelRoot);
    });

    // Status light placement — Stage 9.4.3 replaces the free-standing
    // stalk+sphere (Stage 8.2's workaround, kept below in history) with a
    // small disc flush-mounted on the model's own front face, in the top
    // corner away from the door. The earlier stalk existed specifically
    // because a *center* mount close to the door kept getting wedged
    // against the door's own raised panel (a bounding-box check can't see
    // that it sits proud of the body by a few millimetres) — but the
    // model's front face is not entirely door: the circular door only
    // occupies roughly the lower-center two-thirds, leaving a real flat
    // strip across the top (the control-panel area) and flat corners
    // beside the door at any height. A corner mount, high on that flat
    // strip, doesn't go near the door geometry the center mount collided
    // with, so it can sit genuinely flush rather than needing the old
    // stand-off distance.
    //
    // Group-local z: the model's own front face (the door, bbox.max.z)
    // always lands at local z = +footprint.d/2 after the centering
    // translation above, and (Stage 9.5) p.facing is now derived from
    // each wall's own interior direction (src/laundry-layout.ts's
    // facingToward), so local +Z reliably points into the room on every
    // wall — a plain "+footprint.d/2" is correct everywhere with no
    // per-wall sign needed. (Stage 9.4.3 had instead patched this with a
    // per-wall frontSign flip on this offset, which happened to make the
    // light/anchor land on the room side even though the model's own
    // rotation (p.facing) was still wrong on the north wall; Stage 9.5
    // fixed facing itself and removed frontSign as redundant, see
    // plans/3d-walkthrough.md Stage 9.5.)
    var lightRadius = footprint.w * 0.1;
    var statusLight = new THREE.Mesh(
      new THREE.CylinderGeometry(lightRadius, lightRadius, 0.02, 20),
      new THREE.MeshStandardMaterial({ color: 0x9aa7b0, emissive: 0x9aa7b0, emissiveIntensity: 1.2 }),
    );
    statusLight.rotation.x = Math.PI / 2; // cylinder's flat circular face points along the model's own front, not +Y
    // (footprint.w * 0.32, footprint.h * 0.76) confirmed against an
    // isolated preview of washer.glb with height-fraction reference
    // lines overlaid at 0.68-0.82 — 0.88 (the first value tried) landed
    // on the model's sloped top-panel transition, not the flat front
    // face, and was mostly hidden; 0.76 sits cleanly inside the flat
    // control-panel strip, confirmed by that same preview screenshot.
    // The x offset (0.32, "slightly off from center toward one side,
    // away from the door") doesn't need a wall-dependent sign — it's
    // only ever read in front-view screenshots on both walls to confirm
    // it clears the door, and a mirrored x there is cosmetically
    // identical (the corner it lands in just swaps left/right), not a
    // correctness bug the way the front/back z confusion was.
    statusLight.position.set(footprint.w * 0.32, footprint.h * 0.76, footprint.d / 2 + 0.01);
    group.add(statusLight);
    statusLights[p.id] = statusLight;

    // Examine-target anchor: a plain Object3D at the machine's
    // aisle-facing side, waist height — the point the proximity check
    // (below) measures distance to, and where the examine overlay
    // conceptually "is." Same facing fix as the status light above.
    var anchor = new THREE.Object3D();
    anchor.position.set(0, footprint.h * 0.5, footprint.d / 2 + 0.1);
    group.add(anchor);
    qrAnchors[p.id] = anchor;

    // Stage 10: a number label above each machine, in the exact spot the
    // old unclaimed-laundry ring used to occupy (footprint.h + 0.25) —
    // freed up by folding that state into the status light's own colour
    // instead (see STATE_COLOR/applyMachineState below). Reuses the same
    // "Washer N"/"Dryer N" string the examine overlay and 2D board already
    // show, so this isn't a second, possibly-drifting numbering scheme.
    var numberLabel = buildLabelSprite((p.type === "dryer" ? "Dryer " : "Washer ") + p.id, { scale: [0.7, 0.175], fontPx: 56 });
    numberLabel.position.set(0, footprint.h + 0.25, 0);
    group.add(numberLabel);

    // Stage 10: a downward-pointing marker above the number label on
    // whichever machine(s) the viewer holds an active reservation on.
    // Originally shared the local character's own "this is you" selfMarker
    // colour (amber) for a consistent "this points at something that's
    // yours" convention — revised per user feedback to a distinct, more
    // attention-grabbing red (STATE_COLOR's own "your-turn"/"unclaimed"
    // alert colour, 0xb5402a — already the app's one colour reserved for
    // "needs your attention now") plus a gentle bob (see bobbingMarkers'
    // own per-frame update below), since picking your own machine out of
    // a room of ten at a glance is a more urgent, frequent task than the
    // local self-marker's "which one is me" — a colour this app already
    // uses everywhere else for the same meaning, and motion, do that job
    // better than a static, muted colour match.
    var mineMarker = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.18, 4),
      new THREE.MeshStandardMaterial({ color: 0xb5402a, emissive: 0xb5402a, emissiveIntensity: 0.5 }),
    );
    mineMarker.rotation.x = Math.PI; // point down, toward the number label/machine below it
    mineMarker.userData.baseY = footprint.h + 0.5;
    mineMarker.position.set(0, mineMarker.userData.baseY, 0);
    mineMarker.visible = false;
    group.add(mineMarker);
    mineMarkers[p.id] = mineMarker;
  });
  window.__laundryMachineGroups = machineGroups; // Playwright-inspectable escape hatch
  window.__laundryStatusLights = statusLights;
  window.__laundryMineMarkers = mineMarkers;

  // --- Stage 9.2: sink + ironing table merge into one free-standing
  // island in open floor (replacing Stage 8.2's two separate west-wall
  // positions — the west wall is now the drop-off zone, below), roughly
  // centered in the room.
  //
  // Stage 10 fix: both props now use the exact same corner-origin Group
  // convention the machines already use (a Group whose position IS the
  // model's true floor-center, with the model itself offset inside that
  // group by -bbox.min*scale) — not the hand-tuned absolute offsets this
  // block used before. Root cause of the bug this replaces: those old
  // offsets ("islandX + sinkLocalX - 0.25", etc.) were tuned so the model
  // *looked* right, but addCollisionBox was then given the un-corrected
  // anchor point ("islandX + sinkLocalX", "islandZ") as if it were the
  // model's true center — it wasn't, by about half a model-depth on each
  // prop (confirmed by loading the real models and measuring their
  // rendered world-space bbox center against the box that was built:
  // the sink's real center sat at Z=-0.775 while its collision box was
  // centered at Z=-0.3; the table's real center at Z=-0.744 against a
  // box centered at Z=-0.3) — so the real, rendered north face of each
  // prop (the side facing the room/machines) had no collision coverage
  // at all, which is what let a player walk straight through. Routing
  // both props through footprintOf()/MODEL_BBOX (same as every machine)
  // makes the visible model, its collision box, and (for the table) the
  // iron prop's own position all derive from one consistent placement. ---
  var islandX = 0;
  var islandZ = (northZ + southZ) / 2;
  var sinkLocalX = -0.55;
  var ironLocalX = 0.5;

  var sinkFootprint = footprintOf("sink");
  addCollisionBox(islandX + sinkLocalX, islandZ, sinkFootprint.w, sinkFootprint.d);
  var sinkGroup = new THREE.Group();
  sinkGroup.position.set(islandX + sinkLocalX, 0, islandZ);
  scene.add(sinkGroup);
  loadModel("/models/kitchenSink.glb", function (model) {
    var b = MODEL_BBOX.sink;
    model.scale.setScalar(sinkFootprint.scale);
    model.position.set(-b.min[0] * sinkFootprint.scale - sinkFootprint.w / 2, 0, -b.min[2] * sinkFootprint.scale - sinkFootprint.d / 2);
    model.traverse(function (n) { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    sinkGroup.add(model);
  });

  var tableFootprint = footprintOf("table");
  addCollisionBox(islandX + ironLocalX, islandZ, tableFootprint.w, tableFootprint.d);
  var tableGroup = new THREE.Group();
  tableGroup.position.set(islandX + ironLocalX, 0, islandZ);
  scene.add(tableGroup);
  loadModel("/models/table.glb", function (model) {
    var b = MODEL_BBOX.table;
    model.scale.setScalar(tableFootprint.scale);
    model.position.set(-b.min[0] * tableFootprint.scale - tableFootprint.w / 2, 0, -b.min[2] * tableFootprint.scale - tableFootprint.d / 2);
    model.traverse(function (n) { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    tableGroup.add(model);

    // Stage 10: a real procedural iron shape (a tapered sole plate +
    // handle), replacing the plain flat-colour box placeholder — no real
    // CC0 clothes-iron model exists (checked Kenney's Furniture Kit, every
    // other Kenney pack, poly.pizza, and Poly Haven; the one iron-shaped
    // hit on poly.pizza is CC-BY, which fails this project's CC0-only
    // sourcing rule, public/models/SOURCES.md). Shape alone should read as
    // "iron" the same way the basket's tapered frustum reads as "basket"
    // without needing a distinct colour to do that job.
    var soleShape = new THREE.Shape();
    soleShape.moveTo(-0.06, -0.11);
    soleShape.lineTo(0.06, -0.11);
    soleShape.lineTo(0.035, 0.1);
    soleShape.lineTo(0, 0.14);
    soleShape.lineTo(-0.035, 0.1);
    soleShape.lineTo(-0.06, -0.11);
    var soleGeo = new THREE.ExtrudeGeometry(soleShape, { depth: 0.045, bevelEnabled: false });
    soleGeo.rotateX(-Math.PI / 2); // lay the flat 2D sole shape horizontal, point facing +Z
    soleGeo.translate(0, 0.045, 0); // extrude depth becomes height — lift it clear of the table surface, not half-buried in it
    var ironMat = new THREE.MeshStandardMaterial({ color: 0x4a4642 });
    var iron = new THREE.Mesh(soleGeo, ironMat);
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 12, Math.PI), ironMat);
    handle.rotation.set(0, 0, 0);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.045 + 0.03, -0.04); // sits above the sole's own back end, where a real iron's handle arcs up
    iron.add(handle);
    // Live-measured, not hardcoded: the table's own real top surface
    // height, read directly off the loaded (and now-scaled) model, so a
    // future scale change can't silently leave the iron floating above or
    // sunk into the table top the way a guessed constant would.
    var tableBox = new THREE.Box3().setFromObject(model);
    iron.position.set(0, tableBox.max.y - tableGroup.position.y, tableFootprint.d * 0.15);
    iron.castShadow = true;
    tableGroup.add(iron);
  });

  // --- Stage 9.2: the drop-off/public zone, the whole west wall — real
  // sourced shelving (bookcaseOpen.glb, public/models/SOURCES.md),
  // replacing Stage 8.2's single small table entirely (the user's own
  // explicit rejection: "how's this supposed to fit clothes"). Three
  // instances side by side read as one real shelving run, not a single
  // small prop; PICKUP_SPOTS.length (6) splits evenly across the 3 units
  // at 2 shelf heights each. ---
  var PICKUP_SPOTS = ["A1", "A2", "A3", "A4", "A5", "A6"];
  var bookcaseFootprint = footprintOf("bookcase");
  var BOOKCASE_COUNT = 3;
  var BOOKCASE_GAP = 0.08;
  var bookcaseSpacing = bookcaseFootprint.w + BOOKCASE_GAP;
  var bookcaseRunWidth = BOOKCASE_COUNT * bookcaseFootprint.w + (BOOKCASE_COUNT - 1) * BOOKCASE_GAP;
  var dropoffCenterZ = (northZ + southZ) / 2;
  // Facing +X, into the room from the west wall — rotateY(local +Z,
  // Math.PI/2) = (1, 0), matching the west wall's own interior direction
  // (+X), the same facingToward(dx,dz) convention
  // src/laundry-layout.ts's layoutRoom() now uses for the north/east
  // machines (Stage 9.5) — this constant was already correct (confirmed
  // by screenshot, the drop-off sign and shelf fronts read correctly
  // facing the room), unlike the north-wall machines' old facing.
  var BOOKCASE_FACING = Math.PI / 2;

  var dropoffSpotMeshes = {}; // spot name -> Mesh, recoloured when occupied
  var SPOT_FREE_COLOR = 0xe3efe9; // --free-tint
  var SPOT_OCCUPIED_COLOR = 0xd68a3a; // --warn-tint, distinct from the free tint and from every STATE_COLOR value
  var lastKnownOccupiedSpots = null; // bookcase loads are async, so a machines-state fetch can resolve before the markers exist — re-applied once they do
  function applySpotOccupancy(occupiedSpots) {
    lastKnownOccupiedSpots = occupiedSpots || [];
    var occupied = {};
    lastKnownOccupiedSpots.forEach(function (s) { occupied[s] = true; });
    Object.keys(dropoffSpotMeshes).forEach(function (spot) {
      dropoffSpotMeshes[spot].material.color.setHex(occupied[spot] ? SPOT_OCCUPIED_COLOR : SPOT_FREE_COLOR);
    });
  }

  // Single proximity anchor for the whole zone (not one per bookcase) —
  // the interact action ("hand off this laundry" / "place it here") is a
  // single zone-wide action, matching Stage 8.4's existing one-anchor
  // convention for the drop-off area.
  var dropoffAnchor = new THREE.Object3D();
  dropoffAnchor.position.set(westX + bookcaseFootprint.d / 2 + 0.3, GENERIC_WAIST_HEIGHT * 0.5, dropoffCenterZ);
  scene.add(dropoffAnchor);
  window.__laundryDropoffAnchor = dropoffAnchor;

  for (var bi = 0; bi < BOOKCASE_COUNT; bi++) {
    (function (bi) {
      var bz = dropoffCenterZ - bookcaseRunWidth / 2 + bookcaseFootprint.w / 2 + bi * bookcaseSpacing;
      // Rotated 90° off the north-wall convention, so the bookcase's local
      // w/d footprint is swapped in world X/Z — the same axis-swap this
      // stage's own plan named in advance for the east-wall machines.
      addCollisionBox(westX, bz, bookcaseFootprint.d, bookcaseFootprint.w);

      var group = new THREE.Group();
      group.position.set(westX, 0, bz);
      group.rotation.y = BOOKCASE_FACING;
      scene.add(group);

      loadModel("/models/bookcaseOpen.glb", function (modelRoot) {
        var b = MODEL_BBOX.bookcase;
        modelRoot.position.set(-b.min[0] - bookcaseFootprint.w / 2, 0, -b.min[2] - bookcaseFootprint.d / 2);
        modelRoot.traverse(function (node) {
          if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
        });
        group.add(modelRoot);

        // Two markers per bookcase (6 total across 3 units), at two
        // approximate shelf heights within the model's own measured
        // height — an approximation (the model's exact shelf-board Y
        // positions weren't individually measured), not a claim of
        // exact shelf alignment.
        var heights = [bookcaseFootprint.h * 0.35, bookcaseFootprint.h * 0.68];
        heights.forEach(function (hY, hi) {
          var spot = PICKUP_SPOTS[bi * 2 + hi];
          var marker = new THREE.Mesh(
            new THREE.BoxGeometry(bookcaseFootprint.w * 0.7, 0.03, bookcaseFootprint.d * 0.7),
            new THREE.MeshStandardMaterial({ color: SPOT_FREE_COLOR }),
          );
          marker.position.set(bookcaseFootprint.w / 2, hY, bookcaseFootprint.d / 2);
          group.add(marker);
          dropoffSpotMeshes[spot] = marker;
        });
        applySpotOccupancy(lastKnownOccupiedSpots);
      });
    })(bi);
  }
  window.__laundryDropoffSpotMeshes = dropoffSpotMeshes;

  // Billboard text labels: a THREE.Sprite with a THREE.CanvasTexture
  // always faces the camera regardless of approach angle, with zero new
  // dependencies (no font-loading library, matching docs/adr/0003's
  // no-build-step constraint). Shared by the "DROP-OFF" sign
  // (plans/3d-walkthrough.md Stage 9.2 — large, legible, readable from a
  // normal approach distance) and plans/laundry-presence.md's small
  // per-character room-number tag — factored into one function with
  // options rather than two copies of the same canvas-drawing code,
  // since a tag floating above someone's head wants a much smaller scale
  // and a less visually dominant panel than a floor-mounted sign does.
  function buildLabelSprite(text, opts) {
    opts = opts || {};
    var canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 128;
    var ctx = canvas.getContext("2d");
    // An opaque panel behind the text by default — keeps the label
    // legible regardless of whatever's visually behind it in the 3D
    // scene (wall, shelving, open floor). A per-character tag asks for a
    // semi-transparent panel instead (opts.panelAlpha), so a cluster of
    // floating name tags doesn't read as a row of solid signs.
    var panelAlpha = opts.panelAlpha != null ? opts.panelAlpha : 1;
    ctx.fillStyle = "rgba(246, 243, 236, " + panelAlpha + ")"; // --paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(222, 215, 200, " + panelAlpha + ")"; // --rule
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    ctx.fillStyle = opts.textColor || "#1c1a17"; // --ink
    ctx.font = "bold " + (opts.fontPx || 64) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    var texture = new THREE.CanvasTexture(canvas);
    var material = new THREE.SpriteMaterial({ map: texture, transparent: panelAlpha < 1 });
    var sprite = new THREE.Sprite(material);
    var scale = opts.scale || [1.6, 0.4]; // defaults match the canvas's own 4:1 aspect ratio
    sprite.scale.set(scale[0], scale[1], 1);
    return sprite;
  }
  var dropoffLabel = buildLabelSprite("DROP-OFF");
  dropoffLabel.position.set(westX + bookcaseFootprint.d + 0.2, bookcaseFootprint.h + 0.75, dropoffCenterZ);
  scene.add(dropoffLabel);

  // --- ceiling lamps: a room-covering grid (replacing Stage 8.2's
  // two-rows-along-one-wall layout, which assumed every machine sat on a
  // single wall). Sized directly to roomHalfWidth/roomHalfDepth so it
  // adapts to this stage's smaller, closer-to-square room rather than
  // staying tied to the old single machine wall's width. ---
  var lampCols = 2, lampRows = 2;
  for (var lr = 0; lr < lampRows; lr++) {
    for (var lc = 0; lc < lampCols; lc++) {
      var lx = -roomHalfWidth + ((lc + 0.5) / lampCols) * (roomHalfWidth * 2);
      var lz = -roomHalfDepth + ((lr + 0.5) / lampRows) * (roomHalfDepth * 2);
      (function (lx, lz) {
        loadModel("/models/lampSquareCeiling.glb", function (model) {
          model.rotation.x = Math.PI; // ceiling fixtures are typically modelled hanging downward; flip to mount flush to the ceiling plane
          model.position.set(lx, wallHeight - 0.02, lz);
          scene.add(model);
        });
      })(lx, lz);
      var lamp = new THREE.PointLight(0xfff0d8, 6, 12, 1.6);
      lamp.position.set(lx, wallHeight - 0.3, lz);
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(512, 512);
      scene.add(lamp);
    }
  }

  // --- Stage 8.3: the player character (Kenney "Mini Characters," CC0 —
  // public/models/SOURCES.md), replacing the first-person camera
  // entirely. The character root IS the thing pos.x/pos.z (below) moves;
  // the camera becomes a child rig that follows it. ---
  var characterRoot = new THREE.Group();
  characterRoot.position.set(0, 0, southZ);
  scene.add(characterRoot);

  // "This is you" marker — a small floating downward-pointing marker
  // above the local player's own character, the same convention many
  // multiplayer games use to tell a player which on-screen character they
  // personally control. Added because the local player's own character is
  // now a neutral grey-white (see the flatMat override below) specifically
  // so it can never be confused with a remote character's identity-hashed
  // colour — but that same neutrality means it no longer stands out on
  // its own in a room with several other residents present, so an
  // explicit marker replaces "stands out by colour" as the way to find
  // yourself. Purely local: never sent over reportPresence(), since no
  // other viewer needs to know which character is "you" from their own
  // point of view — each viewer only ever sees this marker above their
  // own character.
  var selfMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.14, 4),
    new THREE.MeshStandardMaterial({ color: 0xe6b422, emissive: 0x6b4f00, emissiveIntensity: 0.4 }),
  );
  selfMarker.rotation.x = Math.PI; // point the cone downward, toward the character's head
  // 0.9 sits just above the character model's own ~0.67-unit height
  // (confirmed via a real _debugCharacter() worldBox reading).
  selfMarker.position.set(0, 0.9, 0);
  characterRoot.add(selfMarker);

  // Real bug introduced by selfMarker above: characterMixer (below) used
  // to bind to characterRoot.children[0], an assumption that the
  // character model is always characterRoot's first child. Adding
  // selfMarker as characterRoot's first child (before the model loads)
  // silently broke that assumption — children[0] became the marker cone
  // (no skeleton, no animation) instead of the model, so the
  // AnimationMixer drove a mesh with nothing to animate, and the real
  // character never visibly moved its limbs even though its position
  // was correct. characterModel is set explicitly where the model is
  // actually added (below), so the mixer always binds to the real thing
  // regardless of sibling order or how many other objects (markers,
  // baskets) get added to characterRoot.
  var characterModel = null;
  var characterMixer = null;
  var walkAction = null, idleAction = null;
  // Hoisted out of the gltfLoader.load callback below (plans/laundry-
  // presence.md): these are the already-loaded, already-root-motion-
  // stripped clip objects — upsertRemoteCharacter() reuses them directly
  // via its own clipAction() calls on a separate AnimationMixer, rather
  // than re-loading/re-fixing the character model a second time per
  // remote character. No .clone() needed: a clip is plain keyframe data,
  // and AnimationMixer.clipAction() is designed to bind the same clip to
  // multiple independent mixers with no cross-talk.
  var walkClip = null, idleClip = null;
  // A plain red box read as "an alert colour", not "a laundry basket" —
  // nothing about its shape said what it was, and its old colour
  // (0xb5402a) sat at nearly the same luminance as the character's own
  // former skin tone (0xd9a066), so the two blended together rather than
  // reading as separate objects (confirmed with a relative-luminance
  // check: contrast ratio ~1.02, i.e. indistinguishable). Redesigned as a
  // tapered basket shape (a real wicker-basket silhouette, wide top/
  // narrow base) in a fixed, desaturated wicker tone — colour no longer
  // has to do the job of saying "this is a basket" at all, so it's free
  // to be ordinary. A first pass also tinted a small "clothes poking out
  // the top" accent by basketKind (own/other); dropped at the user's
  // request — the basket is now a single plain wicker colour regardless
  // of kind. basketKind itself (and setBasketKind) stays: Stage 8.4's
  // handoff flow still needs the own/other distinction as real state (it
  // drives which notice/spot text is shown), it just no longer has any
  // visual expression on the basket prop itself.
  var BASKET_WICKER_COLOR = 0xc9a876;
  var basketMesh = null; // THREE.Mesh: a plain wicker frustum
  var basketVisible = false;
  var basketKind = "own"; // "own" | "other" — 8.4's two distinct carried-basket states; tracked but no longer shown visually

  // Stage 10: enlarged (BASKET_SCALE) and re-rounded (10 -> 24 radial
  // segments, matching the status light's 20 and the unclaimed-ring's 24
  // — the basket was the one carried prop still built from a visibly
  // low-poly cylinder) per the user's own observation that it reads as
  // "has corners," not round. BASE_TOP_RADIUS/BASE_BOTTOM_RADIUS/
  // BASE_HEIGHT are the original (pre-Stage-10) dimensions, kept as named
  // constants specifically so the clearance math below scales *with* the
  // basket rather than needing its own second hand-tuned offset.
  var BASKET_SCALE = 1.35;
  var BASKET_BASE_TOP_RADIUS = 0.13, BASKET_BASE_BOTTOM_RADIUS = 0.09, BASKET_BASE_HEIGHT = 0.16;
  var BASKET_TOP_RADIUS = BASKET_BASE_TOP_RADIUS * BASKET_SCALE;
  var BASKET_BOTTOM_RADIUS = BASKET_BASE_BOTTOM_RADIUS * BASKET_SCALE;
  var BASKET_HEIGHT = BASKET_BASE_HEIGHT * BASKET_SCALE;
  // The body model's own real front-face z, measured the same way the
  // basket's original clipping fix measured it (a real Box3 reading in
  // characterRoot-local space, not a guess): z ~= 0.159. The desired
  // clearance outside that face (~0.03, the original fix's own target)
  // is named here so a future size change re-derives the z position from
  // it automatically, instead of needing its own re-measurement the way
  // a hardcoded z constant would — this is exactly the bug class Stage
  // 10's "basket enlarged, offset never updated" risk would otherwise be.
  var BASKET_BODY_FRONT_Z = 0.159;
  var BASKET_CLEARANCE = 0.03;
  var BASKET_Z = BASKET_BODY_FRONT_Z + BASKET_CLEARANCE + BASKET_TOP_RADIUS;

  function buildBasket() {
    // A simple hand-built prop — plan's own "not worth extensive sourcing
    // effort for one small prop" note still holds; the shape itself
    // (CylinderGeometry with different top/bottom radii, a tapered
    // frustum) is what reads as "basket", not colour. Positioned at
    // roughly waist/carry height in front of the character. Near-edge
    // clearance (BASKET_Z - BASKET_TOP_RADIUS, outside BASKET_BODY_FRONT_Z)
    // is BASKET_CLEARANCE by construction, regardless of BASKET_SCALE.
    var basket = new THREE.Mesh(
      new THREE.CylinderGeometry(BASKET_TOP_RADIUS, BASKET_BOTTOM_RADIUS, BASKET_HEIGHT, 24),
      new THREE.MeshStandardMaterial({ color: BASKET_WICKER_COLOR }),
    );
    basket.position.set(0, 0.32, BASKET_Z);
    basket.castShadow = true;
    return basket;
  }

  function setBasketVisible(visible) {
    basketVisible = visible;
    if (basketMesh) basketMesh.visible = visible;
  }
  function setBasketKind(kind) {
    basketKind = kind;
  }
  window.__laundryBasket = {
    isVisible: function () { return basketVisible; },
    getKind: function () { return basketKind; },
  };

  loadModel("/models/character.glb", function (model) {
    // Stage 8.1's decision: override every material with one flat colour
    // (no texture map at all) — satisfies "round head, head and body one
    // single colour" and sidesteps the external-texture packaging caveat
    // research/3d-booking/asset-sourcing.md documented, since the material
    // never samples a texture to begin with.
    //
    // Changed from the original warm skin tone (0xd9a066) to a neutral
    // grey-white at the user's request, for two reasons: it no longer sits
    // at nearly the same luminance as the basket's wicker colour (see
    // BASKET_WICKER_COLOR above), and it reads as deliberately neutral —
    // the local player never needs a colour to recognize themselves (they
    // always know which character they're driving), while every remote
    // character is coloured by colourForIdentity() (fixed 55% saturation,
    // never this desaturated), so the two can never be confused for one
    // another on anyone's screen.
    var flatMat = new THREE.MeshStandardMaterial({ color: 0xe8e6e1 });
    model.traverse(function (node) {
      if (node.isMesh || node.isSkinnedMesh) {
        node.material = flatMat;
        node.castShadow = true;
        // Stage 9.1 fix, second real cause (the root-motion fix above
        // wasn't the whole story): a SkinnedMesh's bounding sphere is
        // computed once, from the model's bind pose, and three.js never
        // recomputes it as the skeleton animates — confirmed directly by
        // toggling this exact flag off/on and comparing screenshots, not
        // guessed. Once the walk animation actually poses the skeleton
        // away from its bind pose, the character's real on-screen
        // silhouette can extend outside that stale bounding sphere,
        // and three.js's per-frame frustum check (which trusts the
        // cached sphere, not the live mesh) wrongly decides the whole
        // mesh is off-screen and skips drawing it entirely — exactly the
        // "disappears the instant it starts animating" symptom. Disabling
        // frustum culling for this one small, always-on-screen character
        // is the standard fix for an animated SkinnedMesh (its bounding
        // volume is never reliable once skinned), not a workaround.
        node.frustumCulled = false;
      }
    });
    characterRoot.add(model);
    characterModel = model;

    basketMesh = buildBasket();
    // Stage 9.6: apply whatever basketVisible/basketKind already is,
    // not a hardcoded false — character.glb loads asynchronously (this
    // is its first ever load, so loadModel() can't serve it from cache
    // synchronously), and refetchMachineState() runs immediately on page
    // load with no dependency on this callback having fired first. If
    // that fetch resolves (and calls setBasketVisible(true), say, for a
    // resident who already has an active reservation) before this
    // callback runs, setBasketVisible's own if (basketMesh) guard was
    // silently dropping the value, since basketMesh didn't exist yet —
    // and nothing ever revisited it afterward unless some later event
    // happened to call refetchMachineState() again. Confirmed as a real,
    // reproducible (if timing-dependent) bug: a scene-graph walk found
    // the real mesh's own .visible left false while the state variable
    // genuinely was true. Reading the already-known values here instead
    // removes the race: whichever of "model loads" or "first state fetch
    // resolves" happens first, the other one's effect is still applied
    // correctly once this line runs.
    basketMesh.visible = basketVisible;
    characterRoot.add(basketMesh);

    // Animations: the GLTF ships many (idle/walk/pick-up/etc. — confirmed
    // directly against the downloaded file before writing this); only
    // idle and walk are used here, found by name rather than assumed index.
    // window.__laundryGltfAnimations is exposed for a quick Playwright
    // sanity check that the expected clip names actually exist, without
    // needing to re-inspect the raw GLB from a test.
    //
    // Found investigating a real "my character's limbs never animate,
    // only a hard refresh fixes it" report: this used to issue a SECOND,
    // fully independent network request for character.glb (via
    // loadGltfWithRetry directly, bypassing modelCache) purely to get at
    // gltf.animations, since this callback's own model argument is
    // already a clone with no animations array attached. That second
    // request had its own 3-attempt retry budget — if all 3 happened to
    // fail (exactly the kind of transient blip fly.toml's cold-start
    // auto_stop_machines setup makes more likely right after a cold
    // start), walkClip/idleClip/characterMixer stayed null for the rest
    // of that page load, silently, with the character model itself still
    // rendering and moving correctly (so nothing else looked broken).
    // loadModel() above already stores the raw gltf (animations and all)
    // in modelCache before ever calling this callback, so there's no
    // reason to fetch it a second time at all — reading
    // modelCache[url].animations here removes the whole failure window,
    // not just retries it harder.
    var gltfAnimations = modelCache["/models/character.glb"].animations;
    window.__laundryGltfAnimations = gltfAnimations.map(function (a) { return a.name; });
    characterMixer = new THREE.AnimationMixer(characterModel);
    walkClip = THREE.AnimationClip.findByName(gltfAnimations, "walk");
    idleClip = THREE.AnimationClip.findByName(gltfAnimations, "idle");
    // Stage 9.1 fix (1 of 2 — the disappearing-character bug had two
    // independent causes stacked together, not one): the "walk" clip
    // (unlike "idle") ships a "root.position" keyframe track — Kenney's
    // rig has a top-level "root" Bone (parent of every other bone,
    // confirmed by a real scene-graph dump: Group > Object3D > Bone
    // "root" > {leg-left, leg-right, torso{arm-left, arm-right, head}},
    // with body-mesh/head-mesh as SkinnedMeshes siblings of "root"). That
    // track moves the root BONE's own local position every frame the
    // walk animation plays, which (since every other bone and both
    // skinned meshes hang off it) drags the whole character's real
    // world-space position away from whatever characterRoot.position
    // (the Object3D this file actually drives) says it should be —
    // confirmed by a live Box3().setFromObject() reading on the character
    // diverging further from characterRoot.position the longer "w" was
    // held. This alone explained long-held-movement disappearance (the
    // mesh drifting entirely outside the camera's view); it did NOT
    // explain a shorter repro where the mesh vanished with zero measured
    // drift — that turned out to be a second, independent bug, fixed
    // separately where frustumCulled is set above. The fix here removes
    // the root-motion track from the walk clip before ever creating its
    // AnimationAction, so only its rotation tracks (the actual arm/leg
    // swing) play — characterRoot's own position, set once per frame in
    // the render loop below, is the only thing that ever moves the
    // character through the room.
    if (walkClip) { stripRootMotion(walkClip); walkAction = characterMixer.clipAction(walkClip); walkAction.play(); walkAction.setEffectiveWeight(0); }
    if (idleClip) { idleAction = characterMixer.clipAction(idleClip); idleAction.play(); idleAction.setEffectiveWeight(1); }
  }, function () {});

  function stripRootMotion(clip) {
    clip.tracks = clip.tracks.filter(function (t) { return t.name !== "root.position"; });
    return clip;
  }

  // --- camera: a third-person follow rig, not orbit controls — look
  // direction and movement direction stay linked (the player doesn't
  // freely spin the camera independent of facing), the same as the old
  // first-person code, just mediated through a character now. yaw/pitch
  // describe where the player is "looking" (and therefore which way the
  // character faces while moving); the camera itself sits behind/above
  // that, easing toward its target transform each frame rather than
  // snapping. ---
  var yaw = 0, pitch = 0.25;
  var pos = { x: 0, z: southZ };
  var MOVE_SPEED = 2.6;
  var LOOK_SENSITIVITY = 0.0025;
  // CAM_HEIGHT_MARGIN keeps the vertical component inside the room:
  // clampCameraPos (below) already clamps X/Z against the walls, but
  // nothing ever clamps Y against the floor/ceiling — pitching toward the
  // extremes of the orbital camera below (see updateCamera) could push
  // the camera's own Y position above wallHeight (2.6) or below the
  // floor, which reads as "the camera clips through the ceiling/wall."
  var CAM_DISTANCE = 3.2;
  var CAM_HEIGHT_MARGIN = 0.15;
  var CAM_LERP = 0.12; // per-frame ease factor, not a time-scaled lerp — simple and stable at this fixed-ish frame rate
  // Stage 10: scroll-wheel zoom, changing how far back the existing
  // third-person follow camera sits (CAM_DISTANCE) rather than the
  // camera's FOV — a simpler, more familiar "zoom" for a follow camera,
  // and it doesn't touch movement/collision at all (clampCameraPos,
  // called every frame from CAM_DISTANCE's current value, already keeps
  // the resulting camera position off the walls regardless of distance).
  // Revised per user feedback, twice: the first widened range (0.6-7 at
  // 0.01/deltaY) moved too fast in both directions, and zooming in that
  // close triggered the pitch bug fixed below (a fixed vertical camera
  // offset reads as a much steeper up/down angle the closer the camera
  // sits — see updateCamera's own comment). Final shape: sensitivity
  // reverts to the original 0.0025 (the "too sensitive" complaint); the
  // max distance (zoom-out) reverts to the original 5 — the user's own
  // "zoom in more, zoom out doesn't need as much" request; only the min
  // distance (zoom-in) keeps the closer 0.6 from the first attempt, since
  // "get closer to inspect a small prop" was the one real, specific ask.
  var CAM_DISTANCE_MIN = 0.6, CAM_DISTANCE_MAX = 5;
  var CAM_ZOOM_SENSITIVITY = 0.0025;

  function collidesAt(x, z) {
    for (var i = 0; i < collisionBoxes.length; i++) {
      var b = collisionBoxes[i];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }

  // Clamps to the room's walls, then independently rejects a move into
  // any collidable box per-axis (so sliding along a machine's side while
  // walking past it still works, instead of movement freezing entirely
  // the moment either axis would collide) — same shape as Stage 1's
  // original clampToRoom, now checked against collisionBoxes generally.
  function clampToRoom(x, z) {
    var margin = 0.35;
    var clampedX = Math.max(-roomHalfWidth + margin, Math.min(roomHalfWidth - margin, x));
    var clampedZ = Math.max(-roomHalfDepth + margin, Math.min(roomHalfDepth - margin, z));
    var resultX = collidesAt(clampedX, pos.z) ? pos.x : clampedX;
    var resultZ = collidesAt(resultX, clampedZ) ? pos.z : clampedZ;
    return { x: resultX, z: resultZ };
  }

  // A real bug this fixed: the naive "character position + offset behind"
  // camera placement put the camera entirely outside the room (through a
  // wall) whenever the character stood near that wall already — found by
  // this stage's own screenshot showing a blank/empty canvas, traced to
  // the camera's own world position lying beyond roomHalfDepth. Clamping
  // the camera's own position to stay inside the walls (independent of
  // the spawn point or camera-distance tuning) means this can't silently
  // reoccur if either of those constants changes later.
  var CAM_WALL_MARGIN = 0.3;
  function clampCameraPos(x, z) {
    return {
      x: Math.max(-roomHalfWidth + CAM_WALL_MARGIN, Math.min(roomHalfWidth - CAM_WALL_MARGIN, x)),
      z: Math.max(-roomHalfDepth + CAM_WALL_MARGIN, Math.min(roomHalfDepth - CAM_WALL_MARGIN, z)),
    };
  }

  // Second, deeper zoom bug, found after the first "scale the pitch
  // offset by distance" fix still snapped to a top-down view when zoomed
  // close: that fix only scaled the *pitch-driven* part of the vertical
  // offset, but CAM_HEIGHT itself (1.6, a fixed absolute height) was
  // still added on top, completely independent of CAM_DISTANCE — and the
  // camera's lookAt target sits at a different fixed height (TARGET_Y,
  // 0.9). That 0.7-unit gap between CAM_HEIGHT and TARGET_Y is present
  // even at pitch=0 (no deliberate look-up/down at all), and like any
  // fixed-size offset, the angle it produces relative to CAM_DISTANCE
  // grows the closer the camera gets — at distance 3.2 that 0.7 gap is
  // only a ~12 degree tilt, but at distance 0.6 the exact same 0.7 gap is
  // already a ~49 degree tilt, using up most of the pitch range's own
  // headroom before the user even touches the mouse — which is exactly
  // why pitch felt "stuck looking at your feet" and unresponsive once
  // zoomed in close: the fixed CAM_HEIGHT/TARGET_Y gap was already doing
  // most of the tilting, leaving pitch's own, now-much-smaller remaining
  // range nowhere near enough room to fight back to eye level.
  //
  // Real fix: a proper orbital/spherical camera, not an "absolute height
  // plus an absolute offset" formula. The camera always sits on a sphere
  // of radius CAM_DISTANCE centred on the look target (the character, at
  // TARGET_Y) — pitch is the elevation angle on that sphere, yaw the
  // azimuth — so the *geometry* of "how far above/below eye-level does
  // the camera sit, as an angle" depends only on pitch, never on
  // CAM_DISTANCE at all. This is the standard orbit-camera construction
  // (the same shape OrbitControls itself uses internally), not a
  // from-scratch invention.
  var TARGET_Y = 0.9; // the character's own "look at" height, unchanged from before

  var desiredCamPos = new THREE.Vector3();
  var desiredCamTarget = new THREE.Vector3();
  function updateCamera() {
    // Horizontal distance shrinks as pitch tilts up/down (cos(pitch)),
    // the same way a sphere's "radius at this latitude" shrinks away from
    // its equator — this is what keeps the camera genuinely CAM_DISTANCE
    // away from the target at any pitch, not just at pitch=0.
    var horizontalDist = CAM_DISTANCE * Math.cos(pitch);
    var backX = Math.sin(yaw) * horizontalDist;
    var backZ = Math.cos(yaw) * horizontalDist;
    var rawX = characterRoot.position.x + backX, rawZ = characterRoot.position.z + backZ;
    var clamped = clampCameraPos(rawX, rawZ);
    var rawY = TARGET_Y + CAM_DISTANCE * Math.sin(pitch);
    var clampedY = Math.max(CAM_HEIGHT_MARGIN, Math.min(wallHeight - CAM_HEIGHT_MARGIN, rawY));
    desiredCamPos.set(clamped.x, clampedY, clamped.z);
    camera.position.lerp(desiredCamPos, CAM_LERP);
    desiredCamTarget.set(characterRoot.position.x, TARGET_Y, characterRoot.position.z);
    camera.lookAt(desiredCamTarget);
  }
  characterRoot.position.set(pos.x, 0, pos.z);
  var initialCam = clampCameraPos(pos.x, pos.z + CAM_DISTANCE * Math.cos(pitch));
  camera.position.set(initialCam.x, TARGET_Y + CAM_DISTANCE * Math.sin(pitch), initialCam.z);
  camera.lookAt(pos.x, TARGET_Y, pos.z);

  // --- desktop: WASD (always active) + pointer-lock mouse-look. Movement
  // never depends on pointer lock being active (Playwright's automated
  // clicks don't reliably grant real pointer lock in a headless/CI-like
  // environment), so verifying "movement works" stays possible from
  // keyboard input alone. ---
  var keys = { w: false, a: false, s: false, d: false };
  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
    if (k === "escape") hideExamineOverlay();
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
  });

  // Stage 9.4.1: drag-to-look (hold the mouse button, move, release —
  // the SketchUp/3D-modelling-tool convention), replacing Stage 7.2's
  // pointer-lock FPS-style "just move the mouse" scheme entirely. The
  // cursor stays visible throughout; nothing is ever locked, so there's
  // no lock state to hint at and no ESC-to-exit affordance needed. The
  // touch path below already works this way (touchstart/touchmove/
  // touchend on a drag zone) — this brings desktop in line with that,
  // not a new interaction being invented.
  //
  // dragDistance accumulates total on-screen pixel movement between
  // mousedown and mouseup; the click handler further down skips
  // handleInteract() when this exceeds CLICK_DRAG_THRESHOLD, since a
  // "click" event always fires after mouseup even when mousedown and
  // mouseup were the two ends of a deliberate look-drag — without this
  // check, every look-drag would also fire an unwanted interact the
  // instant the mouse is released.
  var CLICK_DRAG_THRESHOLD = 6; // pixels; absorbs natural hand jitter on a real click, not a real drag
  var dragging = false;
  var dragLast = { x: 0, y: 0 };
  var dragDistance = 0;
  renderer.domElement.addEventListener("mousedown", function (e) {
    dragging = true;
    dragDistance = 0;
    dragLast = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
    dragLast = { x: e.clientX, y: e.clientY };
    dragDistance += Math.hypot(dx, dy);
    yaw -= dx * LOOK_SENSITIVITY;
    pitch -= dy * LOOK_SENSITIVITY;
    pitch = Math.max(-0.6, Math.min(0.9, pitch));
  });
  renderer.domElement.addEventListener("mouseup", function () { dragging = false; });
  renderer.domElement.addEventListener("mouseleave", function () { dragging = false; });

  // Stage 10: scroll-wheel zoom. preventDefault stops the whole page from
  // scrolling while the canvas has focus — matching the existing
  // touch-action: none precedent already set on the canvas wrap for touch
  // controls, same reasoning (a gesture meant for the 3D scene shouldn't
  // also move the surrounding page).
  renderer.domElement.addEventListener("wheel", function (e) {
    e.preventDefault();
    CAM_DISTANCE = Math.max(CAM_DISTANCE_MIN, Math.min(CAM_DISTANCE_MAX, CAM_DISTANCE + e.deltaY * CAM_ZOOM_SENSITIVITY));
  }, { passive: false });

  // --- touch: a left-side joystick for movement, a drag-anywhere-else
  // zone for look — only shown on a touch-capable viewport. Unchanged
  // from Stage 1 except that yaw/pitch now drive the follow camera
  // instead of first-person eye direction directly. ---
  var isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  var joystickVector = { x: 0, y: 0 };
  if (isTouch) {
    var base = document.createElement("div");
    base.className = "laundry-joystick-base";
    var nub = document.createElement("div");
    nub.className = "laundry-joystick-nub";
    base.appendChild(nub);
    wrap.appendChild(base);

    var lookZone = document.createElement("div");
    lookZone.className = "laundry-look-zone";
    wrap.appendChild(lookZone);

    var joyActive = false, joyStart = { x: 0, y: 0 };
    var JOY_RADIUS = 48;
    base.addEventListener("touchstart", function (e) {
      joyActive = true;
      var t = e.touches[0];
      joyStart = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    base.addEventListener("touchmove", function (e) {
      if (!joyActive) return;
      var t = e.touches[0];
      var dx = t.clientX - joyStart.x, dy = t.clientY - joyStart.y;
      var dist = Math.min(JOY_RADIUS, Math.hypot(dx, dy));
      var angle = Math.atan2(dy, dx);
      var nx = Math.cos(angle) * dist, ny = Math.sin(angle) * dist;
      nub.style.transform = "translate(" + nx + "px," + ny + "px)";
      joystickVector = { x: nx / JOY_RADIUS, y: ny / JOY_RADIUS };
      e.preventDefault();
    }, { passive: false });
    function joyEnd(e) {
      joyActive = false;
      joystickVector = { x: 0, y: 0 };
      nub.style.transform = "translate(0,0)";
      if (e) e.preventDefault();
    }
    base.addEventListener("touchend", joyEnd, { passive: false });
    base.addEventListener("touchcancel", joyEnd, { passive: false });

    var lookActive = false, lookLast = { x: 0, y: 0 };
    lookZone.addEventListener("touchstart", function (e) {
      lookActive = true;
      var t = e.touches[0];
      lookLast = { x: t.clientX, y: t.clientY };
    });
    lookZone.addEventListener("touchmove", function (e) {
      if (!lookActive) return;
      var t = e.touches[0];
      var dx = t.clientX - lookLast.x, dy = t.clientY - lookLast.y;
      lookLast = { x: t.clientX, y: t.clientY };
      yaw -= dx * LOOK_SENSITIVITY * 2;
      pitch -= dy * LOOK_SENSITIVITY * 2;
      pitch = Math.max(-0.6, Math.min(0.9, pitch));
    });
    lookZone.addEventListener("touchend", function () { lookActive = false; });
  }

  // --- Stage 7.3/8.3: proximity-based interaction targeting. Replaces
  // the first-person screen-center raycast entirely — in third person,
  // "which object is nearest and roughly in front of the character" is
  // the standard convention (research/3d-booking/asset-sourcing.md), not
  // a screen-space ray from a camera that's no longer the player's own
  // eyes. Interactables: each machine's anchor, and the drop-off area's
  // anchor.
  //
  // Highlight is a floor ring under the target, not a per-sub-mesh
  // inverted-hull outline — the outline approach (duplicating every real
  // mesh node slightly scaled up) was dropped alongside the whole-model
  // recolour it was originally paired with: on a real multi-material GLTF
  // model, scaling every sub-mesh independently produces visible gaps and
  // z-fighting between parts that don't share a single convex shape (a
  // washer's door and body, for instance), confirmed by the same
  // screenshot check that found the recolour problem. A floor ring reads
  // clearly as "this is selected" without depending on the target's own
  // mesh topology at all. ---
  var INTERACT_RANGE = 1.3;
  var highlighted = null; // { kind: "machine"|"dropoff", id }
  var highlightRings = {}; // key ("machine:3" / "dropoff") -> Mesh

  function buildHighlightRing(x, z) {
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    ring.visible = false;
    scene.add(ring);
    return ring;
  }

  function nearestInteractable() {
    var best = null, bestDist = INTERACT_RANGE;
    orderedMachines.forEach(function (m) {
      var anchor = qrAnchors[m.id];
      if (!anchor) return;
      var world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      var d = Math.hypot(world.x - characterRoot.position.x, world.z - characterRoot.position.z);
      if (d < bestDist) { bestDist = d; best = { kind: "machine", id: m.id }; }
    });
    var dropWorld = new THREE.Vector3();
    dropoffAnchor.getWorldPosition(dropWorld);
    var dd = Math.hypot(dropWorld.x - characterRoot.position.x, dropWorld.z - characterRoot.position.z);
    if (dd < bestDist) { bestDist = dd; best = { kind: "dropoff" }; }
    return best;
  }

  function keyFor(target) {
    return target ? (target.kind + ":" + (target.id || "")) : null;
  }
  function ensureRingFor(target) {
    var key = keyFor(target);
    if (highlightRings[key]) return highlightRings[key];
    // Stage 9.2 removed the single dropoffGroup (the drop-off zone is now
    // 3 separate bookcase groups) — dropoffAnchor itself is a direct
    // scene child with its own real position, so it's used directly here
    // instead of a group that no longer exists as one object.
    var anchorPos = target.kind === "dropoff" ? dropoffAnchor.position : machineGroups[target.id].position;
    var ring = buildHighlightRing(anchorPos.x, anchorPos.z);
    highlightRings[key] = ring;
    return ring;
  }
  function setHighlight(target) {
    var prevKey = keyFor(highlighted);
    var nextKey = keyFor(target);
    if (prevKey === nextKey) return;
    if (highlighted && highlightRings[prevKey]) highlightRings[prevKey].visible = false;
    highlighted = target;
    if (highlighted) ensureRingFor(highlighted).visible = true;
  }
  window.__laundryHighlighted = function () { return highlighted; };

  // --- live machine state, via GET /laundry/machines-state and the
  // existing /events SSE stream. Colours mirror the exact hex values
  // src/views.ts's .state-* CSS classes use for the same BoardState
  // values (src/board-state.ts), so the 3D scene and the 2D board never
  // disagree about what a colour means. Applied to each machine's own
  // status-light disc (built above, alongside the model) rather than the
  // model itself — see that declaration's comment for why whole-model
  // recolouring was tried and dropped. Note: the "unclaimed" key here is
  // BoardState's own meaning ("your turn, but position 1 isn't yours" —
  // red/alert), a different concept entirely from entry.unclaimedLaundry
  // below (a done-and-not-yet-collected reservation sitting on the
  // machine) — see UNCLAIMED_LAUNDRY_COLOR, which overrides this table
  // when that's the case. ---
  var STATE_COLOR = {
    "free": 0x1f6f5c, "running": 0x2b5f8a, "claimed": 0x2b5f8a,
    "your-turn": 0xb5402a, "unclaimed": 0xb5402a,
    "nearly-your-turn": 0x6b6358, "waiting": 0x6b6358,
  };
  // Stage 10: used to be a separate floating ring (unclaimedMarkers,
  // below in history) stacked above the status light — redundant, two
  // indicator systems for related information, per the user's own
  // feedback. Folded into the light's own colour instead: a machine with
  // unclaimed laundry shows this colour regardless of what entry.state's
  // own colour would otherwise be, freeing the ring's old screen position
  // for the number label added above. Kept as its own named constant
  // (not reusing a STATE_COLOR entry) since it's keyed off a different
  // field (entry.unclaimedLaundry, a boolean alongside entry.state, not
  // a BoardState value itself) and needs to visually win over any of
  // them.
  var UNCLAIMED_LAUNDRY_COLOR = 0xffd54a;

  var lastKnownState = {};
  window.__laundryLastKnownState = lastKnownState;
  var stateEverPainted = false;

  // lastKnownUnclaimed tracks entry.unclaimedLaundry per machine (not just
  // entry.state) — flashClaimed's own "restore to the real colour after
  // the flash" needs to know which of the two colour sources currently
  // wins, since a machine freshly claimed could, in principle, also still
  // be showing a stale done-and-uncollected reservation from before.
  var lastKnownUnclaimed = {};
  function realColorFor(machineId) {
    return lastKnownUnclaimed[machineId] ? UNCLAIMED_LAUNDRY_COLOR : STATE_COLOR[lastKnownState[machineId]];
  }
  // plans/laundry-dropoff-flow.md: which room's unclaimed laundry is
  // sitting on each machine, read by the pickup confirm overlay's copy
  // ("Move room123's laundry?") — a separate small map alongside the
  // other lastKnown* caches above, not a new "full entry" cache, matching
  // this file's existing pattern of tracking only the specific fields a
  // later read actually needs.
  var lastKnownUnclaimedRoom = {};

  var FLASH_COLOR = 0xffd54a;
  var FLASH_MS = 700;
  var flashingUntil = {};
  var flashCount = {};
  function flashClaimed(machineId) {
    var light = statusLights[machineId];
    if (!light) return;
    light.material.color.setHex(FLASH_COLOR);
    light.material.emissive.setHex(FLASH_COLOR);
    flashingUntil[machineId] = Date.now() + FLASH_MS;
    flashCount[machineId] = (flashCount[machineId] || 0) + 1;
    setTimeout(function () {
      flashingUntil[machineId] = 0;
      var realColor = realColorFor(machineId);
      light.material.color.setHex(realColor);
      light.material.emissive.setHex(realColor);
    }, FLASH_MS);
  }
  window.__laundryFlashCount = flashCount;

  var canHandoffOn = {}; // machineId -> bool, the viewer's own permission, read by the click handler below

  function applyMachineState(entries) {
    entries.forEach(function (entry) {
      var light = statusLights[entry.id];
      if (!light) return;

      var previous = lastKnownState[entry.id];
      var justClaimed = stateEverPainted && previous !== "claimed" && entry.state === "claimed";

      // Stage 10: unclaimed laundry (a done-but-not-collected reservation
      // sitting on this machine) takes visual precedence over the
      // machine's own queue state — a machine can simultaneously read
      // "free" per queue state and still hold someone's unclaimed laundry,
      // and that's the more actionable fact to show. This is the same
      // precedence the old separate ring used to express as its own
      // independent visibility flag, folded here into one light's colour
      // choice instead of two indicator systems.
      lastKnownUnclaimed[entry.id] = !!entry.unclaimedLaundry;
      lastKnownUnclaimedRoom[entry.id] = entry.unclaimedLaundry ? entry.unclaimedLaundry.room : null;
      var color = entry.unclaimedLaundry ? UNCLAIMED_LAUNDRY_COLOR : STATE_COLOR[entry.state];
      var flashActive = (flashingUntil[entry.id] || 0) > Date.now();
      if (color != null && !flashActive) {
        light.material.color.setHex(color);
        light.material.emissive.setHex(color);
      }

      lastKnownState[entry.id] = entry.state;
      if (justClaimed) flashClaimed(entry.id);

      canHandoffOn[entry.id] = !!(entry.unclaimedLaundry && entry.unclaimedLaundry.canHandOff);

      // plans/laundry-scan-gated-claim.md Stage 6.2: switched from
      // entry.isMine (true for ANY active reservation on this machine —
      // still queued, already claimed, already running) to entry.isMyTurn
      // (true only when this viewer is front-of-queue and still
      // "waiting" — exactly claim()'s own scan-gate precondition). A
      // resident holding two machines at once (MAX_ACTIVE_PER_TYPE = 2)
      // used to see this marker on both regardless of which one actually
      // needed a scan-and-claim right now; isMyTurn already existed on
      // this same payload (src/app.ts's GET /laundry/machines-state) and
      // was simply never read here before.
      var mineMarker = mineMarkers[entry.id];
      if (mineMarker) mineMarker.visible = !!entry.isMyTurn;
    });
    stateEverPainted = true;
  }

  // plans/laundry-dropoff-flow.md: basket visibility and kind are now
  // driven entirely from this one server payload, not set ad hoc inside
  // the pickup/place click handlers — removes the old two-sources-of-
  // truth bug class (a local "still carrying it" flag racing the
  // server's own already-updated state), not just this one instance of
  // it. carryingFromMachine (also server state, not a client-only
  // variable) is what the drop-off examine's "place" action needs to know
  // which machine's laundry is being carried — surviving a page reload
  // mid-carry, unlike the old pendingHandoffSpot client variable.
  var carryingFromMachine = null;
  function applyBasketState(data) {
    setBasketVisible(!!data.myBasketVisible);
    setBasketKind(data.basketKind === "other" ? "other" : "own");
    carryingFromMachine = data.carryingFromMachine == null ? null : data.carryingFromMachine;
  }

  function refetchMachineState() {
    fetch("/laundry/machines-state", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        applyMachineState(data.machines || []);
        applyBasketState(data);
        applySpotOccupancy(data.occupiedSpots);
      })
      .catch(function () { /* a transient fetch failure just leaves the last-known state showing */ });
  }
  window.__laundryRefetchMachineState = refetchMachineState;

  refetchMachineState();

  var laundrySource = new EventSource("/events");
  laundrySource.addEventListener("changed", refetchMachineState);
  machines.forEach(function (m) {
    laundrySource.addEventListener("machine-" + m.id, refetchMachineState);
  });

  // --- plans/laundry-presence.md: seeing other residents' characters in
  // the shared 3D room. Deliberately a separate SSE stream from /events
  // above — presence is continuous, high-frequency state (a walking
  // character's position changes every frame), not a discrete change
  // signal, so it doesn't belong on the same digest-diffing tick. ---
  var tabId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Math.random());

  var lastReportAt = 0;
  var REPORT_INTERVAL_MS = 200;
  function reportPresence(now) {
    if (now - lastReportAt < REPORT_INTERVAL_MS) return;
    lastReportAt = now;
    fetch("/laundry/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tabId: tabId,
        x: characterRoot.position.x,
        z: characterRoot.position.z,
        yaw: characterRoot.rotation.y,
        moving: wasMoving,
      }),
      keepalive: true, // survives a page unload that happens to race the last report
    }).catch(function () { /* a dropped report just means this tick's position arrives late/not at all — the next tick corrects it */ });
  }

  function sendLeaveBeacon() {
    var body = JSON.stringify({ tabId: tabId });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/laundry/presence/leave", new Blob([body], { type: "application/json" }));
    }
  }
  window.addEventListener("pagehide", sendLeaveBeacon);

  // A deterministic hash, not a random colour — the same room number
  // always renders the same colour across every connected browser and
  // across a reload, which matters for actually recognizing "that's
  // room304 again," not an arbitrary colour that changes every visit.
  // identity is always ADR 0004-validated (room + 1-4 digits) by the
  // server before it's ever broadcast, so there's no untrusted-input
  // concern in hashing it here.
  //
  // Stage 3 found the rolling hash alone wasn't enough: hash = hash*31 +
  // charCode has no mixing step, so two identities differing by 1 in
  // their last character (room502 vs room503 — an entirely ordinary case,
  // two residents on the same floor) hash to nearly the same number and
  // land on nearly the same hue, confirmed by a real two-identity
  // screenshot (both rendered as the same shade of pink). fmix32 (the
  // avalanche finalizer from MurmurHash3) spreads a 1-unit hash
  // difference across the whole hue range before the final mod, while
  // staying fully deterministic — the same identity still always maps to
  // the same hue, just not one adjacent to its numeric neighbour's.
  function fmix32(h) {
    h = h >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }
  function colourForIdentity(identity) {
    var hash = 0;
    for (var i = 0; i < identity.length; i++) hash = (hash * 31 + identity.charCodeAt(i)) >>> 0;
    var hue = fmix32(hash) % 360;
    return new THREE.Color("hsl(" + hue + ", 55%, 55%)");
  }

  var remoteCharacters = {}; // tabId -> { root, mixer, walkAction, idleAction, targetX, targetZ, targetYaw }
  window.__laundryRemoteCharacters = remoteCharacters; // Playwright-inspectable, same convention as every other piece of this file's state

  function buildRemoteCharacter(identity) {
    var root = new THREE.Group();
    scene.add(root);

    // Declared before the loadModel() call below, not after — character.glb
    // is already in modelCache by the time any remote character is ever
    // built (the local player's own character loads it first, earlier in
    // this script), so loadModel's callback fires synchronously, before
    // control would otherwise reach an entry declaration placed after
    // this call. Caught by reading the code, not by running it: an entry
    // declared after this block would be referenced (inside the callback)
    // before it's ever assigned, on every remote character after the
    // first.
    var entry = { root: root, mixer: null, walkAction: null, idleAction: null, targetX: 0, targetZ: 0, targetYaw: 0, walkWeight: 0 };

    loadModel("/models/character.glb", function (model) {
      var flatMat = new THREE.MeshStandardMaterial({ color: colourForIdentity(identity) });
      model.traverse(function (node) {
        if (node.isMesh || node.isSkinnedMesh) {
          node.material = flatMat;
          node.castShadow = true;
          // Same Stage 9.1 fix the local character needs, applied here
          // pre-emptively rather than waiting to rediscover the same bug
          // on a remote instance: a SkinnedMesh's bind-pose bounding
          // sphere goes stale the instant it animates away from rest,
          // which otherwise wrongly frustum-culls it off-screen.
          node.frustumCulled = false;
        }
      });
      root.add(model);

      if (walkClip && idleClip) {
        entry.mixer = new THREE.AnimationMixer(model);
        entry.walkAction = entry.mixer.clipAction(walkClip);
        entry.walkAction.play();
        entry.walkAction.setEffectiveWeight(0);
        entry.idleAction = entry.mixer.clipAction(idleClip);
        entry.idleAction.play();
        entry.idleAction.setEffectiveWeight(1);
      }
    });

    var label = buildLabelSprite(identity, { scale: [0.9, 0.22], panelAlpha: 0.75, fontPx: 48 });
    label.position.set(0, 1.35, 0);
    root.add(label);

    return entry;
  }

  function upsertRemoteCharacter(rec) {
    var entry = remoteCharacters[rec.tabId];
    if (!entry) {
      entry = buildRemoteCharacter(rec.identity);
      entry.root.position.set(rec.x, 0, rec.z);
      entry.root.rotation.y = rec.yaw;
      remoteCharacters[rec.tabId] = entry;
    }
    entry.targetX = rec.x;
    entry.targetZ = rec.z;
    entry.targetYaw = rec.yaw;
    entry.moving = rec.moving;
  }

  function removeRemoteCharacter(tabId) {
    var entry = remoteCharacters[tabId];
    if (!entry) return;
    scene.remove(entry.root);
    entry.root.traverse(function (node) {
      if (node.isSprite && node.material && node.material.map) node.material.map.dispose();
    });
    delete remoteCharacters[tabId];
  }

  var REMOTE_LERP = 0.25; // snappier than CAM_LERP's 0.12 — a report arrives only every ~200-250ms, so a laggier lerp would visibly trail
  function updateRemoteCharacters(dt) {
    Object.keys(remoteCharacters).forEach(function (id) {
      var rc = remoteCharacters[id];
      rc.root.position.x += (rc.targetX - rc.root.position.x) * REMOTE_LERP;
      rc.root.position.z += (rc.targetZ - rc.root.position.z) * REMOTE_LERP;
      // Yaw needs shortest-path interpolation, not a naive linear lerp —
      // a turn crossing the +-PI wraparound (e.g. from 3.0 to -3.0
      // radians, a small real turn) would otherwise spin the long way
      // around instead of the short real distance actually turned.
      // Stage 3 found this formula itself was wrong: JavaScript's % is a
      // remainder operator (sign follows the dividend), not true modulo,
      // so a negative numerator here produced a negative remainder
      // instead of wrapping into [0, TWO_PI) first, sending some turns
      // the long way around in the wrong direction. Confirmed by forcing
      // a 3.0 -> -3.0 yaw report (a small real turn across the seam) and
      // sampling mid-interpolation: the old formula gave -6 instead of
      // the correct ~0.283. Adding TWO_PI before the final % is the
      // standard always-positive-modulo fix.
      var TWO_PI = 2 * Math.PI;
      var dYaw = (((rc.targetYaw - rc.root.rotation.y + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI;
      rc.root.rotation.y += dYaw * REMOTE_LERP;

      if (rc.walkAction && rc.idleAction) {
        var targetWeight = rc.moving ? 1 : 0;
        rc.walkWeight = rc.walkWeight + (targetWeight - rc.walkWeight) * 0.2;
        rc.walkAction.setEffectiveWeight(rc.walkWeight);
        rc.idleAction.setEffectiveWeight(1 - rc.walkWeight);
      }
      if (rc.mixer) rc.mixer.update(dt);
    });
  }

  var presenceSource = new EventSource("/laundry/presence-stream");
  presenceSource.addEventListener("positions", function (e) {
    var records = JSON.parse(e.data);
    var seenTabIds = {};
    records.forEach(function (rec) {
      if (rec.tabId === tabId) return; // skip our own report — the broadcast includes every connected tab, including this one
      seenTabIds[rec.tabId] = true;
      upsertRemoteCharacter(rec);
    });
    // The server's record set is authoritative — remove any locally-
    // tracked remote character no longer present in this broadcast
    // (it left, or went stale server-side), rather than the client
    // deciding this on its own.
    Object.keys(remoteCharacters).forEach(function (id) {
      if (!seenTabIds[id]) removeRemoteCharacter(id);
    });
  });

  // --- Stage 7.3: the examine overlay (QR codes) + Stage 8.4: the
  // drop-off confirm overlay. Both are 2D HTML layers over the 3D view,
  // not a 3D in-scene zoom — a native-resolution <img> is what makes the
  // QR code actually reliably scannable (no WebGL texture-filtering
  // softness to fight, the real risk HANDOFF.md flagged from Stage 3/6's
  // old in-scene QR plane). ---
  var overlay = document.getElementById("laundry-examine-overlay");
  var overlayBody = document.getElementById("laundry-examine-body");
  var overlayClose = document.getElementById("laundry-examine-close");

  function showExamineOverlay(contentHtml) {
    if (!overlay || !overlayBody) return;
    overlayBody.innerHTML = contentHtml;
    // A previous call may have appended a .phone-frame as a sibling of
    // overlayBody (see openMachineExamine below) — drop it so a stale
    // phone from a different machine/interaction doesn't linger.
    var stalePhone = overlay.querySelector(".phone-frame");
    if (stalePhone) stalePhone.remove();
    overlay.classList.remove("is-hidden");
  }
  function hideExamineOverlay() {
    if (!overlay) return;
    overlay.classList.add("is-hidden");
  }
  if (overlayClose) overlayClose.addEventListener("click", hideExamineOverlay);

  // plans/laundry-scan-phone-simulator.md: "Simulate a phone scan" loads
  // the real scan landing route in a same-origin iframe — this is the
  // exact page a real phone's camera lands on after scanning this
  // machine's actual code (src/app.ts's GET /laundry/scan/:id), not a
  // second rendering of it, so claim/start done inside it are real
  // actions against the real database. It's a no-phone fallback for
  // someone evaluating the build (e.g. a tutor at a crit) — it does NOT
  // stand in for, or satisfy, the real two-device phone-camera scan
  // rehearsal plan.md still has outstanding, since it proves nothing
  // about whether a real camera can actually decode the QR image itself.
  //
  // plans/laundry-scan-gated-claim.md Stage 2: changed from a fixed
  // src="/" to this machine's own /laundry/scan/:id, once claim() started
  // requiring a real scan record — GET /laundry/scan/:id is the one real
  // place that record gets written (src/app.ts), so this iframe has to
  // hit that exact route for *this* machine, not the generic home page,
  // or the simulator would land on a page that then rejects its own
  // claim attempt with "scan the machine's code first," which would look
  // broken rather than simulating anything.
  function openMachineExamine(machineId) {
    var label = "Machine " + machineId;
    var m = machines.find(function (mm) { return mm.id === machineId; });
    if (m) label = m.label;
    showExamineOverlay(
      '<div>' +
        '<h3>' + label + '</h3>' +
        '<img src="/machines/' + machineId + '/qrcode.png" alt="Scan to claim or reserve ' + label + '" />' +
        '<p class="laundry-hint">Scan with your phone\\'s camera to claim or reserve this machine.</p>' +
        '<p><button type="button" class="btn-quiet" id="laundry-simulate-phone">No phone? Simulate a phone scan</button></p>' +
      '</div>'
    );
    var simBtn = document.getElementById("laundry-simulate-phone");
    if (simBtn) {
      simBtn.addEventListener("click", function () {
        simBtn.remove();
        var frame = document.createElement("div");
        frame.className = "phone-frame";
        var iframe = document.createElement("iframe");
        iframe.src = "/laundry/scan/" + machineId;
        iframe.title = "Simulated phone — the real scan landing page";
        frame.appendChild(iframe);
        // Inserted as a sibling of overlayBody, right before the close
        // button: the overlay itself is a row-flex
        // (.laundry-examine-overlay), so a sibling lands beside the QR
        // code; nesting it inside overlayBody (a column-flex) stacked it
        // underneath instead. Inserting before overlayClose (rather than
        // appending, which would land after it) keeps the close button
        // visually last, not sandwiched between the QR code and the phone.
        if (overlay) overlay.insertBefore(frame, overlayClose || null);
      });
    }
  }

  // plans/laundry-dropoff-flow.md: pickup is now a real confirm step, not
  // an immediate action on interact — per the user's own request, and
  // because the server now creates real IN_TRANSIT state on "pick up," so
  // an accidental double-interact shouldn't fire it without a chance to
  // back out. unclaimedRoomFor(machineId) reads the room name already
  // shown on this machine's status card in the 2D board — the confirm
  // copy names whose laundry this is, matching the user's own requested
  // wording ("Move room123's finished laundry to the shelf?").
  function unclaimedRoomFor(machineId) {
    return lastKnownUnclaimedRoom[machineId] || "this room";
  }

  function doPickup(machineId) {
    fetch("/machines/" + machineId + "/pickup", { method: "POST" })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        if (!result.ok) {
          showExamineOverlay("<h3>Can't move this laundry</h3><p>" + (result.body.error || "Something went wrong.") + "</p>");
          return;
        }
        refetchMachineState(); // picks up the server's own carryingFromMachine/basketKind right away, not on the next SSE tick
        showExamineOverlay(
          "<h3>Picked up</h3><p>Carry this to the drop-off table to place it on a shelf.</p>"
        );
      })
      .catch(function () {
        showExamineOverlay("<h3>Can't move this laundry</h3><p>Something went wrong — try again.</p>");
      });
  }

  function openHandoffExamine(machineId) {
    var room = unclaimedRoomFor(machineId);
    showExamineOverlay(
      "<h3>Move " + room + "'s laundry?</h3>" +
      "<p>Move " + room + "'s finished laundry to the drop-off shelf so this machine is free?</p>" +
      '<p><button type="button" class="btn-primary" id="laundry-confirm-pickup">Pick up</button></p>'
    );
    var confirmBtn = document.getElementById("laundry-confirm-pickup");
    if (confirmBtn) confirmBtn.addEventListener("click", function () { doPickup(machineId); });
  }

  function openDropoffExamine() {
    if (carryingFromMachine == null) {
      showExamineOverlay("<h3>Drop-off table</h3><p>Nothing to place here right now.</p>");
      return;
    }
    var machineId = carryingFromMachine;
    showExamineOverlay(
      "<h3>Place it here?</h3>" +
      '<p class="laundry-hint">The server will pick the next free numbered shelf spot.</p>' +
      '<p><button type="button" class="btn-primary" id="laundry-confirm-placed">Confirm placed</button></p>'
    );
    var confirmBtn = document.getElementById("laundry-confirm-placed");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        fetch("/machines/" + machineId + "/place", { method: "POST" })
          .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
          .then(function (result) {
            if (!result.ok) {
              showExamineOverlay("<h3>Can't place it here</h3><p>" + (result.body.error || "Something went wrong.") + "</p>");
              return;
            }
            refetchMachineState(); // restores correct own-basket visibility immediately, rather than waiting for the next SSE tick
            showExamineOverlay(
              "<h3>Placed on Shelf " + result.body.spot + "</h3>" +
              '<p>You placed the laundry on Shelf ' + result.body.spot + ' — <a href="/">open the app</a> to let them know.</p>'
            );
          })
          .catch(function () {
            showExamineOverlay("<h3>Can't place it here</h3><p>Something went wrong — try again.</p>");
          });
      });
    }
  }

  function handleInteract() {
    if (!highlighted) return;
    if (highlighted.kind === "machine") {
      if (canHandoffOn[highlighted.id]) {
        openHandoffExamine(highlighted.id);
      } else {
        openMachineExamine(highlighted.id);
      }
    } else if (highlighted.kind === "dropoff") {
      openDropoffExamine();
    }
  }
  window.__laundryInteract = handleInteract; // Playwright-inspectable: simulate the interact action deterministically

  renderer.domElement.addEventListener("click", function () {
    if (overlay && !overlay.classList.contains("is-hidden")) return; // a click landing on the open overlay shouldn't also fire an interaction underneath it
    if (dragDistance > CLICK_DRAG_THRESHOLD) return; // this click was the release end of a look-drag, not a deliberate click
    handleInteract();
  });
  window.addEventListener("keydown", function (e) {
    if (e.key.toLowerCase() === "e" || e.key === "Enter") handleInteract();
  });

  // --- render loop ---
  var last = performance.now();
  // Tracked across frames so reportPresence() below can broadcast whether
  // this resident is currently moving (drives the walk/idle animation
  // weight on every other viewer's screen).
  //
  // Stage 9.4/laundry-presence era code used to also snap
  // characterRoot.rotation.y to the camera's own yaw the instant movement
  // stopped — removed at the user's request: with drag-to-look as the
  // camera scheme, "yaw" tracks wherever the player last dragged the
  // camera to look, not necessarily the direction they were walking, so
  // the character visibly spun to face the camera/viewer on every stop
  // regardless of which way it had actually been walking. The character
  // now simply keeps its last walking-direction facing (set via
  // Math.atan2(dx, dz) below) once it stops, the same way a real person
  // doesn't snap to face forward the instant they stop walking.
  var wasMoving = false;

  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    var forwardInput = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) + joystickVector.y * -1;
    var strafeInput = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + joystickVector.x;
    forwardInput = Math.max(-1, Math.min(1, forwardInput));
    strafeInput = Math.max(-1, Math.min(1, strafeInput));
    var moving = forwardInput !== 0 || strafeInput !== 0;

    if (moving) {
      var sinYaw = Math.sin(yaw), cosYaw = Math.cos(yaw);
      var fx = -sinYaw, fz = -cosYaw;
      var rx = cosYaw, rz = -sinYaw;
      var dx = (fx * forwardInput + rx * strafeInput) * MOVE_SPEED * dt;
      var dz = (fz * forwardInput + rz * strafeInput) * MOVE_SPEED * dt;
      var next = clampToRoom(pos.x + dx, pos.z + dz);
      pos.x = next.x;
      pos.z = next.z;
      characterRoot.position.set(pos.x, 0, pos.z);
      // Facing tracks movement direction — the standard third-person
      // convention, not wherever the camera happens to be looking.
      characterRoot.rotation.y = Math.atan2(dx, dz);
    }
    // On stop, characterRoot.rotation.y is simply left at whatever it was
    // during the last step — no snap to the camera's yaw (see the comment
    // on wasMoving above for why that was removed).
    wasMoving = moving;

    if (walkAction && idleAction) {
      var targetWalkWeight = moving ? 1 : 0;
      walkAction.setEffectiveWeight(walkAction.getEffectiveWeight() + (targetWalkWeight - walkAction.getEffectiveWeight()) * 0.2);
      idleAction.setEffectiveWeight(1 - walkAction.getEffectiveWeight());
    }
    if (characterMixer) characterMixer.update(dt);

    setHighlight(nearestInteractable());
    updateCamera();
    reportPresence(now);
    updateRemoteCharacters(dt);

    // Stage 10: bob every visible "this machine is yours" marker up and
    // down — a static marker (even in an attention colour) is easy to
    // miss in a room with ten machines; motion is what actually draws the
    // eye at a glance. Driven by wall-clock time (now), not dt-accumulated
    // state, so every marker bobs in sync regardless of how many frames
    // have run, and the animation doesn't drift or need its own reset
    // when a marker's visibility toggles on.
    var bobOffset = Math.sin(now * 0.003) * 0.06;
    for (var mId in mineMarkers) {
      var marker = mineMarkers[mId];
      if (marker.visible) marker.position.y = marker.userData.baseY + bobOffset;
    }

    renderer.render(scene, camera);
    window.requestAnimationFrame(frame);
  }

  resize();
  window.requestAnimationFrame(frame);

  // Playwright-inspectable hooks for verification.
  window.__laundryDebug = {
    getCharacterPosition: function () { return { x: pos.x, z: pos.z, yaw: yaw }; },
    pressKey: function (k) { keys[k] = true; },
    releaseKey: function (k) { keys[k] = false; },
    teleportTo: function (x, z) { pos.x = x; pos.z = z; characterRoot.position.set(x, 0, z); },
    getWalkWeight: function () { return walkAction ? walkAction.getEffectiveWeight() : null; },
    _debugCollisionBoxes: function () { return collisionBoxes; },
    _debugScene: function () {
      return {
        cameraPos: camera.position.toArray(),
        cameraQuat: camera.quaternion.toArray(),
        sceneChildCount: scene.children.length,
        northZ: northZ, southZ: southZ, roomHalfWidth: roomHalfWidth, roomHalfDepth: roomHalfDepth,
      };
    },
    // Stage 9.1's own verification hook — reads each character mesh's
    // real world position (worldPos) alongside characterRoot.position
    // (rootPos, below): the two matching is exactly what confirms the
    // root-motion fix above is holding (a nonzero gap between them is
    // the disappearing-character bug recurring, not a new issue).
    _debugCharacter: function () {
      var modelChild = characterRoot.children[0];
      var meshes = [];
      if (modelChild) {
        modelChild.traverse(function (n) {
          if (n.isMesh || n.isSkinnedMesh) {
            meshes.push({
              name: n.name,
              visible: n.visible,
              frustumCulled: n.frustumCulled,
              hasBoundingSphere: !!(n.geometry && n.geometry.boundingSphere),
              boundingSphere: n.geometry && n.geometry.boundingSphere
                ? { center: n.geometry.boundingSphere.center.toArray(), radius: n.geometry.boundingSphere.radius }
                : null,
              worldPos: n.getWorldPosition(new THREE.Vector3()).toArray(),
              scale: n.scale.toArray(),
            });
          }
        });
      }
      var box = modelChild ? new THREE.Box3().setFromObject(modelChild) : null;
      return {
        rootPos: characterRoot.position.toArray(),
        rootVisible: characterRoot.visible,
        childCount: characterRoot.children.length,
        modelChildExists: !!modelChild,
        modelChildVisible: modelChild ? modelChild.visible : null,
        modelChildScale: modelChild ? modelChild.scale.toArray() : null,
        worldBox: box ? { min: box.min.toArray(), max: box.max.toArray(), isEmpty: box.isEmpty() } : null,
        meshes: meshes,
      };
    },
    // Debugging-only: checks whether a machine's status light sits
    // inside its model's own real geometry (vs. outside it, where it
    // would actually be visible). This stage's own screenshot check used
    // this to find a real placement bug (the light's world Z landed
    // exactly where expected — on the model's far side, not floating in
    // space — but was nearly invisible against the model's own similar
    // tone until the material/size were fixed; kept here since the same
    // check is useful for any future placement change on these models).
    _statusLightVsModelBox: function (machineId) {
      var group = machineGroups[machineId];
      var light = statusLights[machineId];
      if (!group || !light) return { error: "no such machine" };
      var modelRoot = null;
      group.children.forEach(function (c) { if (c.type === "Group") modelRoot = c; });
      if (!modelRoot) return { error: "model not loaded yet" };
      var box = new THREE.Box3().setFromObject(modelRoot);
      var lightWorld = new THREE.Vector3();
      light.getWorldPosition(lightWorld);
      return {
        modelWorldBox: { min: box.min.toArray(), max: box.max.toArray() },
        lightWorldPos: lightWorld.toArray(),
        lightInsideBox: box.containsPoint(lightWorld),
      };
    },
    // Projects a world point to screen pixel coordinates against the
    // current camera/canvas — lets a screenshot crop be placed exactly
    // instead of guessed at, used throughout this stage's own visual
    // verification.
    _projectToScreen: function (worldPos) {
      var v = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
      v.project(camera);
      var w = wrap.clientWidth, h = wrap.clientHeight;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behindCamera: v.z > 1 };
    },
    // Debugging-only: snaps the camera to look directly at a world point
    // from very close range, bypassing the third-person follow camera
    // entirely — used to isolate whether something is a camera-framing
    // problem or a real rendering/occlusion problem, by putting the
    // target dead center at point-blank range where neither framing nor
    // distance could explain it being invisible.
    _snapCameraTo: function (worldPos, distance) {
      camera.position.set(worldPos[0], worldPos[1], worldPos[2] + (distance || 0.3));
      camera.lookAt(worldPos[0], worldPos[1], worldPos[2]);
    },
  };
})();
`;

export function laundryPage(machines: Machine[]): Html {
  // Stage 9.5: the room's geometry (wall positions, each machine's
  // x/z/facing) is computed once here, server-side, by
  // src/laundry-layout.ts's layoutRoom() — the same function
  // spec/laundry-layout.test.ts checks directly — and handed to the
  // client as data, instead of LAUNDRY_SCRIPT recomputing it independently
  // in the browser from just {id, label, type}.
  const layout = layoutRoom(machines.map((m) => ({ id: m.id, type: m.type })));
  return page(
    "The laundry room",
    html`<p class="laundry-hint">
      Walk around with <strong>WASD</strong> and look around by holding the
      mouse button and dragging (or use the on-screen controls on a touch
      device). Walk up to a machine or the drop-off table and press
      <strong>E</strong> (or click) to interact.
    </p>
    <div class="laundry-canvas-wrap" id="laundry-canvas-wrap">
      <div class="laundry-crosshair"></div>
      <div class="laundry-examine-overlay is-hidden" id="laundry-examine-overlay">
        <div id="laundry-examine-body"></div>
        <button type="button" class="btn-quiet" id="laundry-examine-close">Close</button>
      </div>
    </div>
    <script type="application/json" id="laundry-machines">${raw(
      JSON.stringify({
        machines: machines.map((m) => ({ id: m.id, label: m.label, type: m.type })),
        layout,
      }),
    )}</script>
    <script type="importmap">${raw(IMPORT_MAP)}</script>
    <script type="module">${raw(LAUNDRY_SCRIPT)}</script>`,
  );
}

// --- Stage 3: the scan landing page -------------------------------------
//
// plans/3d-walkthrough.md Stage 3 / docs/adr/0012: GET /laundry/scan/:id
// branches into exactly the cases plan.md's own User story describes for
// "walk up and scan a machine's code on site" — built entirely from
// existing queue.ts reads (queueFor) and existing action routes
// (POST /reservations/:id/claim, POST /machines/:id/reservations); no new
// queue.ts function, no new way to join/claim beyond what the home page's
// own buttons already call.

function washingTypeOptionsFor(machineType: Machine["type"]): Html {
  const types = machineType === "dryer" ? DRYING_TYPES : WASHING_TYPES;
  return html`${Object.entries(types).map(([value, type]) => html`<option value="${value}">${type.label} (${type.minutes} min)</option>`)}`;
}

// Case: this room is the front, waiting reservation on this machine —
// Bill's own "confirm" case (plans/3d-walkthrough.md's background).
function scanClaimConfirm(machine: Machine, reservationId: number): Html {
  return html`<p>You're up for <strong>${machine.label}</strong>.</p>
    <form method="post" action="/reservations/${reservationId}/claim">
      <button class="btn-primary" type="submit">Claim ${machine.label}</button>
    </form>`;
}

// Case: machine is fully idle and this room has no reservation on it —
// ships plan.md's own long-standing, never-built-until-now User story
// line: "walk up and scan a machine's code on site... opens that
// machine's reservation directly."
function scanReservationForm(machine: Machine): Html {
  return html`<p><strong>${machine.label}</strong> is free.</p>
    <form method="post" action="/machines/${machine.id}/reservations">
      <select name="washingType">${washingTypeOptionsFor(machine.type)}</select>
      <button class="btn-primary" type="submit">Reserve ${machine.label}</button>
    </form>`;
}

// Case: anything else (occupied by someone else, or this room is queued
// elsewhere on it but not at the front) — read-only, reusing the exact
// same boardRow rendering the 2D board already uses for this machine,
// rather than inventing a third way to render queue state.
function scanReadOnly(machine: Machine, rows: QueueRow[], identity: string, now: number): Html {
  return html`<div class="board">
    <div class="board-row board-head"><span>Machine</span><span>State</span><span>Next</span><span>Time left</span></div>
    ${machineCard(machine, rows, identity, now)}
  </div>`;
}

export function scanPage(machine: Machine, rows: QueueRow[], identity: string, now: number): Html {
  const front = rows[0];
  const mine = rows.find((r) => r.person === identity);
  const body =
    front && front.person === identity && front.status === "waiting"
      ? scanClaimConfirm(machine, front.reservationId)
      : !mine && rows.length === 0
        ? scanReservationForm(machine)
        : scanReadOnly(machine, rows, identity, now);

  return page(`Scan — ${machine.label}`, html`<h2>${machine.label}</h2>${body}<p><a href="/laundry">← Back to the laundry</a></p>`);
}

// Case: no `person` cookie on this device yet — the existing identity
// page, with `redirect` set to come straight back to this machine's scan
// URL once a room number is entered, per docs/adr/0012/the plan's Decision
// 2 (this is the "log-in page" shape Bill described, without inventing a
// second identity mechanism — ADR 0004 stays exactly as it was).
//
// docs/adr/0012's addendum: `roomPrefill`, when the QR code's own ?room=
// carried an already-validated room number, fills the form field so the
// phone's own visitor doesn't have to retype a number they likely already
// typed once on the desktop session that showed them this code — they
// still press "Continue" themselves.
export function scanIdentityPage(machineId: number, roomPrefill?: string): Html {
  return identityPage(`/laundry/scan/${machineId}`, roomPrefill);
}
