import { html, raw } from "hono/html";
import type { Machine } from "./schema.ts";
import { page, type Html } from "./views.ts";

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
  scene.background = new THREE.Color(0xdcdcdc);

  var camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  var EYE_HEIGHT = 1.6;
  camera.position.set(0, EYE_HEIGHT, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  wrap.appendChild(renderer.domElement);

  function resize() {
    var w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / (h || 1);
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  // --- lighting (flat-ish shading is fine for Stage 1 — plans/
  // 3d-walkthrough.md's "visual style" note; Stage 6 revisits this) ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  var sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(5, 10, 5);
  scene.add(sun);

  // --- room shell ---
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomHalfWidth * 2, roomHalfDepth * 2),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  var wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da });
  var wallHeight = 3;
  function addWall(x, z, w, d) {
    var wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
    wall.position.set(x, wallHeight / 2, z);
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
  machines.forEach(function (m, i) {
    var mPos = positionFor(i);
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(MACHINE_W, MACHINE_H, MACHINE_D),
      (m.type === "dryer" ? dryerMat : washerMat).clone(),
    );
    mesh.position.set(mPos.x, MACHINE_H / 2, mPos.z);
    mesh.rotation.y = mPos.facing;
    mesh.userData.machineId = m.id;
    scene.add(mesh);
    machineMeshes[m.id] = mesh;
    machineBoxes.push({
      minX: mPos.x - MACHINE_W / 2 - PLAYER_RADIUS,
      maxX: mPos.x + MACHINE_W / 2 + PLAYER_RADIUS,
      minZ: mPos.z - MACHINE_D / 2 - PLAYER_RADIUS,
      maxZ: mPos.z + MACHINE_D / 2 + PLAYER_RADIUS,
    });
  });
  window.__laundryMachineMeshes = machineMeshes; // Playwright-inspectable escape hatch for verification

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
  var lastKnownState = {}; // machineId -> state string, for Stage 6's "did this just become claimed" transition check
  window.__laundryLastKnownState = lastKnownState;

  function applyMachineState(entries) {
    entries.forEach(function (entry) {
      var mesh = machineMeshes[entry.id];
      if (!mesh) return;
      var color = STATE_COLOR[entry.state];
      if (color != null) mesh.material.color.setHex(color);
      lastKnownState[entry.id] = entry.state;
    });
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
      touch device). This is the same laundry room as the board above —
      look for Stage 2+3 of this feature for live machine status and
      scan-to-claim.
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
