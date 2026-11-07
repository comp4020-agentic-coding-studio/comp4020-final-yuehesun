import { expect, it } from "vitest";
import { layoutRoom, type LayoutMachine } from "../src/laundry-layout.ts";

// plans/3d-walkthrough.md Stage 9.5: a real bug (found by screenshot, then
// confirmed by reading window.__laundryMachineGroups's own rotation values
// against a standalone rotateY check) had every north-wall washer/dryer
// facing its door at the wall instead of the room — Stage 9.4.3's
// "frontSign" only patched the status light's and QR anchor's own offset
// sign, never the model's actual rotation, so the light looked fine while
// the door underneath it stayed backwards. This is a pure-function test
// against the real layoutRoom() src/laundry-view.ts's client script now
// reads its placement data from — not a copy of its arithmetic — so a
// future wall or facing constant that's wrong the same way fails here,
// without needing a browser.

const WALL_INTERIOR = {
  north: { x: 0, z: 1 },
  east: { x: -1, z: 0 },
} as const;

// The real seeded machine list (8 washers, 2 dryers) — see
// plans/3d-walkthrough.md's own Stage 9.2 section and src/db.ts's seed.
const SEED_MACHINES: LayoutMachine[] = [
  { id: 1, type: "washer" },
  { id: 2, type: "washer" },
  { id: 3, type: "washer" },
  { id: 4, type: "washer" },
  { id: 5, type: "washer" },
  { id: 6, type: "washer" },
  { id: 7, type: "washer" },
  { id: 8, type: "washer" },
  { id: 9, type: "dryer" },
  { id: 10, type: "dryer" },
];

it("every placed machine's facing points into the room, not at its own wall", () => {
  const layout = layoutRoom(SEED_MACHINES);
  expect(layout.placedMachines.length).toBe(SEED_MACHINES.length);

  for (const p of layout.placedMachines) {
    const interior = WALL_INTERIOR[p.wall];
    // rotateY(local +Z, p.facing) in world space, the same transform
    // three.js's Object3D.rotation.y = p.facing applies to (0,0,1).
    const doorDirection = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    const dot = doorDirection.x * interior.x + doorDirection.z * interior.z;
    expect(
      dot,
      `machine ${p.id} on the ${p.wall} wall faces (${doorDirection.x.toFixed(2)}, ${doorDirection.z.toFixed(2)}), ` +
        `not toward its own interior direction (${interior.x}, ${interior.z})`,
    ).toBeGreaterThan(0.9);
  }
});

it("splits the real seeded machines 5 north / 5 east, matching the already-verified screenshot layout", () => {
  const layout = layoutRoom(SEED_MACHINES);
  const north = layout.placedMachines.filter((p) => p.wall === "north");
  const east = layout.placedMachines.filter((p) => p.wall === "east");
  expect(north.length).toBe(5);
  expect(east.length).toBe(5);
  // North continues the washer run (ids 1-5); east takes the rest plus
  // both dryers (ids 6-10) — src/laundry-view.ts's own documented split.
  expect(north.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  expect(east.map((p) => p.id)).toEqual([6, 7, 8, 9, 10]);
});

it("keeps every machine's own id/type, not just a position", () => {
  const layout = layoutRoom(SEED_MACHINES);
  const byId = new Map(layout.placedMachines.map((p) => [p.id, p]));
  for (const m of SEED_MACHINES) {
    expect(byId.get(m.id)?.type).toBe(m.type);
  }
});
