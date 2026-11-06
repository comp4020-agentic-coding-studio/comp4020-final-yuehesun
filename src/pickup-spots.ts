// Stage 8.4 (plans/3d-walkthrough.md, docs/adr/0013): the fixed list of
// numbered drop-off spots a handoff can place someone's finished laundry
// into. A fixed, named list — never free text — matches CLAUDE.md's App
// rules discipline for room numbers: the person moving the laundry never
// types a spot name, they only ever see which one the server picked.
export const PICKUP_SPOTS = ["A1", "A2", "A3", "A4", "A5", "A6"] as const;

export type PickupSpot = (typeof PICKUP_SPOTS)[number];
