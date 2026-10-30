import { html, raw } from "hono/html";
import type { Machine } from "./schema.ts";
import type { QueueRow } from "./queue.ts";
import { DRYING_TYPES } from "./drying-types.ts";
import { WASHING_TYPES } from "./washing-types.ts";
import { identityPage, machineCard, page, type Html } from "./views.ts";

// plans/3d-walkthrough.md Stage 1: a first-person 3D walkthrough of the
// laundry room, reachable from the home page at any time (not gated on
// having a reservation — docs/adr/0012's sibling decision in the plan).
// Split into its own file rather than growing the already-large
// src/views.ts further, the same reason src/board-state.ts was split out.
//
// Stage 1 only lays out the room and gets movement working — no live
// machine state yet (Stage 2) and no QR codes yet (Stage 3). Machine
// *positions* are computed client-side from the same {id, label, type}
// list the server already has (one JSON data island below), so Stage 2
// can bind live state onto these same objects by id with no layout
// change, and the layout automatically adapts if the machine count ever
// changes rather than assuming exactly 10.

// Pinned three.js version (checked against jsDelivr at the time this was
// written) — no bundler, loaded as a native ES module directly from the
// CDN, per docs/adr/0012 / research/3d-booking/tech-stack.md's "no build
// step" constraint. Pinning one exact version (not "latest") so a CDN
// update elsewhere can't silently change this scene's behaviour.
const THREE_VERSION = "0.180.0";
const THREE_BASE = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

// Hand-rolled yaw/pitch camera control, shared by desktop (pointer-lock
// mouse-look) and touch (drag-to-look), rather than three.js's own
// PointerLockControls — one rotation state, two input sources, instead of
// two different control paradigms to keep in sync. WASD movement is
// deliberately *not* gated on pointer lock being active: a locked pointer
// only changes *where you're facing*, but keyboard movement always moves
// you in whatever direction the camera already faces. This matters beyond
// style — Playwright's automated clicks don't reliably grant real pointer
// lock in a headless/CI-like environment, so verifying "movement works"
// has to be possible from keyboard input alone, with mouse-look treated
// as a desktop enhancement on top.
const LAUNDRY_SCRIPT = `
import * as THREE from "${THREE_BASE}/build/three.module.js";

(function () {
  var wrap = document.getElementById("laundry-canvas-wrap");
  var dataEl = document.getElementById("laundry-machines");
  if (!wrap || !dataEl) return;
  var machines = JSON.parse(dataEl.textContent || "[]");

  // --- layout: two rows, an aisle between them, computed from whatever
  // machine count the server actually has, not assumed to be 10. ---
  var SPACING = 2.4;
  var MACHINE_W = 1.0, MACHINE_H = 1.2, MACHINE_D = 1.0;
  var AISLE = 6;
  var colsPerRow = Math.max(1, Math.ceil(machines.length / 2));
  var rowZ = [-(AISLE / 2 + MACHINE_D / 2), (AISLE / 2 + MACHINE_D / 2)];
  var roomHalfWidth = (colsPerRow * SPACING) / 2 + 1.5;
  var roomHalfDepth = AISLE / 2 + MACHINE_D + 2;

  function positionFor(index) {
    var row = index < colsPerRow ? 0 : 1;
    var col = index % colsPerRow;
    var rowCount = row === 0 ? Math.min(colsPerRow, machines.length) : machines.length - colsPerRow;
    var rowWidth = rowCount * SPACING;
    var x = -rowWidth / 2 + SPACING / 2 + col * SPACING;
    var z = rowZ[row];
    return { x: x, z: z, facing: row === 0 ? Math.PI : 0 };
  }

  // --- renderer / scene / camera ---
  var scene = new THREE.Scene();
  // Stage 6 visual pass: the app's own warm "paper" background
  // (--paper: #f6f3ec in src/views.ts's STYLES) instead of Stage 1's flat
  // placeholder grey, so the 3D scene reads as part of the same product
  // rather than a generic demo dropped on top of it.
  scene.background = new THREE.Color(0xf6f3ec);
  scene.fog = new THREE.Fog(0xf6f3ec, 10, 26);

  var camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  var EYE_HEIGHT = 1.6;
  camera.position.set(0, EYE_HEIGHT, 0);

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

  // --- lighting (Stage 6 visual pass: soft shadows + a warmer key light,
  // replacing Stage 1's flat unshadowed placeholder lighting, per
  // research/3d-booking/ideas.md's own warning that a rushed, flatly-lit
  // room is what makes a 3D feature read as "a generic demo" rather than
  // belonging to this app) ---
  scene.add(new THREE.AmbientLight(0xfff4e0, 0.55));
  var sun = new THREE.DirectionalLight(0xfff0d8, 0.9);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -roomHalfWidth - 2;
  sun.shadow.camera.right = roomHalfWidth + 2;
  sun.shadow.camera.top = roomHalfDepth + 2;
  sun.shadow.camera.bottom = -roomHalfDepth - 2;
  scene.add(sun);

  // --- room shell ---
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomHalfWidth * 2, roomHalfDepth * 2),
    new THREE.MeshStandardMaterial({ color: 0xded7c8, roughness: 0.9 }), // --rule, the app's own hairline/surface tone
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  var wallMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.95 }); // --paper
  var wallHeight = 3;
  function addWall(x, z, w, d) {
    var wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
    wall.position.set(x, wallHeight / 2, z);
    wall.receiveShadow = true;
    scene.add(wall);
  }
  addWall(0, -roomHalfDepth, roomHalfWidth * 2, 0.2);
  addWall(0, roomHalfDepth, roomHalfWidth * 2, 0.2);
  addWall(-roomHalfWidth, 0, 0.2, roomHalfDepth * 2);
  addWall(roomHalfWidth, 0, 0.2, roomHalfDepth * 2);

  // --- machines: one box per machine, tagged with its real id so Stage 2
  // can find it again to recolour on live state. ---
  var machineMeshes = {};
  // Simple axis-aligned bounding boxes for walk-collision, in addition to
  // the clampToRoom() wall bound below — without this the camera (a point,
  // with no collider of its own) passes straight through a machine's mesh,
  // which fails the plan's own "camera doesn't clip through geometry"
  // requirement and was caught by this stage's own movement screenshot
  // showing the view go solid grey (camera inside a machine's box).
  var machineBoxes = [];
  var PLAYER_RADIUS = 0.35;
  var washerMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b0 });
  var dryerMat = new THREE.MeshStandardMaterial({ color: 0xb08a6a });
  // plans/3d-walkthrough.md Stage 3: a real, server-rendered QR code
  // textured onto each machine's aisle-facing side (not the mesh's own
  // "facing" rotation above, which only matters cosmetically for a
  // symmetric box — the QR plane's orientation is computed directly from
  // which row the machine is in, so it always faces into the walkable
  // aisle where someone would actually stand to scan it). MeshBasicMaterial
  // (unlit) so scene lighting/shadows never make the code harder to read —
  // a QR code's whole point is being reliably decodable, not atmospheric.
  var textureLoader = new THREE.TextureLoader();
  var QR_SIZE = 0.45; // generous per the plan's own "err generous" note (Stage 4's real phone test is the actual check on real-world scannability), sized to fit fully under the machine's top edge at its own vertical placement below — found by this stage's own close-up screenshot showing an earlier, larger size poking past the box's top edge
  var qrMeshes = {};

  // Stage 6 visual pass: a dark door-ring on each machine's aisle-facing
  // side, echoing src/views.ts's own 2D machineIcon (a circular drum ring
  // is that icon's whole visual identity) so the 3D machines read as the
  // same product's machines, not generic boxes. Placed low on the face,
  // under the QR code — the two vertical placements below (0.25 and 0.72,
  // as a fraction of MACHINE_H) were checked numerically before writing,
  // then corrected once by this stage's own close-up screenshot (an
  // earlier, larger QR size poked past the box's physical top edge):
  // ring spans [0.083, 0.417]*MACHINE_H, QR spans [0.533, 0.907]*MACHINE_H,
  // both fully within the box's own [0, 1]*MACHINE_H height with real
  // clearance between the two.
  var ringMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, side: THREE.DoubleSide });
  var RING_RADIUS = 0.2;

  machines.forEach(function (m, i) {
    var mPos = positionFor(i);
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(MACHINE_W, MACHINE_H, MACHINE_D),
      (m.type === "dryer" ? dryerMat : washerMat).clone(),
    );
    mesh.position.set(mPos.x, MACHINE_H / 2, mPos.z);
    mesh.rotation.y = mPos.facing;
    mesh.userData.machineId = m.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    machineMeshes[m.id] = mesh;
    machineBoxes.push({
      minX: mPos.x - MACHINE_W / 2 - PLAYER_RADIUS,
      maxX: mPos.x + MACHINE_W / 2 + PLAYER_RADIUS,
      minZ: mPos.z - MACHINE_D / 2 - PLAYER_RADIUS,
      maxZ: mPos.z + MACHINE_D / 2 + PLAYER_RADIUS,
    });

    var facesPositiveZ = mPos.z < 0; // row 0 (negative z) has the aisle in the +Z direction; row 1, the reverse
    var faceZ = mPos.z + (facesPositiveZ ? MACHINE_D / 2 + 0.01 : -(MACHINE_D / 2 + 0.01));
    var faceRotationY = facesPositiveZ ? 0 : Math.PI;

    var ring = new THREE.Mesh(new THREE.RingGeometry(RING_RADIUS * 0.78, RING_RADIUS, 32), ringMat);
    ring.position.set(mPos.x, MACHINE_H * 0.25, faceZ);
    ring.rotation.y = faceRotationY;
    scene.add(ring);

    var qrGeometry = new THREE.PlaneGeometry(QR_SIZE, QR_SIZE);
    var qrMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var qrMesh = new THREE.Mesh(qrGeometry, qrMaterial);
    qrMesh.position.set(mPos.x, MACHINE_H * 0.72, faceZ);
    qrMesh.rotation.y = faceRotationY;
    scene.add(qrMesh);
    qrMeshes[m.id] = qrMesh;

    textureLoader.load("/machines/" + m.id + "/qrcode.png", function (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      qrMaterial.map = texture;
      qrMaterial.needsUpdate = true;
    });
  });
  window.__laundryMachineMeshes = machineMeshes; // Playwright-inspectable escape hatch for verification
  window.__laundryQrMeshes = qrMeshes; // Stage 3's own verification hook — confirms a texture actually loaded, not just that a plane exists

  // --- Stage 2: live machine state, via GET /laundry/machines-state and
  // the existing /events SSE stream. Colours mirror the exact hex values
  // src/views.ts's .state-* CSS classes use for the same BoardState
  // values (src/board-state.ts), so the 3D scene and the 2D board never
  // disagree about what a colour means — not a second, independently
  // invented colour language for the same states. ---
  var STATE_COLOR = {
    "free": 0x1f6f5c, // --free
    "running": 0x2b5f8a, // --info
    "claimed": 0x2b5f8a, // --info
    "your-turn": 0xb5402a, // --alert
    "unclaimed": 0xb5402a, // --alert
    "nearly-your-turn": 0x6b6358, // --ink-muted
    "waiting": 0x6b6358, // --ink-muted
  };
  var lastKnownState = {}; // machineId -> state string, for the claim-success flash's transition check
  window.__laundryLastKnownState = lastKnownState;
  var stateEverPainted = false; // first paint must never flash — see below

  // Stage 6: a brief, clearly-visible flash on the exact machine that just
  // transitioned *into* "claimed" (from anything else), on top of Stage
  // 2's existing colour change — so "I just claimed this" reads as an
  // event, the same reasoning ADR 0009's in-page turn alert already
  // applies to the 2D page. Fires once per real transition, never on a
  // machine that's simply sitting at "claimed" on initial page load
  // (stateEverPainted guards the very first refetch; after that, only an
  // actual old-state -> "claimed" change flashes) and never re-triggers
  // from an unrelated SSE event for a *different* machine, since this only
  // ever looks at entries this specific refetch actually returned.
  var FLASH_COLOR = 0xffd54a;
  var FLASH_MS = 700;
  var flashingUntil = {}; // machineId -> timestamp; a color write from applyMachineState is deferred while a flash is in progress, so the two never fight
  var flashCount = {}; // machineId -> number of times flashed, Stage 6's own verification hook

  function flashClaimed(machineId) {
    var mesh = machineMeshes[machineId];
    if (!mesh) return;
    var realColor = STATE_COLOR["claimed"];
    mesh.material.color.setHex(FLASH_COLOR);
    flashingUntil[machineId] = Date.now() + FLASH_MS;
    flashCount[machineId] = (flashCount[machineId] || 0) + 1;
    setTimeout(function () {
      flashingUntil[machineId] = 0;
      if (realColor != null) mesh.material.color.setHex(realColor);
    }, FLASH_MS);
  }
  window.__laundryFlashCount = flashCount; // Stage 6's own verification hook

  function applyMachineState(entries) {
    entries.forEach(function (entry) {
      var mesh = machineMeshes[entry.id];
      if (!mesh) return;

      var previous = lastKnownState[entry.id];
      var justClaimed = stateEverPainted && previous !== "claimed" && entry.state === "claimed";

      var color = STATE_COLOR[entry.state];
      var flashActive = (flashingUntil[entry.id] || 0) > Date.now();
      if (color != null && !flashActive) mesh.material.color.setHex(color);

      lastKnownState[entry.id] = entry.state;
      if (justClaimed) flashClaimed(entry.id);
    });
    stateEverPainted = true;
  }

  function refetchMachineState() {
    fetch("/laundry/machines-state", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(applyMachineState)
      .catch(function () { /* a transient fetch failure just leaves the last-known colour showing */ });
  }
  window.__laundryRefetchMachineState = refetchMachineState; // exposed for Stage 2/6's own scripted verification, so a test can await one refetch deterministically instead of guessing a timeout

  refetchMachineState(); // initial paint, before the first SSE event ever arrives

  // A second, independent EventSource on the same /events stream the
  // htmx SSE extension already opens for the rest of the page (see
  // src/views.ts's page() wrapper / hx-ext="sse") — the 3D scene isn't an
  // htmx page section, so it can't reuse that wiring, but the server
  // doesn't know or care how many listeners read one broadcast stream.
  // No new server-side broadcast logic: src/realtime.ts's tick already
  // emits these same named events for the 2D board.
  var laundrySource = new EventSource("/events");
  laundrySource.addEventListener("changed", refetchMachineState);
  machines.forEach(function (m) {
    laundrySource.addEventListener("machine-" + m.id, refetchMachineState);
  });

  // --- camera control state ---
  var yaw = 0, pitch = 0;
  var pos = { x: 0, z: 0 };
  var MOVE_SPEED = 3; // units/second
  var LOOK_SENSITIVITY = 0.0025;

  function collidesWithMachine(x, z) {
    for (var i = 0; i < machineBoxes.length; i++) {
      var b = machineBoxes[i];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }

  // Clamps to the room's walls, then independently rejects a move into any
  // machine's box per-axis (so sliding along a machine's side while
  // walking past it still works, instead of movement just freezing
  // entirely the moment either axis would collide).
  function clampToRoom(x, z) {
    var margin = 0.4;
    var clampedX = Math.max(-roomHalfWidth + margin, Math.min(roomHalfWidth - margin, x));
    var clampedZ = Math.max(-roomHalfDepth + margin, Math.min(roomHalfDepth - margin, z));
    var resultX = collidesWithMachine(clampedX, pos.z) ? pos.x : clampedX;
    var resultZ = collidesWithMachine(resultX, clampedZ) ? pos.z : clampedZ;
    return { x: resultX, z: resultZ };
  }

  function applyCameraTransform() {
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch, yaw, 0);
    camera.position.set(pos.x, EYE_HEIGHT, pos.z);
  }
  applyCameraTransform();

  // --- desktop: WASD (always active) + pointer-lock mouse-look (best
  // effort — see the note above on why movement doesn't depend on it) ---
  var keys = { w: false, a: false, s: false, d: false };
  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
  });

  renderer.domElement.addEventListener("click", function () {
    if (renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  });
  document.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * LOOK_SENSITIVITY;
    pitch -= e.movementY * LOOK_SENSITIVITY;
    pitch = Math.max(-1.3, Math.min(1.3, pitch));
  });

  // --- touch: a left-side joystick for movement, a drag-anywhere-else
  // zone for look — only shown on a touch-capable viewport. ---
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
      pitch = Math.max(-1.3, Math.min(1.3, pitch));
    });
    lookZone.addEventListener("touchend", function () { lookActive = false; });
  }

  // --- render loop ---
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    var forwardInput = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) + joystickVector.y * -1;
    var strafeInput = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + joystickVector.x;
    forwardInput = Math.max(-1, Math.min(1, forwardInput));
    strafeInput = Math.max(-1, Math.min(1, strafeInput));

    if (forwardInput !== 0 || strafeInput !== 0) {
      var sinYaw = Math.sin(yaw), cosYaw = Math.cos(yaw);
      // Camera looks down -Z at yaw=0; forward vector in world space:
      var fx = -sinYaw, fz = -cosYaw;
      var rx = cosYaw, rz = -sinYaw;
      var dx = (fx * forwardInput + rx * strafeInput) * MOVE_SPEED * dt;
      var dz = (fz * forwardInput + rz * strafeInput) * MOVE_SPEED * dt;
      var next = clampToRoom(pos.x + dx, pos.z + dz);
      pos.x = next.x;
      pos.z = next.z;
    }

    applyCameraTransform();
    renderer.render(scene, camera);
    window.requestAnimationFrame(frame);
  }

  resize();
  window.requestAnimationFrame(frame);

  // Playwright-inspectable hooks for verification — not used by the app
  // itself, only by Stage 1/2/6's own scripted checks.
  window.__laundryDebug = {
    getCameraPosition: function () { return { x: pos.x, z: pos.z, yaw: yaw }; },
    pressKey: function (k) { keys[k] = true; },
    releaseKey: function (k) { keys[k] = false; },
  };
})();
`;

export function laundryPage(machines: Machine[]): Html {
  return page(
    "The laundry room",
    html`<p class="laundry-hint">
      Walk around with <strong>WASD</strong> and look around by clicking the
      scene then moving your mouse (or use the on-screen controls on a
      touch device). Each machine's colour matches its real status on the
      board. Scan a machine's code with your phone's camera to claim or
      reserve it directly.
    </p>
    <div class="laundry-canvas-wrap" id="laundry-canvas-wrap">
      <div class="laundry-crosshair"></div>
    </div>
    <script type="application/json" id="laundry-machines">${raw(
      JSON.stringify(machines.map((m) => ({ id: m.id, label: m.label, type: m.type }))),
    )}</script>
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
