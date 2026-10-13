import type { SSEStreamingApi } from "hono/streaming";
import { db } from "./db.ts";
import { machines, offers } from "./schema.ts";
import * as queue from "./queue.ts";

// Crit 9: real-time sync (plans/crit-9.md Stage 1). SSE carries only a
// change *signal* (which machine changed), never rendered HTML — a
// viewer's own browser re-fetches the one small, identity-aware fragment
// affected (/machines/:id/card, /my-status), reusing the existing
// cookie-based rendering in views.ts unchanged.

const streams = new Set<SSEStreamingApi>();

export function addStream(stream: SSEStreamingApi): void {
  streams.add(stream);
}

export function removeStream(stream: SSEStreamingApi): void {
  streams.delete(stream);
}

// `event` names the machine that changed (e.g. "machine-3") so a page
// only re-fetches the one card it's showing; "changed" is a second, generic
// event every page also listens for, since the pinned "your status" block
// doesn't know in advance which machine its own reservation is on.
async function broadcast(event: string): Promise<void> {
  for (const stream of streams) {
    if (stream.closed) continue;
    await stream.writeSSE({ event, data: "" }).catch(() => undefined);
  }
}

// One tick is the only place that decides when to broadcast, rather than
// every mutating route in app.ts remembering to call broadcast() itself
// (easy to miss one, and can't react to a timer running out with nobody
// making a request at all). queueFor() already calls settleMachine()
// internally, so this is also what notices a passive expiry — a claim
// window or a wash's timer running out with nobody watching — which is
// the one thing crit 8 never needed and the ~1s requirement can't be met
// without.
const lastDigest = new Map<number, string>();

function digestOf(machineId: number, now: number): string {
  const rows = queue.queueFor(machineId, now);
  return JSON.stringify(rows);
}

async function tick(): Promise<void> {
  const now = Date.now();

  // Crit 9 Stage 3: offers aren't tied to one machine's QueueRow digest
  // (an offer lives on the *candidate's own* machine's status, not the
  // idle machine's queue), so a plain "changed" broadcast covers them —
  // processed before the per-machine digest pass below so the same tick
  // that creates/expires an offer also reaches everyone within ~1s.
  const beforeOfferState = db.select().from(offers).all();
  queue.processOffers(now);
  const afterOfferState = db.select().from(offers).all();
  if (JSON.stringify(beforeOfferState) !== JSON.stringify(afterOfferState)) {
    await broadcast("changed");
  }

  const allMachines = db.select({ id: machines.id }).from(machines).all();
  for (const { id } of allMachines) {
    const digest = digestOf(id, now);
    if (lastDigest.get(id) !== digest) {
      lastDigest.set(id, digest);
      await broadcast(`machine-${id}`);
      await broadcast("changed");
    }
  }
}

const TICK_MS = 500;
// Independent of the state-check tick above: Fly's proxy can drop an SSE
// connection that's been silent too long, so a steady low-frequency
// heartbeat keeps every open stream alive regardless of whether anything
// changed.
const HEARTBEAT_MS = 20_000;

export function startRealtimeLoop(): void {
  setInterval(() => {
    tick().catch((e) => console.error("realtime tick failed", e));
  }, TICK_MS);

  setInterval(() => {
    for (const stream of streams) {
      if (stream.closed) continue;
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => undefined);
    }
  }, HEARTBEAT_MS);
}
