// Stage 8.4 (plans/3d-walkthrough.md, docs/adr/0013): the fixed list of
// numbered drop-off spots a handoff can place someone's finished laundry
// into. A fixed, named list — never free text, same discipline as room
// numbers: the resident confirming a placement picks one of these names
// (a <select> on their home page, re-checked server-side, and it must be
// free), and anything else is rejected. docs/adr/0017 records that the
// final spot is the resident's confirmation; the server only proposes.
export const PICKUP_SPOTS = ["A1", "A2", "A3", "A4", "A5", "A6"] as const;

export type PickupSpot = (typeof PICKUP_SPOTS)[number];
