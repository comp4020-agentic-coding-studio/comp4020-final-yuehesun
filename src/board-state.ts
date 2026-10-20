import type { Machine } from "./schema.ts";
import type { QueueRow } from "./queue.ts";

// Pure (no HTML, no Hono) board-display logic, shared by src/views.ts
// (the real home page's board, server-rendered) and scripts/simulate.ts
// (Stage 14's replay recording, which needs the same labels as plain
// data to ship to the client). Kept here instead of copied into
// scripts/simulate.ts, for the same reason ADR 0007 keeps queue logic
// itself in one place: two copies of "what does this state mean" can
// silently drift from each other.

export type BoardState =
  | "free"
  | "unclaimed"
  | "your-turn"
  | "nearly-your-turn"
  | "waiting"
  | "claimed"
  | "running";

// Mirrors src/views.ts's own stateWordFor, minus the CSS class/label
// strings a server-rendered page needs — this returns the state as data,
// for a caller that builds its own label (the real page) or ships it to
// a client that builds its own (the replay).
export function boardStateFor(row: QueueRow | undefined, forOwner: boolean): BoardState {
  if (!row) return "free";
  if (row.status === "running") return "running";
  if (row.status === "claimed") return "claimed";
  if (row.position === 1) return forOwner ? "your-turn" : "unclaimed";
  if (row.position === 2) return "nearly-your-turn";
  return "waiting";
}

// CSS class per BoardState — the one display detail that's genuinely
// specific to "rendered as a <span>" (src/views.ts's board) vs. "sent as
// data and applied client-side" (scripts/simulate.ts's replay recording,
// src/views.ts's REPLAY_SCRIPT), so both read it from here rather than
// each keeping their own copy.
export const BOARD_STATE_CLASS: Record<BoardState, string> = {
  free: "state-free",
  running: "state-running",
  claimed: "state-claimed",
  "your-turn": "state-alert",
  unclaimed: "state-unclaimed",
  "nearly-your-turn": "state-muted",
  waiting: "state-muted",
};

// Mirrors src/views.ts's own stateWordFor's label text, for the one
// caller (the replay) that has no server-side Hono context to render a
// <span> in and needs a plain string instead. src/views.ts keeps its own
// copy inline (it also needs the CSS class, which this doesn't return),
// but both read the same BoardState values above, so the mapping from
// state to meaning can't drift between the two even though the output
// shape differs.
export function boardStateLabel(state: BoardState, machineType: Machine["type"]): string {
  switch (state) {
    case "free":
      return "Free";
    case "unclaimed":
      return "Unclaimed";
    case "your-turn":
      return "Your turn";
    case "nearly-your-turn":
      return "Nearly your turn";
    case "claimed":
      return "Claimed";
    case "running":
      return machineType === "dryer" ? "Drying" : "Washing";
    case "waiting":
      return "Waiting";
  }
}

// Mirrors src/views.ts's own boardTimeCell, as a plain number of seconds
// (or undefined where that function renders an em dash) instead of an
// Html countdown span — the replay ticks its own client-side countdown
// from this starting value rather than re-deriving it from a QueueRow it
// doesn't have.
export function boardTimeLeftSeconds(row: QueueRow | undefined, now: number): number | undefined {
  if (!row) return undefined;
  if (row.status === "claimed") return undefined;
  if (row.status === "running") return Math.max(0, Math.round((row.endMs - now) / 1000));
  if (row.claimDeadlineMs != null) return Math.max(0, Math.round((row.claimDeadlineMs - now) / 1000));
  return Math.max(0, Math.round((row.scheduledStartMs - now) / 1000));
}
