import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { now as clockNow } from "./clock.ts";
import { db } from "./db.ts";
import * as logging from "./logging.ts";
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
// Crit 10 extension, Stage 10 (plans/crit-10.md "Extension"; ADR 0008): a
// double-submit window — a resident on a slow connection taps "Reserve"
// again because nothing seemed to happen. Far longer than a double tap,
// far shorter than a real second visit to the page, per ADR 0008's own
// reasoning.
export const JOIN_DEDUP_WINDOW_MS = 3 * 1000;

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
  // Crit 10 (plans/crit-10.md Stage 4): both sides of one swap share
  // settleMachine's ambient tag (request's own, or a fresh tick tag — see
  // ensureTag below), so the log reads as one decision, not two unrelated
  // lines.
  logging.logEvent("reservation_moved_back", { reservation: missed.id, room: missed.personName, machine: missed.machineId });
  logging.logEvent("reservation_moved_up", { reservation: next.id, room: next.personName, machine: next.machineId });
  return true;
}

// Lazily brings a machine's queue up to date: finishes a running wash
// whose time is up, and settles a front-of-queue claim/start window
// that's been missed (moveBackOnePlace above).
//
// Crit 10 (plans/crit-10.md Stage 4): wrapped in ensureTag — called both
// synchronously inside a request handler (join/cancel/finish/acceptOffer
// all call this directly, so a swap it triggers shares that request's own
// tag) and from the realtime tick with no request behind it at all (a
// passive expiry nobody's clicking anything for), where ensureTag mints a
// fresh tag instead. No call site elsewhere needs to know which case it is.
export function settleMachine(machineId: number, now: number = clockNow()): void {
  logging.ensureTag(() => settleMachineInner(machineId, now));
}

function settleMachineInner(machineId: number, now: number): void {
  for (;;) {
    const [front] = activeReservations(machineId);
    if (!front) return;

    if (front.status === "running") {
      const endsAt = front.startedAt! + front.durationMinutes * 60_000;
      if (now >= endsAt) {
        db.update(reservations).set({ status: "done" }).where(eq(reservations.id, front.id)).run();
        // Named differently from the manual "end the wash early" action
        // (reservation_finished, app.ts) so the log never confuses a wash
        // that ran its full course with one someone cut short.
        logging.logEvent("reservation_completed_auto", { reservation: front.id, room: front.personName, machine: machineId });
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
      // Crit 9 (plans/crit-9.md Stage 8): a dryer reservation queued
      // alongside a still-running wash holds its place, but its claim
      // window must not start until the referenced reservation is done —
      // otherwise the window could run out before the resident can
      // possibly be standing at the dryer.
      if (front.notBeforeReservationId != null) {
        const blocker = db
          .select({ status: reservations.status })
          .from(reservations)
          .where(eq(reservations.id, front.notBeforeReservationId))
          .get();
        if (blocker && blocker.status !== "done") return;
      }
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
export function queueFor(machineId: number, now: number = clockNow()): QueueRow[] {
  settleMachine(machineId, now);
  const ordered = activeReservations(machineId);

  let previousEnd = now;
  let previousFixed = true;
  return ordered.map((r, i) => {
    let scheduledStartMs: number;
    let fixed: boolean;

    if (i === 0) {
      if (r.status === "running") {
        scheduledStartMs = r.startedAt!;
        fixed = true;
      } else if (r.turnStartedAt != null) {
        scheduledStartMs = r.turnStartedAt;
        fixed = false;
      } else if (r.notBeforeReservationId != null) {
        // Crit 9 Stage 8: a dryer reservation still waiting on its
        // blocking wash to finish — its own claim window hasn't started
        // yet, so show when the blocker is expected to end, not "now"
        // (which would wrongly read as "ready immediately").
        const blocker = db.select().from(reservations).where(eq(reservations.id, r.notBeforeReservationId)).get();
        if (blocker?.status === "running") {
          scheduledStartMs = blocker.startedAt! + blocker.durationMinutes * 60_000;
          fixed = true;
        } else if (blocker) {
          // Still waiting/claimed itself: a rough estimate, not chased
          // through its own full queue chain — good enough for display,
          // and it corrects itself every tick once the blocker starts.
          scheduledStartMs = now + blocker.durationMinutes * 60_000;
          fixed = false;
        } else {
          scheduledStartMs = now;
          fixed = false;
        }
      } else {
        scheduledStartMs = now;
        fixed = false;
      }
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
export type JoinResult = { ok: true; reservationId: number } | { ok: false; status: 400 | 403 | 404 | 409; message: string };

// A room can hold at most this many active reservations per machine type at
// once — enough to wash darks and lights at the same time, not enough to
// tie up every washer (plan.md). "Active" is the same waiting/claimed/
// running set the fairness rule already uses.
export const MAX_ACTIVE_PER_TYPE = 2;

function activeOfTypeCount(personName: string, machineType: string): number {
  return db
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(machines, eq(reservations.machineId, machines.id))
    .where(
      and(
        eq(reservations.personName, personName),
        eq(machines.type, machineType),
        inArray(reservations.status, ACTIVE_STATUSES),
      ),
    )
    .all().length;
}

// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007/0008):
// the fairness rule's whole mechanism is "swap two reservations'
// joinedAt" (moveBackOnePlace above) — found by the property tests this
// stage adds: two joins landing in the same millisecond gave them equal
// joinedAt, which made that swap a no-op, silently defeating the fairness
// rule exactly when ADR 0008's own "several rooms join at once" scenario
// happens. Keeping joinedAt strictly increasing per machine (bump to one
// past whatever's already there, if "now" would collide) fixes it at the
// source: ties can never occur, so the swap always has an effect, and
// queue position among genuinely simultaneous joins still resolves
// deterministically (insertion order) rather than being
// implementation-defined.
function nextJoinedAt(machineId: number, now: number): number {
  const latest = activeReservations(machineId).at(-1)?.joinedAt;
  return latest != null && now <= latest ? latest + 1 : now;
}

// Crit 10 extension, Stage 10 (plans/crit-10.md "Extension"; ADR 0008):
// the same room joining the same machine with the same washing type again
// within JOIN_DEDUP_WINDOW_MS is treated as the same request arriving
// twice (a double tap, or a resident retrying because a slow connection
// hadn't shown a result yet) — not a second, genuinely new reservation.
// Scoped to "active" reservations only: once the first one has already
// moved on (cancelled, done, ...), a new join is a new join, however soon
// after.
function recentDuplicateJoin(
  machineId: number,
  personName: string,
  washingType: string,
  now: number,
): Reservation | undefined {
  return activeReservations(machineId).find(
    (r) => r.personName === personName && r.washingType === washingType && now - r.joinedAt < JOIN_DEDUP_WINDOW_MS,
  );
}

export function join(machineId: number, personName: string, washingType: string, durationMinutes: number): JoinResult {
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return { ok: false, status: 404, message: "no such machine" };

  const now = clockNow();
  const duplicate = recentDuplicateJoin(machineId, personName, washingType, now);
  if (duplicate) return { ok: true, reservationId: duplicate.id };

  if (activeOfTypeCount(personName, machine.type) >= MAX_ACTIVE_PER_TYPE) {
    return {
      ok: false,
      status: 409,
      message: `${personName} already has ${MAX_ACTIVE_PER_TYPE} active ${machine.type} reservations`,
    };
  }

  const joinedAt = nextJoinedAt(machineId, now);
  const { id } = db
    .insert(reservations)
    .values({ machineId, personName, washingType, durationMinutes, joinedAt, status: "waiting" })
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

  db.update(reservations).set({ status: "claimed", claimedAt: clockNow() }).where(eq(reservations.id, row.id)).run();
  return { ok: true };
}

export function start(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;
  if (row.status !== "claimed") return { ok: false, status: 409, message: "claim the machine before starting it" };

  db.update(reservations).set({ status: "running", startedAt: clockNow() }).where(eq(reservations.id, row.id)).run();
  return { ok: true };
}

export function cancel(reservationId: number, personName: string): ActionResult {
  const row = loadOwned(reservationId, personName);
  if ("ok" in row) return row;
  if (row.status !== "waiting" && row.status !== "claimed") {
    return { ok: false, status: 409, message: "can't cancel a running or finished reservation" };
  }

  db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, row.id)).run();
  cancelDependentDryer(row.id); // Crit 9 Stage 8: no reason to hold a dryer slot for a wash that isn't happening
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
//
// Crit 10 (plans/crit-10.md Stage 4): ensureTag the same way settleMachine
// is — processOffers is only ever called from the tick today, with no
// ambient request tag to reuse, but ensureTag keeps this safe even if that
// ever changes, with no extra parameter to thread through call sites.
export function processOffers(now: number = clockNow()): void {
  logging.ensureTag(() => processOffersInner(now));
}

function processOffersInner(now: number): void {
  const overdue = db
    .select()
    .from(offers)
    .where(and(eq(offers.status, "pending")))
    .all()
    .filter((o) => now >= o.respondBy);
  for (const o of overdue) {
    db.update(offers).set({ status: "expired" }).where(eq(offers.id, o.id)).run();
    const reservation = db.select().from(reservations).where(eq(reservations.id, o.reservationId)).get();
    logging.logEvent("offer_expired", {
      offer: o.id,
      reservation: o.reservationId,
      room: reservation?.personName ?? "?",
      machine: o.machineId,
    });
  }

  const allMachines = db.select().from(machines).all();
  for (const machine of allMachines) {
    if (!isIdle(machine.id)) continue;
    if (pendingOfferFor(machine.id)) continue;

    const candidate = eligibleCandidate(machine.type, machine.id, now);
    if (!candidate) continue;

    const { id } = db
      .insert(offers)
      .values({ reservationId: candidate.id, machineId: machine.id, offeredAt: now, respondBy: now + OFFER_RESPOND_WINDOW_MS })
      .returning({ id: offers.id })
      .get();
    logging.logEvent("offer_created", { offer: id, reservation: candidate.id, room: candidate.personName, machine: machine.id });
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

  const now = clockNow();
  db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, reservation.id)).run();
  db.insert(reservations)
    .values({
      machineId: offer.machineId,
      personName,
      washingType: reservation.washingType,
      durationMinutes: reservation.durationMinutes,
      joinedAt: nextJoinedAt(offer.machineId, now), // same tie-avoidance as join() above
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

// --- crit 9 Stage 8: queuing a dryer alongside a washer reservation ----

// When a new arrival would join this machine's queue right now, when
// would *they* actually start? Mirrors queueFor's own chain, but for a
// reservation that doesn't exist yet — used only to compare dryers
// against each other, not shown directly to anyone.
function estimatedStartForNewArrival(machineId: number, now: number): number {
  const rows = queueFor(machineId, now);
  const last = rows[rows.length - 1];
  return last ? last.endMs : now;
}

export interface DryerOption {
  machineId: number;
  label: string;
}

// Crit 9 (plans/crit-9.md Stage 8): picks between the 2 dryers by the
// later of (a) when the resident's own wash actually finishes and (b)
// when that dryer would actually be free for a new arrival — not
// "whichever dryer is idle right now," which could reserve a slot whose
// claim window starts before the resident can possibly reach it. Returns
// undefined if there are no dryers at all (shouldn't happen once Stage 8
// ships, but this function shouldn't assume it).
function pickDryer(washEndMs: number, now: number): DryerOption | undefined {
  const dryers = db.select().from(machines).where(eq(machines.type, "dryer")).all();
  if (dryers.length === 0) return undefined;

  let best: { machine: Machine; readyAt: number } | undefined;
  for (const dryer of dryers) {
    const readyAt = Math.max(washEndMs, estimatedStartForNewArrival(dryer.id, now));
    if (!best || readyAt < best.readyAt) best = { machine: dryer, readyAt };
  }
  return best && { machineId: best.machine.id, label: best.machine.label };
}

function hasQueuedDryer(washReservationId: number): boolean {
  return (
    db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(eq(reservations.notBeforeReservationId, washReservationId), inArray(reservations.status, ACTIVE_STATUSES)),
      )
      .get() != null
  );
}

// Surfaced as a dismissible prompt once a washer reservation succeeds —
// never automatic, since only the resident knows whether holding a dryer
// slot is actually worth it to them (same reasoning as Stage 3's offers).
// undefined means "don't show the prompt": no such reservation, it's not
// a washer reservation still in progress, it was already dismissed, a
// dryer is already queued for it, or no dryer exists to suggest.
export function suggestedDryer(washReservationId: number): DryerOption | undefined {
  const wash = db.select().from(reservations).where(eq(reservations.id, washReservationId)).get();
  if (!wash) return undefined;
  if (wash.status !== "waiting" && wash.status !== "claimed" && wash.status !== "running") return undefined;
  if (wash.dryerPromptDismissed) return undefined;
  if (hasQueuedDryer(washReservationId)) return undefined;

  const machine = db.select().from(machines).where(eq(machines.id, wash.machineId)).get();
  if (!machine || machine.type !== "washer") return undefined;

  const now = clockNow();
  const washRow = queueFor(wash.machineId, now).find((r) => r.reservationId === washReservationId);
  if (!washRow) return undefined;
  return pickDryer(washRow.endMs, now);
}

// Crit 9 (plans/crit-9.md Stage 8): "no thanks" on the dryer prompt —
// permanent, not just hidden for this page load, so it doesn't keep
// reappearing on every reload.
export function dismissDryerPrompt(washReservationId: number, personName: string): ActionResult {
  const row = loadOwned(washReservationId, personName);
  if ("ok" in row) return row;
  db.update(reservations).set({ dryerPromptDismissed: 1 }).where(eq(reservations.id, row.id)).run();
  return { ok: true };
}

// Queues the dryer reservation with notBeforeReservationId set to the
// washer reservation — settleMachine() won't start its claim window
// until that washer reservation reaches "done". Per-type active-
// reservation cap still applies to the dryer type independently (plan.md
// — this doesn't let one resident monopolize more washers than before).
export function queueDryer(washReservationId: number, personName: string, dryingType: string, durationMinutes: number): JoinResult {
  const wash = db.select().from(reservations).where(eq(reservations.id, washReservationId)).get();
  if (!wash || wash.personName !== personName) return { ok: false, status: 403, message: "not your reservation" };
  if (wash.status !== "waiting" && wash.status !== "claimed" && wash.status !== "running") {
    return { ok: false, status: 409, message: "that wash isn't active" };
  }

  const option = suggestedDryer(washReservationId);
  if (!option) return { ok: false, status: 404, message: "no dryer available" };

  if (activeOfTypeCount(personName, "dryer") >= MAX_ACTIVE_PER_TYPE) {
    return { ok: false, status: 409, message: `${personName} already has ${MAX_ACTIVE_PER_TYPE} active dryer reservations` };
  }

  const now = clockNow();
  const { id } = db
    .insert(reservations)
    .values({
      machineId: option.machineId,
      personName,
      washingType: dryingType,
      durationMinutes,
      joinedAt: nextJoinedAt(option.machineId, now), // same tie-avoidance as join() above
      status: "waiting",
      notBeforeReservationId: washReservationId,
    })
    .returning({ id: reservations.id })
    .get();
  return { ok: true, reservationId: id };
}

// Crit 9 (plans/crit-9.md Stage 8): cancelling the washer reservation
// cancels its dependent, not-yet-claimed dryer reservation too — there's
// no reason to hold a dryer slot for a wash that isn't happening. Already-
// claimed/running dryer reservations are left alone: the resident is
// already there, cancelling out from under them would be worse than
// leaving it be.
function cancelDependentDryer(washReservationId: number): void {
  const dependent = db
    .select()
    .from(reservations)
    .where(and(eq(reservations.notBeforeReservationId, washReservationId), eq(reservations.status, "waiting")))
    .get();
  if (dependent) {
    db.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, dependent.id)).run();
    settleMachine(dependent.machineId);
  }
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
