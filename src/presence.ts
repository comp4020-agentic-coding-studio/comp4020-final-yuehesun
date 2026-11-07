import type { SSEStreamingApi } from "hono/streaming";
import * as clock from "./clock.ts";

// plans/laundry-presence.md: where residents' characters are in the
// shared 3D room — deliberately separate from src/realtime.ts's own SSE
// tick, which broadcasts discrete change *signals* on a 500ms cadence. A
// resident's position is the opposite shape: continuous, high-frequency
// state that every connected browser needs a fresh copy of on a steady
// cadence, not "only when something changed." See the plan's "Why this
// needs a new transport, not an extension of /events" for the full
// reasoning against folding this into realtime.ts instead.
//
// Deliberately in-memory only, never a database table, never imported by
// src/queue.ts and never importing it — docs/adr/0014-laundry-presence.md
// records why this is safe (this app runs as exactly one Fly machine,
// --ha=false) and what it would take to change that assumption later.

export interface PresenceRecord {
  tabId: string;
  identity: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  lastSeenMs: number;
}

// Keyed by a random per-tab session id (generated client-side, see
// plan's "Per-tab id" section), not by identity — two tabs open on the
// same room number are two independent entries, not one clobbering the
// other's position every time both report in quick succession.
const records = new Map<string, PresenceRecord>();

export function report(tabId: string, identity: string, x: number, z: number, yaw: number, moving: boolean): void {
  records.set(tabId, { tabId, identity, x, z, yaw, moving, lastSeenMs: clock.now() });
}

// Pull-based (called from the broadcast tick below), not a per-record
// setTimeout — one more timer to re-arm on every report and cancel on
// explicit removal buys nothing at this scale (a real laundry room's
// realistic concurrent-tab count), and scanning the whole map once per
// broadcast tick is simpler to reason about.
export function removeStale(maxAgeMs: number): void {
  const cutoff = clock.now() - maxAgeMs;
  for (const [tabId, rec] of records) {
    if (rec.lastSeenMs < cutoff) records.delete(tabId);
  }
}

export function remove(tabId: string): void {
  records.delete(tabId);
}

export function all(): PresenceRecord[] {
  return Array.from(records.values());
}

// Only exported for spec/laundry-presence.test.ts's own isolation between
// tests (vitest's global-setup starts one real server shared by every
// spec file, so a stray record from one test could otherwise bleed into
// another's broadcast). Never called from production code.
export function clearAllForTest(): void {
  records.clear();
}

const streams = new Set<SSEStreamingApi>();

export function addStream(stream: SSEStreamingApi): void {
  streams.add(stream);
}

export function removeStream(stream: SSEStreamingApi): void {
  streams.delete(stream);
}

async function broadcast(): Promise<void> {
  const payload = JSON.stringify(all());
  for (const stream of streams) {
    if (stream.closed) continue;
    await stream.writeSSE({ event: "positions", data: payload }).catch(() => undefined);
  }
}

// Deliberately not 1:1 with the client's own REPORT_INTERVAL_MS (200ms,
// src/laundry-view.ts): this tick batches whatever reports arrived since
// the last one into a single broadcast, rather than re-broadcasting on
// every incoming report — bounds total bandwidth to one payload per
// BROADCAST_MS regardless of how many clients are reporting into it.
const BROADCAST_MS = 250;
const STALE_MS = 5_000; // a record not refreshed in this long is dropped even without an explicit leave
const HEARTBEAT_MS = 20_000; // same reasoning as realtime.ts's own: Fly's proxy drops a silent connection

export function startPresenceLoop(): void {
  setInterval(() => {
    removeStale(STALE_MS);
    broadcast().catch((e) => console.error("presence broadcast failed", e));
  }, BROADCAST_MS);

  setInterval(() => {
    for (const stream of streams) {
      if (stream.closed) continue;
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => undefined);
    }
  }, HEARTBEAT_MS);
}
