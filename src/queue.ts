import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db.ts";
import { type Reservation, reservations } from "./schema.ts";

export const CLAIM_WINDOW_MS = 3 * 60 * 1000;

const ACTIVE_STATUSES = ["waiting", "claimed", "running"] as const;

function activeReservations(machineId: number): Reservation[] {
  return db
    .select()
    .from(reservations)
    .where(and(eq(reservations.machineId, machineId), inArray(reservations.status, ACTIVE_STATUSES)))
    .orderBy(asc(reservations.joinedAt))
    .all();
}

// Lazily brings a machine's queue up to date: finishes a running wash whose
// time is up, and expires a front-of-queue claim window that's been missed.
// Crit 8's fairness rule is the blunt version (plans/crit-8.md): missing the
// window loses the spot outright, no reinstatement — the gentler "move back
// one place" is crit 9's documented upgrade (plan.md #1).
export function settleMachine(machineId: number, now: number = Date.now()): void {
  for (;;) {
    const [front] = activeReservations(machineId);
    if (!front) return;

    if (front.status === "running") {
      const endsAt = front.startedAt! + front.durationMinutes * 60_000;
      if (now >= endsAt) {
        db.update(reservations).set({ status: "done" }).where(eq(reservations.id, front.id)).run();
        continue;
      }
      return;
    }

    if (front.status === "claimed") return; // waiting on their separate "start" tap; no timeout in crit 8's scope

    // front.status === "waiting": the machine is free for them. Mark when
    // their claim window started, the first time we notice this.
    if (front.turnStartedAt == null) {
      db.update(reservations).set({ turnStartedAt: now }).where(eq(reservations.id, front.id)).run();
      return;
    }

    if (now - front.turnStartedAt >= CLAIM_WINDOW_MS) {
      db.update(reservations).set({ status: "missed" }).where(eq(reservations.id, front.id)).run();
      continue; // next person in line becomes the new front
    }

    return;
  }
}

export interface QueueRow {
  reservationId: number;
  person: string;
  status: Reservation["status"];
  position: number;
  /** ms since epoch; an estimate until `fixed` is true. */
  scheduledStartMs: number;
  /** scheduledStartMs + duration — when this reservation frees the machine. */
  endMs: number;
  fixed: boolean;
  /** Only set for the front, waiting reservation: when its 3-minute claim window runs out. */
  claimDeadlineMs?: number;
}

// Position and estimated/fixed time, computed from the chain of
// reservations ahead (plan.md's rule) — nothing extra is stored for it.
// A reservation's time is fixed once the one directly ahead of it has
// actually started (their real start + their chosen duration); until then
// it's an estimate built on everyone ahead starting on schedule.
export function queueFor(machineId: number, now: number = Date.now()): QueueRow[] {
  settleMachine(machineId, now);
  const ordered = activeReservations(machineId);

  let previousEnd = now;
  let previousFixed = true;
  return ordered.map((r, i) => {
    let scheduledStartMs: number;
    let fixed: boolean;

    if (i === 0) {
      scheduledStartMs = r.status === "running" ? r.startedAt! : (r.turnStartedAt ?? now);
      fixed = r.status === "running";
    } else {
      scheduledStartMs = previousEnd;
      fixed = previousFixed;
    }

    const endMs = scheduledStartMs + r.durationMinutes * 60_000;
    previousEnd = endMs;
    previousFixed = fixed;

    return {
      reservationId: r.id,
      person: r.personName,
      status: r.status,
      position: i + 1,
      scheduledStartMs,
      endMs,
      fixed,
      claimDeadlineMs: i === 0 && r.status === "waiting" && r.turnStartedAt != null ? r.turnStartedAt + CLAIM_WINDOW_MS : undefined,
    };
  });
}

export type ActionResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; message: string };

export function join(machineId: number, personName: string, washingType: string, durationMinutes: number): number {
  const now = Date.now();
  const { id } = db
    .insert(reservations)
    .values({ machineId, personName, washingType, durationMinutes, joinedAt: now, status: "waiting" })
    .returning({ id: reservations.id })
    .get();
  settleMachine(machineId, now); // if the machine's free, this starts their claim window immediately
  return id;
}

function loadOwned(reservationId: number, personName: string): Reservation | ActionResult {
  const row = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
  if (!row) return { ok: false, status: 404, message: "no such reservation" };
  if (row.personName !== personName) return { ok: false, status: 403, message: "not your reservation" };
  return row;
}

export function claim(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;

  settleMachine(row.machineId);
  const [front] = activeReservations(row.machineId);
  if (!front || front.id !== row.id || front.status !== "waiting") {
    return { ok: false, status: 409, message: "it's not your turn" };
  }

  db.update(reservations).set({ status: "claimed", claimedAt: Date.now() }).where(eq(reservations.id, row.id)).run();
  return { ok: true };
}

export function start(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;
  if (row.status !== "claimed") return { ok: false, status: 409, message: "claim the machine before starting it" };

  db.update(reservations).set({ status: "running", startedAt: Date.now() }).where(eq(reservations.id, row.id)).run();
  return { ok: true };
}

export function cancel(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;
  if (row.status !== "waiting" && row.status !== "claimed") {
    return { ok: false, status: 409, message: "can't cancel a running or finished reservation" };
  }

  db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, row.id)).run();
  settleMachine(row.machineId); // the next person may now be free to claim
  return { ok: true };
}
