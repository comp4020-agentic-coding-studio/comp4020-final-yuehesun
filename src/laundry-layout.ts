// plans/3d-walkthrough.md Stage 9.5: the room's geometry (wall positions,
// machine placement, facing) computed once here and shared by both the
// server (laundryPage, below) and the client (LAUNDRY_SCRIPT in
// src/laundry-view.ts) via the JSON data island — not recomputed
// independently on each side, which is exactly how the Stage 9.5 bug
// (north-wall machines facing the wall) went unnoticed as long as it did:
// nothing outside LAUNDRY_SCRIPT's own browser-only string could check its
// numbers. This module has no THREE/DOM import, so it's plain, testable
// TypeScript — see spec/laundry-layout.test.ts.

export interface LayoutMachine {
  id: number;
  type: string;
}

export interface PlacedMachine {
  id: number;
  type: string;
  x: number;
  z: number;
  // radians: rotateY(local +Z, facing) must equal this wall's own interior
  // direction (see facingToward below) — the model's measured front face
  // (bbox.max.z, see MODEL_BBOX in src/laundry-view.ts) always lands at
  // local z = +depth/2 after centering, on every wall, so a correct
  // `facing` is sufficient on its own; no per-wall sign correction
  // ("frontSign", Stage 9.4.3's now-removed workaround) is needed once
  // `facing` itself is right.
  facing: number;
  wall: "north" | "east";
}

export interface LaundryLayout {
  roomHalfWidth: number;
  roomHalfDepth: number;
  northZ: number;
  eastX: number;
  westX: number;
  southZ: number;
  placedMachines: PlacedMachine[];
}

const SPACING = 1.6;
const WALL_MARGIN = 0.9; // machines pulled in from the wall by this much, unchanged from Stage 8.2
const CORNER_MARGIN = 0.7; // gap from the shared north/east corner before the first machine on either wall
const SOUTH_OPEN_DEPTH = 2.2; // open floor between the east wall's row and the south (entrance) wall
const WEST_ZONE_DEPTH = 0.5; // how far the drop-off shelving projects from the west wall (a bookcase's own measured depth)
const ISLAND_CLEARANCE = 2.4; // the sink+iron island's own footprint plus walking room around it

// The rotation that sends a model's local +Z axis to a given world
// direction (dx, dz) — the same atan2 convention this file's own
// characterRoot.rotation.y already uses for "face this way". Deriving
// `facing` this way, from each wall's own declared interior direction,
// is what Stage 9.5 replaces a per-wall hand-picked constant with: the
// north wall's old `Math.PI` was never checked against its own interior
// direction (+Z, toward the south/spawn wall) and turned out to send
// local +Z to the wall's far side instead.
function facingToward(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

const NORTH_INTERIOR = { x: 0, z: 1 }; // from the north wall, the room is toward +Z (south, spawn)
const EAST_INTERIOR = { x: -1, z: 0 }; // from the east wall, the room is toward -X (west)

export function layoutRoom(machines: LayoutMachine[]): LaundryLayout {
  const dryers = machines.filter((m) => m.type === "dryer");
  const allWashers = machines.filter((m) => m.type !== "dryer");
  const eastSlotCount = Math.round(machines.length / 2);
  const eastDryerCount = Math.min(dryers.length, eastSlotCount);
  const eastWasherCount = Math.max(0, eastSlotCount - eastDryerCount);
  const northWashers = allWashers.slice(0, allWashers.length - eastWasherCount);
  const eastWashers = allWashers.slice(allWashers.length - eastWasherCount);
  const eastMachines = eastWashers.concat(dryers.slice(0, eastDryerCount));
  const northMachines = northWashers.concat(dryers.slice(eastDryerCount));

  const northRowWidth = northMachines.length * SPACING;
  const eastRowDepth = eastMachines.length * SPACING;

  const roomHalfWidth = Math.max(northRowWidth / 2 + CORNER_MARGIN, WEST_ZONE_DEPTH + ISLAND_CLEARANCE);
  const roomHalfDepth = (CORNER_MARGIN + eastRowDepth + SOUTH_OPEN_DEPTH) / 2;
  const northZ = -roomHalfDepth + WALL_MARGIN;
  const eastX = roomHalfWidth - WALL_MARGIN;
  const westX = -roomHalfWidth + WALL_MARGIN;
  const southZ = roomHalfDepth - 1.5; // spawn point, with enough clearance behind it for the follow camera

  const northFacing = facingToward(NORTH_INTERIOR.x, NORTH_INTERIOR.z);
  const eastFacing = facingToward(EAST_INTERIOR.x, EAST_INTERIOR.z);

  const placedMachines: PlacedMachine[] = [];
  northMachines.forEach((m, i) => {
    placedMachines.push({
      id: m.id,
      type: m.type,
      x: -northRowWidth / 2 + SPACING / 2 + i * SPACING,
      z: northZ,
      facing: northFacing,
      wall: "north",
    });
  });
  eastMachines.forEach((m, i) => {
    placedMachines.push({
      id: m.id,
      type: m.type,
      x: eastX,
      z: northZ + CORNER_MARGIN + SPACING / 2 + i * SPACING,
      facing: eastFacing,
      wall: "east",
    });
  });

  return { roomHalfWidth, roomHalfDepth, northZ, eastX, westX, southZ, placedMachines };
}
