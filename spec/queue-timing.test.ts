import { beforeEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../sim/harness.ts";

// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007):
// direct tests for each timing rule, driven through the real
// src/queue.ts functions on the virtual-clock harness — the same harness
// spec/fairness-properties.test.ts uses, just with specific, readable
// scenarios instead of random ones. Every CLAIM_WINDOW_MS /
// START_WINDOW_MS / OFFER_*_WINDOW_MS constant below is imported from
// queue.ts itself, not copied, so a future change to one of them can't
// silently desync this file from the real rule.
let h: Harness;

beforeEach(async () => {
  if (!h) h = await createHarness({ silent: true });
  h.reset();
});

it("moves a reservation back exactly one place when its claim window is missed", () => {
  const front = h.queue.join(1, "room301", "normal", 30);
  const back = h.queue.join(1, "room302", "normal", 30);
  if (!front.ok || !back.ok) throw new Error("setup failed");

  // Front is now waiting with its claim window started; let just over 3
  // minutes pass without claiming.
  h.advanceMinutes(Math.ceil(h.queue.CLAIM_WINDOW_MS / 60_000) + 1);

  const reservations = h.allReservations();
  const frontRow = reservations.find((r) => r.id === front.reservationId)!;
  const backRow = reservations.find((r) => r.id === back.reservationId)!;

  expect(frontRow.status, "the room that missed its claim window should be back to waiting, not removed").toBe("waiting");
  expect(frontRow.notice).toBe("moved_back");
  expect(backRow.notice).toBe("moved_up");

  // The swap is exactly the front two: backRow is now ahead of frontRow.
  const order = h.queue.queueFor(1, h.clock.now());
  const frontPos = order.find((r) => r.reservationId === front.reservationId)?.position;
  const backPos = order.find((r) => r.reservationId === back.reservationId)?.position;
  expect(backPos).toBe(1);
  expect(frontPos).toBe(2);
});

it("moves a reservation back one place when its start window (claimed but not started) is missed", () => {
  const front = h.queue.join(1, "room303", "normal", 30);
  const back = h.queue.join(1, "room304", "normal", 30);
  if (!front.ok || !back.ok) throw new Error("setup failed");

  const claimResult = h.queue.claim(front.reservationId, "room303");
  expect(claimResult.ok).toBe(true);

  // Claimed but never started; let just over 5 minutes pass.
  h.advanceMinutes(Math.ceil(h.queue.START_WINDOW_MS / 60_000) + 1);

  const reservations = h.allReservations();
  const frontRow = reservations.find((r) => r.id === front.reservationId)!;
  const backRow = reservations.find((r) => r.id === back.reservationId)!;

  expect(frontRow.status, "missing the start window should move back to waiting, not stay claimed").toBe("waiting");
  expect(frontRow.notice).toBe("moved_back");
  expect(backRow.notice).toBe("moved_up");
});

it("gives an accepted offer a 10-minute claim window, not the normal 3 minutes", () => {
  // Fill every other washer so the "earlier machine" eligibility algorithm
  // can only ever pick the one candidate this test sets up (mirrors
  // spec/offer.test.ts's own reasoning for occupying every unrelated
  // washer).
  const washerIds = h.machines.filter((m) => m.type === "washer").map((m) => m.id);
  const [holderMachine, idleMachine, ...others] = washerIds;
  const fillerRooms = others.map((id, i) => ({ id, room: `room-filler-${i}` }));
  for (const { id, room } of fillerRooms) {
    const r = h.queue.join(id, room, "normal", 30);
    if (!r.ok) throw new Error(`setup: couldn't fill machine ${id}`);
  }

  const holder = h.queue.join(holderMachine, "room305", "heavy", 45);
  const candidate = h.queue.join(holderMachine, "room306", "heavy", 45);
  if (!holder.ok || !candidate.ok) throw new Error("setup failed");

  // Make the idle machine idle by having someone finish their wash early.
  const finisher = h.queue.join(idleMachine, "room307", "test", 1);
  if (!finisher.ok) throw new Error("setup failed");
  expect(h.queue.claim(finisher.reservationId, "room307").ok).toBe(true);
  expect(h.queue.start(finisher.reservationId, "room307").ok).toBe(true);
  expect(h.queue.finish(finisher.reservationId, "room307").ok).toBe(true);

  // One tick (processOffers runs as part of advanceMinutes) notices the
  // idle machine and makes an offer.
  h.advanceMinutes(0);
  const offer = h.allOffers().find((o) => o.machineId === idleMachine && o.status === "pending");
  expect(offer, "no offer was created for the newly idle machine").toBeTruthy();

  const acceptResult = h.queue.acceptOffer(offer!.id, "room306");
  expect(acceptResult.ok).toBe(true);

  const newReservation = h
    .allReservations()
    .find((r) => r.machineId === idleMachine && r.personName === "room306" && r.status === "waiting");
  expect(newReservation, "accepting should create a new waiting reservation on the idle machine").toBeTruthy();
  expect(newReservation!.offerId).toBe(offer!.id);

  // moveBackOnePlace needs someone behind to swap with (with nobody
  // behind, missing a window just leaves the lone reservation waiting —
  // that's crit 9 Stage 3's offer mechanism's job, not this rule's) — a
  // straggler joining the now-claimed idle machine gives the 10-minute
  // window something to swap against once it expires.
  const straggler = h.queue.join(idleMachine, "room-straggler", "heavy", 45);
  expect(straggler.ok).toBe(true);

  // Let just over 3 minutes pass (the *normal* window) without claiming —
  // the offer-based 10-minute window should still be in force.
  h.advanceMinutes(Math.ceil(h.queue.CLAIM_WINDOW_MS / 60_000) + 1);
  const stillWaiting = h.allReservations().find((r) => r.id === newReservation!.id)!;
  expect(stillWaiting.status, "an offer-claimed reservation should survive the normal 3-minute window").toBe("waiting");
  expect(stillWaiting.notice).toBeNull();

  // Now let the remaining time past the full 10-minute window pass.
  h.advanceMinutes(Math.ceil(h.queue.OFFER_CLAIM_WINDOW_MS / 60_000) - Math.ceil(h.queue.CLAIM_WINDOW_MS / 60_000));
  const afterTenMinutes = h.allReservations().find((r) => r.id === newReservation!.id)!;
  expect(afterTenMinutes.notice, "the offer's own 10-minute window should eventually expire too").toBe("moved_back");
});

it("expires an unanswered offer after 2 minutes and passes it on to the next eligible candidate", () => {
  const washerIds = h.machines.filter((m) => m.type === "washer").map((m) => m.id);
  const [holderMachine, idleMachine, ...others] = washerIds;
  const fillerRooms = others.map((id, i) => ({ id, room: `room-filler2-${i}` }));
  for (const { id, room } of fillerRooms) {
    const r = h.queue.join(id, room, "normal", 30);
    if (!r.ok) throw new Error(`setup: couldn't fill machine ${id}`);
  }

  const holder = h.queue.join(holderMachine, "room308", "heavy", 45);
  // Two candidates on the holder machine, in join order — candidate1 is
  // offered first (longest-waiting eligible), candidate2 should get it
  // once candidate1's offer expires unanswered.
  const candidate1 = h.queue.join(holderMachine, "room309", "heavy", 45);
  const candidate2 = h.queue.join(holderMachine, "room310", "heavy", 45);
  if (!holder.ok || !candidate1.ok || !candidate2.ok) throw new Error("setup failed");
  // The holder actually claims and starts — otherwise its own 3-minute
  // claim window would expire in the same stretch of simulated time this
  // test advances to let the *offer's* 2-minute window lapse, triggering
  // an unrelated moveBackOnePlace swap on the holder machine that isn't
  // what this test means to exercise.
  expect(h.queue.claim(holder.reservationId, "room308").ok).toBe(true);
  expect(h.queue.start(holder.reservationId, "room308").ok).toBe(true);

  const finisher = h.queue.join(idleMachine, "room311", "test", 1);
  if (!finisher.ok) throw new Error("setup failed");
  h.queue.claim(finisher.reservationId, "room311");
  h.queue.start(finisher.reservationId, "room311");
  h.queue.finish(finisher.reservationId, "room311");

  h.advanceMinutes(0);
  const firstOffer = h.allOffers().find((o) => o.machineId === idleMachine && o.status === "pending");
  expect(firstOffer?.reservationId).toBe(candidate1.reservationId);

  // Let just over 2 minutes pass without responding.
  h.advanceMinutes(Math.ceil(h.queue.OFFER_RESPOND_WINDOW_MS / 60_000) + 1);

  const expiredOffer = h.allOffers().find((o) => o.id === firstOffer!.id)!;
  expect(expiredOffer.status).toBe("expired");

  const secondOffer = h.allOffers().find((o) => o.machineId === idleMachine && o.status === "pending");
  expect(secondOffer, "the offer should pass on to the next eligible candidate").toBeTruthy();
  expect(secondOffer!.reservationId).toBe(candidate2.reservationId);
});

it("holds a dryer reservation's claim window until its linked wash is done", () => {
  const dryerIds = h.machines.filter((m) => m.type === "dryer").map((m) => m.id);
  expect(dryerIds.length, "this test needs at least one dryer seeded").toBeGreaterThan(0);

  const wash = h.queue.join(1, "room312", "test", 1); // 1-minute wash
  if (!wash.ok) throw new Error("setup failed");
  expect(h.queue.claim(wash.reservationId, "room312").ok).toBe(true);
  expect(h.queue.start(wash.reservationId, "room312").ok).toBe(true);

  const dryerResult = h.queue.queueDryer(wash.reservationId, "room312", "test", 1);
  expect(dryerResult.ok).toBe(true);
  if (!dryerResult.ok) throw new Error("queueDryer failed");

  // Before the wash finishes, the dryer reservation must not have a
  // started claim window at all.
  h.advanceMinutes(0);
  let dryerRow = h.allReservations().find((r) => r.id === dryerResult.reservationId)!;
  expect(dryerRow.turnStartedAt, "the dryer's claim window shouldn't start before its wash is done").toBeNull();

  // Let the 1-minute wash finish (settleMachine's own auto-complete), plus
  // a tick's worth of margin.
  h.advanceMinutes(2);
  dryerRow = h.allReservations().find((r) => r.id === dryerResult.reservationId)!;
  const washRow = h.allReservations().find((r) => r.id === wash.reservationId)!;
  expect(washRow.status, "the wash should have auto-completed").toBe("done");
  expect(dryerRow.turnStartedAt, "the dryer's claim window should start once its wash is done").not.toBeNull();
});
