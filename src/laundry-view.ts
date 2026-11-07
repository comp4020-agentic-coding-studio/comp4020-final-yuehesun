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
  addWall(0, roomHalfDepth, roomHalfWidth * 2, 0.15);
  addWall(-roomHalfWidth, 0, 0.15, roomHalfDepth * 2);
  addWall(roomHalfWidth, 0, 0.15, roomHalfDepth * 2);

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
  // graph cheaply for each placed instance. ---
  var gltfLoader = new GLTFLoader();
  var modelCache = {};
  function loadModel(url, onReady) {
    if (modelCache[url]) { onReady(modelCache[url].scene.clone(true)); return; }
    gltfLoader.load(url, function (gltf) {
      modelCache[url] = gltf;
      onReady(gltf.scene.clone(true));
    }, undefined, function (err) {
      console.error("failed to load " + url, err);
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
  function footprintOf(type) {
    var b = MODEL_BBOX[type] || MODEL_BBOX.washer;
    var scale = (type === "washer" || type === "dryer") ? MACHINE_SCALE : 1;
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
  });
  window.__laundryMachineGroups = machineGroups; // Playwright-inspectable escape hatch
  window.__laundryStatusLights = statusLights;

  // --- Stage 9.2: sink + ironing table merge into one free-standing
  // island in open floor (replacing Stage 8.2's two separate west-wall
  // positions — the west wall is now the drop-off zone, below), roughly
  // centered in the room. Both models and their already-measured
  // collision footprints (sink 0.5x0.5, table 0.85x0.45) are unchanged
  // from Stage 8.2, just recombined under one shared placement. ---
  var islandX = 0;
  var islandZ = (northZ + southZ) / 2;
  var sinkLocalX = -0.55;
  var ironLocalX = 0.5;

  addCollisionBox(islandX + sinkLocalX, islandZ, 0.5, 0.5);
  loadModel("/models/kitchenSink.glb", function (model) {
    model.position.set(islandX + sinkLocalX - 0.25, 0, islandZ - 0.25);
    model.traverse(function (n) { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    scene.add(model);
  });

  addCollisionBox(islandX + ironLocalX, islandZ, 0.85, 0.45);
  loadModel("/models/table.glb", function (model) {
    model.position.set(islandX + ironLocalX - 0.42, 0, islandZ - 0.22);
    model.traverse(function (n) { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    scene.add(model);
    // a plain box "iron" prop on top — the plan's own "no need to source
    // a separate iron model" note.
    var tableBox = new THREE.Box3().setFromObject(model);
    var iron = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.08, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x6b6358 }),
    );
    iron.position.set(islandX + ironLocalX, tableBox.max.y + 0.04, islandZ);
    iron.castShadow = true;
    scene.add(iron);
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
  var BASKET_OWN_COLOR = 0xb5402a; // --alert, distinct and visible
  var BASKET_OTHER_COLOR = 0x2b5f8a; // --info, visually distinct from the player's own basket
  var basketMesh = null;
  var basketVisible = false;
  var basketKind = "own"; // "own" | "other" — 8.4's two distinct carried-basket states

  function buildBasket() {
    // A simple hand-built lattice-ish box prop — plan's own "not worth
    // extensive sourcing effort for one small prop" note. Positioned at
    // roughly waist/carry height in front of the character.
    var basket = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color: BASKET_OWN_COLOR }),
    );
    basket.position.set(0, 0.32, 0.18);
    basket.castShadow = true;
    return basket;
  }

  function setBasketVisible(visible) {
    basketVisible = visible;
    if (basketMesh) basketMesh.visible = visible;
  }
  function setBasketKind(kind) {
    basketKind = kind;
    if (basketMesh) basketMesh.material.color.setHex(kind === "other" ? BASKET_OTHER_COLOR : BASKET_OWN_COLOR);
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
    var flatMat = new THREE.MeshStandardMaterial({ color: 0xd9a066 });
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

    basketMesh = buildBasket();
    basketMesh.visible = false;
    characterRoot.add(basketMesh);

    // Animations: the GLTF ships many (idle/walk/pick-up/etc. — confirmed
    // directly against the downloaded file before writing this); only
    // idle and walk are used here, found by name rather than assumed index.
    // window.__laundryGltfAnimations is exposed for a quick Playwright
    // sanity check that the expected clip names actually exist, without
    // needing to re-inspect the raw GLB from a test.
  }, function () {});

  // loadModel's callback signature above doesn't carry the raw gltf (it
  // clones gltf.scene only, deliberately, since clones are what every
  // other model placement above uses for cache-sharing) — animations need
  // the original gltf.animations array, so the character is loaded once
  // more, directly, just for its AnimationClip data. This is the one
  // model not using the loadModel()/modelCache path, by necessity: an
  // AnimationMixer must run against the exact clone it was built for.
  // Stage 9.1 fix (1 of 2 — the disappearing-character bug had two
  // independent causes stacked together, not one): the "walk" clip
  // (unlike "idle") ships a "root.position" keyframe track — Kenney's rig
  // has a top-level "root" Bone (parent of every other bone, confirmed by
  // a real scene-graph dump: Group > Object3D > Bone "root" >
  // {leg-left, leg-right, torso{arm-left, arm-right, head}}, with
  // body-mesh/head-mesh as SkinnedMeshes siblings of "root"). That track
  // moves the root BONE's own local position every frame the walk
  // animation plays, which (since every other bone and both skinned
  // meshes hang off it) drags the whole character's real world-space
  // position away from whatever characterRoot.position (the Object3D
  // this file actually drives) says it should be — confirmed by a live
  // Box3().setFromObject() reading on the character diverging further
  // from characterRoot.position the longer "w" was held. This alone
  // explained long-held-movement disappearance (the mesh drifting
  // entirely outside the camera's view); it did NOT explain a shorter
  // repro where the mesh vanished with zero measured drift — that
  // turned out to be a second, independent bug, fixed separately where
  // frustumCulled is set below. The fix here removes the root-motion
  // track from the walk clip before ever creating its AnimationAction,
  // so only its rotation tracks (the actual arm/leg swing) play —
  // characterRoot's own position, set once per frame in the render loop
  // below, is the only thing that ever moves the character through the
  // room.
  function stripRootMotion(clip) {
    clip.tracks = clip.tracks.filter(function (t) { return t.name !== "root.position"; });
    return clip;
  }

  gltfLoader.load("/models/character.glb", function (gltf) {
    window.__laundryGltfAnimations = gltf.animations.map(function (a) { return a.name; });
    characterMixer = new THREE.AnimationMixer(characterRoot.children[0] || characterRoot);
    walkClip = THREE.AnimationClip.findByName(gltf.animations, "walk");
    idleClip = THREE.AnimationClip.findByName(gltf.animations, "idle");
    if (walkClip) { stripRootMotion(walkClip); walkAction = characterMixer.clipAction(walkClip); walkAction.play(); walkAction.setEffectiveWeight(0); }
    if (idleClip) { idleAction = characterMixer.clipAction(idleClip); idleAction.play(); idleAction.setEffectiveWeight(1); }
  });

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
  var CAM_DISTANCE = 3.2, CAM_HEIGHT = 1.8;
  var CAM_LERP = 0.12; // per-frame ease factor, not a time-scaled lerp — simple and stable at this fixed-ish frame rate

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

  var desiredCamPos = new THREE.Vector3();
  var desiredCamTarget = new THREE.Vector3();
  function updateCamera() {
    // Camera rig offset behind/above the character, per the character's
    // own yaw (research/3d-booking/asset-sourcing.md's cited third-person
    // pattern: a pivot behind the character, lerping toward its target
    // transform rather than snapping).
    var backX = Math.sin(yaw) * CAM_DISTANCE;
    var backZ = Math.cos(yaw) * CAM_DISTANCE;
    var rawX = characterRoot.position.x + backX, rawZ = characterRoot.position.z + backZ;
    var clamped = clampCameraPos(rawX, rawZ);
    desiredCamPos.set(clamped.x, CAM_HEIGHT + Math.sin(pitch) * 1.2, clamped.z);
    camera.position.lerp(desiredCamPos, CAM_LERP);
    desiredCamTarget.set(characterRoot.position.x, 0.9, characterRoot.position.z);
    camera.lookAt(desiredCamTarget);
  }
  characterRoot.position.set(pos.x, 0, pos.z);
  var initialCam = clampCameraPos(pos.x, pos.z + CAM_DISTANCE);
  camera.position.set(initialCam.x, CAM_HEIGHT, initialCam.z);
  camera.lookAt(pos.x, 0.9, pos.z);

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
  // recolouring was tried and dropped. ---
  var STATE_COLOR = {
    "free": 0x1f6f5c, "running": 0x2b5f8a, "claimed": 0x2b5f8a,
    "your-turn": 0xb5402a, "unclaimed": 0xb5402a,
    "nearly-your-turn": 0x6b6358, "waiting": 0x6b6358,
  };

  var lastKnownState = {};
  window.__laundryLastKnownState = lastKnownState;
  var stateEverPainted = false;

  var FLASH_COLOR = 0xffd54a;
  var FLASH_MS = 700;
  var flashingUntil = {};
  var flashCount = {};
  function flashClaimed(machineId) {
    var light = statusLights[machineId];
    if (!light) return;
    var realColor = STATE_COLOR["claimed"];
    light.material.color.setHex(FLASH_COLOR);
    light.material.emissive.setHex(FLASH_COLOR);
    flashingUntil[machineId] = Date.now() + FLASH_MS;
    flashCount[machineId] = (flashCount[machineId] || 0) + 1;
    setTimeout(function () {
      flashingUntil[machineId] = 0;
      light.material.color.setHex(realColor);
      light.material.emissive.setHex(realColor);
    }, FLASH_MS);
  }
  window.__laundryFlashCount = flashCount;

  // Stage 8.4: a distinct marker above any machine still holding someone
  // else's unclaimed laundry, visible to everyone (not just the room that
  // could act on it) so it reads as a real room feature, not a
  // per-viewer secret. A small floating ring, separate from the
  // highlight outline (which only shows on proximity), using a colour
  // distinct from every STATE_COLOR value above.
  var UNCLAIMED_MARKER_COLOR = 0xffd54a;
  var unclaimedMarkers = {}; // machineId -> Mesh
  function setUnclaimedMarker(machineId, visible) {
    var group = machineGroups[machineId];
    if (!group) return;
    if (!unclaimedMarkers[machineId]) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.025, 8, 24),
        new THREE.MeshStandardMaterial({ color: UNCLAIMED_MARKER_COLOR, emissive: UNCLAIMED_MARKER_COLOR, emissiveIntensity: 0.4 }),
      );
      // Stage 9.4.4 fix: this used to be a hardcoded literal (0.47 + 0.25,
      // "0.47 ≈ the real washer/dryer model's own measured height") —
      // harmless only by coincidence, since 0.47 happened to equal the
      // real unscaled height; it would have silently stopped matching the
      // model's real (now MACHINE_SCALE'd) top the moment the scale
      // changed, with nothing pointing at why. Reading footprint.h here
      // keeps this in sync with the model's actual current size the same
      // way every other placement in this file already does.
      var mInfo = machines.find(function (mm) { return mm.id === machineId; });
      var footprint = footprintOf(mInfo && mInfo.type === "dryer" ? "dryer" : "washer");
      ring.position.set(0, footprint.h + 0.25, 0);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      unclaimedMarkers[machineId] = ring;
    }
    unclaimedMarkers[machineId].visible = visible;
  }
  window.__laundryUnclaimedMarkers = unclaimedMarkers;

  var canHandoffOn = {}; // machineId -> bool, the viewer's own permission, read by the click handler below

  function applyMachineState(entries) {
    entries.forEach(function (entry) {
      var light = statusLights[entry.id];
      if (!light) return;

      var previous = lastKnownState[entry.id];
      var justClaimed = stateEverPainted && previous !== "claimed" && entry.state === "claimed";

      var color = STATE_COLOR[entry.state];
      var flashActive = (flashingUntil[entry.id] || 0) > Date.now();
      if (color != null && !flashActive) {
        light.material.color.setHex(color);
        light.material.emissive.setHex(color);
      }

      lastKnownState[entry.id] = entry.state;
      if (justClaimed) flashClaimed(entry.id);

      setUnclaimedMarker(entry.id, !!entry.unclaimedLaundry);
      canHandoffOn[entry.id] = !!(entry.unclaimedLaundry && entry.unclaimedLaundry.canHandOff);
    });
    stateEverPainted = true;
  }

  function applyBasketState(myBasketVisible) {
    setBasketVisible(!!myBasketVisible);
  }

  function refetchMachineState() {
    fetch("/laundry/machines-state", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;
        applyMachineState(data.machines || []);
        applyBasketState(data.myBasketVisible);
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
  var pendingHandoffSpot = null; // set once a handoff succeeds, shown when the player reaches the drop-off area

  function showExamineOverlay(contentHtml) {
    if (!overlay || !overlayBody) return;
    overlayBody.innerHTML = contentHtml;
    overlay.classList.remove("is-hidden");
  }
  function hideExamineOverlay() {
    if (!overlay) return;
    overlay.classList.add("is-hidden");
  }
  if (overlayClose) overlayClose.addEventListener("click", hideExamineOverlay);

  function openMachineExamine(machineId) {
    var label = "Machine " + machineId;
    var m = machines.find(function (mm) { return mm.id === machineId; });
    if (m) label = m.label;
    showExamineOverlay(
      '<h3>' + label + '</h3>' +
      '<img src="/machines/' + machineId + '/qrcode.png" alt="Scan to claim or reserve ' + label + '" />' +
      '<p class="laundry-hint">Scan with your phone\\'s camera to claim or reserve this machine.</p>'
    );
  }

  function openHandoffExamine(machineId) {
    fetch("/machines/" + machineId + "/handoff", { method: "POST" })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        if (!result.ok) {
          showExamineOverlay("<h3>Can't move this laundry</h3><p>" + (result.body.error || "Something went wrong.") + "</p>");
          return;
        }
        pendingHandoffSpot = result.body.spot;
        setBasketKind("other");
        setBasketVisible(true);
        showExamineOverlay(
          "<h3>Picked up</h3><p>Carry this to the drop-off table — Shelf " + result.body.spot + " is waiting for it.</p>"
        );
      })
      .catch(function () {
        showExamineOverlay("<h3>Can't move this laundry</h3><p>Something went wrong — try again.</p>");
      });
  }

  function openDropoffExamine() {
    if (pendingHandoffSpot == null) {
      showExamineOverlay("<h3>Drop-off table</h3><p>Nothing to place here right now.</p>");
      return;
    }
    var spot = pendingHandoffSpot;
    showExamineOverlay(
      "<h3>Place it on Shelf " + spot + "</h3>" +
      '<p class="laundry-hint">The room has been told which shelf this is on.</p>' +
      '<p><button type="button" class="btn-primary" id="laundry-confirm-placed">Confirm placed</button></p>'
    );
    var confirmBtn = document.getElementById("laundry-confirm-placed");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        pendingHandoffSpot = null;
        setBasketKind("own");
        refetchMachineState(); // restores correct own-basket visibility immediately, rather than waiting for the next SSE tick
        hideExamineOverlay();
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
  // plans/laundry-presence.md: tracked across frames so the character's
  // own facing can be snapped to the camera's look direction exactly
  // once, on the moving-to-stopped transition — not left at whatever
  // Math.atan2(dx, dz) last computed while walking, and not continuously
  // bound to yaw either (that would make the character twitch-rotate on
  // every small mouse movement while standing still, which doesn't match
  // how a real person's body behaves while just looking around).
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
    } else if (wasMoving) {
      // Just stopped: snap facing to match the camera's own look
      // direction once, rather than leaving it pointed wherever the last
      // step happened to aim it. This also matters now that
      // characterRoot.rotation.y is broadcast to every other resident as
      // this character's yaw (see reportPresence below) — a stale facing
      // used to be a local-only cosmetic quirk; it would otherwise be a
      // visibly wrong orientation on a remote viewer's own screen too.
      characterRoot.rotation.y = yaw;
    }
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
export function scanIdentityPage(machineId: number): Html {
  return identityPage(`/laundry/scan/${machineId}`);
}
