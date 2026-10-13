import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "./db.ts";
import { machines, type Machine, type Offer, offers, type Reservation, reservations } from "./schema.ts";

export const CLAIM_WINDOW_MS = 3 * 60 * 1000;
// A claimed-but-never-started machine would otherwise sit blocked forever —
// the same forfeit the fairness rule already applies to an unclaimed turn.
export const START_WINDOW_MS = 5 * 60 * 1000;
// Crit 9 (plans/crit-9.md Stage 3): longer than the normal claim window,
// since accepting an offer means travelling to a machine you weren't
// already camped at — plan.md gives this case 10 minutes, not 3.
export const OFFER_CLAIM_WINDOW_MS = 10 * 60 * 1000;
export const OFFER_RESPOND_WINDOW_MS = 2 * 60 * 1000;

const ACTIVE_STATUSES = ["waiting", "claimed", "running"] as const;

function activeReservations(machineId: number): Reservation[] {
  return db
    .select()
    .from(reservations)
    .where(and(eq(reservations.machineId, machineId), inArray(reservations.status, ACTIVE_STATUSES)))
    .orderBy(asc(reservations.joinedAt))
    .all();
}

// Crit 9 (plans/crit-9.md Stage 2): miss your claim/start window and you
// move back exactly one place — swapped with whoever's next — instead of
// losing your spot outright (crit 8's blunt rule, now the rejected
// alternative; see docs/adr/0005). Swapping joinedAt is the whole
// mechanism: position is still "order by joinedAt," so nothing else about
// queueFor changes. Both sides get a notice so the swap is never silent.
// With nobody behind to swap with, there's no one to move back to — that
// case is crit 9 Stage 3's offer mechanism, not this function's job.
function moveBackOnePlace(missed: Reservation, now: number): boolean {
  const [, next] = activeReservations(missed.machineId);
  if (!next) return false;

  const missedJoinedAt = missed.joinedAt;
  const nextJoinedAt = next.joinedAt;
  db.update(reservations)
    .set({ joinedAt: missedJoinedAt, notice: "moved_up", turnStartedAt: null })
    .where(eq(reservations.id, next.id))
    .run();
  db.update(reservations)
    .set({ joinedAt: nextJoinedAt, status: "waiting", notice: "moved_back", turnStartedAt: null, claimedAt: null })
    .where(eq(reservations.id, missed.id))
    .run();
  return true;
}

// Lazily brings a machine's queue up to date: finishes a running wash
// whose time is up, and settles a front-of-queue claim/start window
// that's been missed (moveBackOnePlace above).
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

    if (front.status === "claimed") {
      if (now - front.claimedAt! >= START_WINDOW_MS) {
        if (moveBackOnePlace(front, now)) continue;
        return;
      }
      return;
    }

    // front.status === "waiting": the machine is free for them. Mark when
    // their claim window started, the first time we notice this.
    if (front.turnStartedAt == null) {
      db.update(reservations).set({ turnStartedAt: now }).where(eq(reservations.id, front.id)).run();
      return;
    }

    // Crit 9 Stage 3: a reservation created by accepting an offer gets the
    // longer 10-minute window, since it means travelling to a machine you
    // weren't already at — plan.md's own distinction, not the normal
    // 3-minute in-place claim window.
    const window = front.offerId != null ? OFFER_CLAIM_WINDOW_MS : CLAIM_WINDOW_MS;
    if (now - front.turnStartedAt >= window) {
      if (moveBackOnePlace(front, now)) continue;
      return;
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
  /** Crit 9 Stage 2: set once if this reservation was just moved by settleMachine()'s swap, cleared by dismissNotice. */
  notice: Reservation["notice"];
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
      claimDeadlineMs:
        i === 0 && r.status === "waiting" && r.turnStartedAt != null
          ? r.turnStartedAt + (r.offerId != null ? OFFER_CLAIM_WINDOW_MS : CLAIM_WINDOW_MS)
          : undefined,
      notice: r.notice,
    };
  });
}

export type ActionResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; message: string };
export type JoinResult = { ok: true; reservationId: number } | { ok: false; status: 400 | 404 | 409; message: string };

// A room can hold at most this many active reservations per machine type at
// once — enough to wash darks and lights at the same time, not enough to
// tie up every washer (plan.md). "Active" is the same waiting/claimed/
// running set the fairness rule already uses.
export const MAX_ACTIVE_PER_TYPE = 2;

export function join(machineId: number, personName: string, washingType: string, durationMinutes: number): JoinResult {
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return { ok: false, status: 404, message: "no such machine" };

  const activeOfType = db
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(machines, eq(reservations.machineId, machines.id))
    .where(
      and(
        eq(reservations.personName, personName),
        eq(machines.type, machine.type),
        inArray(reservations.status, ACTIVE_STATUSES),
      ),
    )
    .all().length;
  if (activeOfType >= MAX_ACTIVE_PER_TYPE) {
    return {
      ok: false,
      status: 409,
      message: `${personName} already has ${MAX_ACTIVE_PER_TYPE} active ${machine.type} reservations`,
    };
  }

  const now = Date.now();
  const { id } = db
    .insert(reservations)
    .values({ machineId, personName, washingType, durationMinutes, joinedAt: now, status: "waiting" })
    .returning({ id: reservations.id })
    .get();
  settleMachine(machineId, now); // if the machine's free, this starts their claim window immediately
  return { ok: true, reservationId: id };
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

// Crit 9 (plans/crit-9.md Stage 2): clears a moved_back/moved_up notice
// once the person has actually seen it — doesn't auto-expire on a timer,
// since the point is confirming it was seen, not that time passed.
export function dismissNotice(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;

  db.update(reservations).set({ notice: null }).where(eq(reservations.id, row.id)).run();
  return { ok: true };
}

// --- crit 9 Stage 3: the "earlier machine" offer ---------------------

function isIdle(machineId: number): boolean {
  return activeReservations(machineId).length === 0;
}

function pendingOfferFor(machineId: number): Offer | undefined {
  return db
    .select()
    .from(offers)
    .where(and(eq(offers.machineId, machineId), eq(offers.status, "pending")))
    .get();
}

function hasDeclinedOrExpiredOfferFor(reservationId: number, machineId: number): boolean {
  return (
    db
      .select({ id: offers.id })
      .from(offers)
      .where(
        and(
          eq(offers.reservationId, reservationId),
          eq(offers.machineId, machineId),
          inArray(offers.status, ["declined", "expired"]),
        ),
      )
      .get() != null
  );
}

function hasAnyPendingOffer(reservationId: number): boolean {
  return (
    db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.reservationId, reservationId), eq(offers.status, "pending")))
      .get() != null
  );
}

// plan.md's User story: among everyone waiting for a machine of this
// type, elsewhere, the longest-waiting person for whom this specific
// opening would genuinely be earlier gets it — someone already about to
// start on their own machine is skipped, not offered.
function eligibleCandidate(machineType: string, idleMachineId: number, now: number): Reservation | undefined {
  const candidates = db
    .select({ r: reservations })
    .from(reservations)
    .innerJoin(machines, eq(reservations.machineId, machines.id))
    .where(
      and(eq(machines.type, machineType), ne(reservations.machineId, idleMachineId), eq(reservations.status, "waiting")),
    )
    .orderBy(asc(reservations.joinedAt))
    .all()
    .map((row) => row.r);

  for (const candidate of candidates) {
    if (hasAnyPendingOffer(candidate.id)) continue;
    if (hasDeclinedOrExpiredOfferFor(candidate.id, idleMachineId)) continue;

    const ownRow = queueFor(candidate.machineId, now).find((r) => r.reservationId === candidate.id);
    if (!ownRow || ownRow.scheduledStartMs <= now) continue; // already about to start

    return candidate;
  }
  return undefined;
}

// Expires overdue offers, then offers every now-offer-free idle machine
// to its eligible candidate, if any (plans/crit-9.md Stage 3). Called
// from the realtime tick, the same "tick does the detecting" shape as
// settleMachine — offers aren't tied to a request either.
export function processOffers(now: number = Date.now()): void {
  const overdue = db
    .select()
    .from(offers)
    .where(and(eq(offers.status, "pending")))
    .all()
    .filter((o) => now >= o.respondBy);
  for (const o of overdue) {
    db.update(offers).set({ status: "expired" }).where(eq(offers.id, o.id)).run();
  }

  const allMachines = db.select().from(machines).all();
  for (const machine of allMachines) {
    if (!isIdle(machine.id)) continue;
    if (pendingOfferFor(machine.id)) continue;

    const candidate = eligibleCandidate(machine.type, machine.id, now);
    if (!candidate) continue;

    db.insert(offers)
      .values({ reservationId: candidate.id, machineId: machine.id, offeredAt: now, respondBy: now + OFFER_RESPOND_WINDOW_MS })
      .run();
  }
}

function loadOwnedOffer(offerId: number, personName: string): { offer: Offer; reservation: Reservation } | ActionResult {
  const offer = db.select().from(offers).where(eq(offers.id, offerId)).get();
  if (!offer) return { ok: false, status: 404, message: "no such offer" };
  const reservation = db.select().from(reservations).where(eq(reservations.id, offer.reservationId)).get();
  if (!reservation || reservation.personName !== personName) {
    return { ok: false, status: 403, message: "not your offer" };
  }
  if (offer.status !== "pending") return { ok: false, status: 409, message: "this offer is no longer open" };
  return { offer, reservation };
}

// Accepting only makes sense while still waiting on the original machine
// — claimed/running means already committed there. Vacates the original
// spot entirely (same effect as cancel) and claims the new, idle machine
// directly: no double-holding, and no re-check against
// MAX_ACTIVE_PER_TYPE, since this is a swap, not an addition.
export function acceptOffer(offerId: number, personName: string): ActionResult {
  const loaded = loadOwnedOffer(offerId, personName);
  if ("ok" in loaded) return loaded;
  const { offer, reservation } = loaded;
  if (reservation.status !== "waiting") {
    return { ok: false, status: 409, message: "you're already committed to your own machine" };
  }

  const now = Date.now();
  db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, reservation.id)).run();
  db.insert(reservations)
    .values({
      machineId: offer.machineId,
      personName,
      washingType: reservation.washingType,
      durationMinutes: reservation.durationMinutes,
      joinedAt: now,
      status: "waiting",
      offerId: offer.id,
    })
    .run();
  db.update(offers).set({ status: "accepted" }).where(eq(offers.id, offer.id)).run();
  settleMachine(reservation.machineId, now); // the old spot's next person may now be free to claim
  settleMachine(offer.machineId, now); // starts the new (10-minute) claim window immediately
  return { ok: true };
}

// Leaves the original reservation untouched — the next tick's
// processOffers naturally finds the next eligible candidate, rather than
// duplicating candidate-selection here.
export function declineOffer(offerId: number, personName: string): ActionResult {
  const loaded = loadOwnedOffer(offerId, personName);
  if ("ok" in loaded) return loaded;
  db.update(offers).set({ status: "declined" }).where(eq(offers.id, loaded.offer.id)).run();
  return { ok: true };
}

// Crit 9 (plans/crit-9.md Stage 1.5): the app never actually controls a
// machine — "start" only ever recorded a timestamp — so ending a wash
// early just means the same "done" a normal finish already produces
// (settleMachine's own running-timer-elapsed branch), not a new status.
// No "pause": a frozen duration is a concept this app would have to
// invent purely in software, and the queue only cares when the machine
// frees up for the next person, not whether its owner stepped out.
export function finish(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;
  if (row.status !== "running") return { ok: false, status: 409, message: "this wash isn't running" };

  db.update(reservations).set({ status: "done" }).where(eq(reservations.id, row.id)).run();
  settleMachine(row.machineId); // the next person may now be free to claim
  return { ok: true };
}
