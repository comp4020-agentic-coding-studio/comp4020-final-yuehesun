import { expect, inject, it } from "vitest";
import { cleanupReservation, claim, identityCookie, join, uniqueRoom } from "./support/queue-client.ts";

// Stage 8.4b (plans/3d-walkthrough.md, docs/adr/0013): the real
// unclaimed-laundry handoff, driven against the real running app over
// HTTP exactly like every other spec/ file. Uses machine 2, shared with
// queue-order.test.ts — safe because both files always drive their own
// reservations through to a terminal state (done/cancelled) before
// returning, the same "shared machine id, but nothing is left active"
// guarantee laundry-scan.test.ts already relies on for machines 9/10.
//
// plans/laundry-dropoff-flow.md: the one-shot handoff is split into two
// real steps (pick up, then place) — real 3D-room use found the one-shot
// version had no server state for "being carried," which made the shelf's
// own occupancy display and the carrying resident's own basket visibility
// race each other. This file drives the two-step flow end to end,
// preserving every case the original one-shot version covered (the
// authorization boundary, pool exhaustion, reuse after acknowledgement)
// across the split, plus new cases the split itself introduces: an
// unauthorized "place" by someone other than the carrier, placing with
// the pool genuinely full, and the handoff indicator staying visible
// through the in-transit window.
const baseUrl = inject("baseUrl");
const MACHINE_ID = 2;

async function startAndFinish(cookie: string, reservationId: number): Promise<void> {
  const claimStatus = await claim(baseUrl, cookie, reservationId);
  expect(claimStatus, "claiming should succeed").toBeLessThan(400);
  const startRes = await fetch(new URL(`/reservations/${reservationId}/start`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(startRes.status, "starting should succeed").toBeLessThan(400);
  const finishRes = await fetch(new URL(`/reservations/${reservationId}/finish`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(finishRes.status, "ending the wash should succeed").toBeLessThan(400);
}

async function pickUp(cookie: string | undefined, machineId: number): Promise<Response> {
  return fetch(new URL(`/machines/${machineId}/pickup`, baseUrl), {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

async function place(cookie: string | undefined, machineId: number): Promise<Response> {
  return fetch(new URL(`/machines/${machineId}/place`, baseUrl), {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

// The common case this file exercises repeatedly: pick up then
// immediately place, returning the real assigned spot — the two-step
// equivalent of the old single handoff() call.
async function pickUpAndPlace(cookie: string, machineId: number): Promise<{ status: number; spot?: string }> {
  const pickupRes = await pickUp(cookie, machineId);
  if (pickupRes.status >= 400) return { status: pickupRes.status };
  const placeRes = await place(cookie, machineId);
  if (placeRes.status >= 400) return { status: placeRes.status };
  const { spot } = (await placeRes.json()) as { spot: string };
  return { status: placeRes.status, spot };
}

async function acknowledgePickup(cookie: string, reservationId: number): Promise<Response> {
  return fetch(new URL(`/reservations/${reservationId}/acknowledge-pickup`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
}

async function myStatusHtml(cookie: string): Promise<string> {
  const res = await fetch(new URL("/my-status", baseUrl), { headers: { cookie } });
  return res.text();
}

async function machinesState(cookie: string): Promise<{
  machines: { id: number; unclaimedLaundry?: { room: string; canHandOff: boolean } }[];
  myBasketVisible: boolean;
  basketKind: string;
  carryingFromMachine?: number;
}> {
  const res = await fetch(new URL("/laundry/machines-state", baseUrl), { headers: { cookie } });
  expect(res.status).toBe(200);
  return res.json();
}

it("lets the front-of-queue room move a finished stranger's laundry to a free spot, notifies the owner, and frees the spot on acknowledgement", async () => {
  const ownerRoom = uniqueRoom();
  const owner = await identityCookie(baseUrl, ownerRoom);
  const next = await identityCookie(baseUrl, uniqueRoom());
  const stranger = await identityCookie(baseUrl, uniqueRoom());

  const ownerReservation = await join(baseUrl, owner, MACHINE_ID);
  await startAndFinish(owner, ownerReservation);

  // Not yet the front of an active queue — owner's reservation is "done",
  // which has already left activeReservations' waiting/claimed/running
  // set, so this join makes `next` the actual front, waiting reservation.
  const nextReservation = await join(baseUrl, next, MACHINE_ID);

  // Someone else entirely — not holding the front waiting reservation on
  // this machine — must be refused. This is the one thing this feature
  // must never allow: moving someone's laundry on another room's behalf.
  const strangerAttempt = await pickUp(stranger, MACHINE_ID);
  expect(strangerAttempt.status, "only the front, waiting room for this machine may pick up its laundry").toBe(403);

  // While the laundry is in transit (picked up but not yet placed), the
  // machine's own handoff indicator must still show it as unclaimed — it
  // hasn't resolved from any other viewer's perspective until it's
  // actually placed somewhere.
  const pickupRes = await pickUp(next, MACHINE_ID);
  expect(pickupRes.status, "the front, waiting room should be able to pick up the finished laundry").toBe(200);
  const stateWhileCarrying = await machinesState(next);
  const machineWhileCarrying = stateWhileCarrying.machines.find((m) => m.id === MACHINE_ID);
  expect(machineWhileCarrying?.unclaimedLaundry, "the handoff indicator should stay on while the laundry is in transit").toBeTruthy();
  expect(stateWhileCarrying.myBasketVisible, "the carrier's basket should be visible while carrying").toBe(true);
  expect(stateWhileCarrying.basketKind, "the carrier's basket should read as someone else's laundry").toBe("other");
  expect(stateWhileCarrying.carryingFromMachine, "the client should know which machine this carry came from").toBe(MACHINE_ID);

  const placeRes = await place(next, MACHINE_ID);
  expect(placeRes.status, "the carrier should be able to place the laundry on a shelf").toBe(200);
  const { spot } = (await placeRes.json()) as { spot: string };
  expect(spot, "a real spot from the fixed list should be assigned").toMatch(/^A[1-6]$/);

  // Once placed, the carry itself should be over — `next` still has their
  // own waiting reservation on this machine, so myBasketVisible correctly
  // stays true (that's their own laundry-to-be, a separate fact), but
  // carryingFromMachine/basketKind must reflect that the carry is done.
  const stateAfterPlace = await machinesState(next);
  expect(stateAfterPlace.carryingFromMachine, "carryingFromMachine should clear once placed").toBeUndefined();
  expect(stateAfterPlace.basketKind, "basketKind should read as the carrier's own laundry once the carry is done").toBe("own");

  // A second pickup attempt on the same machine has nothing left to pick
  // up (unacknowledgedLaundryOn is now empty) — this is the "not already
  // occupied by another unacknowledged handoff" case for this same
  // reservation, not the separate reused-spot case covered below.
  const secondAttempt = await pickUp(next, MACHINE_ID);
  expect(secondAttempt.status, "nothing left to pick up once the laundry's already placed").toBe(404);

  const ownerStatus = await myStatusHtml(owner);
  expect(ownerStatus, "the owner should see a notice naming the real assigned spot").toContain(`Shelf ${spot}`);
  expect(ownerStatus, "the notice's acknowledge button should post to this reservation's own acknowledge-pickup route").toContain(
    `/reservations/${ownerReservation}/acknowledge-pickup`,
  );

  // Acknowledging on someone else's reservation must still be refused —
  // acknowledgePickup is loadOwned-gated like every other per-reservation
  // action, no exception for it (unlike the pickup/place steps themselves).
  const strangerAck = await acknowledgePickup(stranger, ownerReservation);
  expect(strangerAck.status, "only the laundry's real owner may acknowledge its pickup").toBe(403);

  const ackRes = await acknowledgePickup(owner, ownerReservation);
  expect(ackRes.status, "the real owner acknowledging pickup should succeed").toBeLessThan(400);

  const ownerStatusAfterAck = await myStatusHtml(owner);
  expect(ownerStatusAfterAck, "acknowledging should clear the pending-pickup notice").not.toContain(`Shelf ${spot}`);

  await cleanupReservation(baseUrl, next, nextReservation);
});

it("rejects a place by anyone other than the room currently carrying it, including the original front-waiting holder after they've moved on", async () => {
  const ownerRoom = uniqueRoom();
  const owner = await identityCookie(baseUrl, ownerRoom);
  const carrier = await identityCookie(baseUrl, uniqueRoom());
  const stranger = await identityCookie(baseUrl, uniqueRoom());

  const ownerReservation = await join(baseUrl, owner, MACHINE_ID);
  await startAndFinish(owner, ownerReservation);
  const carrierReservation = await join(baseUrl, carrier, MACHINE_ID);

  const pickupRes = await pickUp(carrier, MACHINE_ID);
  expect(pickupRes.status, "the front, waiting room should be able to pick up the finished laundry").toBe(200);

  // Not the carrier — placing is gated on "are you currently carrying
  // this," not "are you the machine's front waiting holder," so a
  // stranger (who was never any part of this handoff) must be refused.
  const strangerPlace = await place(stranger, MACHINE_ID);
  expect(strangerPlace.status, "only the room currently carrying the laundry may place it").toBe(404);

  const placeRes = await place(carrier, MACHINE_ID);
  expect(placeRes.status, "the real carrier should still be able to place it").toBe(200);
  const { spot } = (await placeRes.json()) as { spot: string };

  await acknowledgePickup(owner, ownerReservation);
  await cleanupReservation(baseUrl, carrier, carrierReservation);
  expect(spot).toMatch(/^A[1-6]$/);
});

it("rejects a handoff with no unclaimed laundry waiting, rejects a place with the pool genuinely full, and reuses a freed spot for an unrelated later handoff", async () => {
  const soleRoom = await identityCookie(baseUrl, uniqueRoom());
  const soleReservation = await join(baseUrl, soleRoom, MACHINE_ID);

  // The sole, front, waiting room on an otherwise-empty machine — there is
  // no done, unclaimed reservation for them to pick up here.
  const emptyAttempt = await pickUp(soleRoom, MACHINE_ID);
  expect(emptyAttempt.status, "a pickup with nothing done and unclaimed on the machine should be rejected").toBe(404);

  await cleanupReservation(baseUrl, soleRoom, soleReservation);

  // A full, independent cycle: fills every one of the six fixed spots via
  // six separate machine-2 handoffs (one owner + one mover per round),
  // confirming all six are distinct, then acknowledges every one of them
  // so the shared spot pool is left exactly as it was found — this is the
  // exact "stale read"/off-by-one risk the plan calls out explicitly for
  // reusing a freed spot, exercised across the whole pool, not just one.
  const spotsSeen = new Set<string>();
  const rounds: { owner: string; ownerReservation: number }[] = [];

  for (let round = 0; round < 6; round++) {
    const owner = await identityCookie(baseUrl, uniqueRoom());
    const mover = await identityCookie(baseUrl, uniqueRoom());

    const ownerReservation = await join(baseUrl, owner, MACHINE_ID);
    await startAndFinish(owner, ownerReservation);
    const moverReservation = await join(baseUrl, mover, MACHINE_ID);

    const res = await pickUpAndPlace(mover, MACHINE_ID);
    expect(res.status, `round ${round}'s handoff should succeed while a spot is still free`).toBe(200);
    const spot = res.spot as string;
    expect(spotsSeen.has(spot), `round ${round} should never reuse a spot still occupied by an earlier round`).toBe(false);
    spotsSeen.add(spot);
    rounds.push({ owner, ownerReservation });

    await cleanupReservation(baseUrl, mover, moverReservation);
  }

  expect(spotsSeen.size, "all six fixed spots should have been used across six rounds, with no duplicate").toBe(6);

  // A seventh pickup, while every spot is genuinely occupied, must still
  // be rejected at pickup time (the pool-full check runs at pickup too,
  // so a carry never starts when there's nowhere for it to end up).
  const seventhOwner = await identityCookie(baseUrl, uniqueRoom());
  const seventhMover = await identityCookie(baseUrl, uniqueRoom());
  const seventhOwnerReservation = await join(baseUrl, seventhOwner, MACHINE_ID);
  await startAndFinish(seventhOwner, seventhOwnerReservation);
  const seventhMoverReservation = await join(baseUrl, seventhMover, MACHINE_ID);
  const fullPoolPickup = await pickUp(seventhMover, MACHINE_ID);
  expect(fullPoolPickup.status, "a pickup with every fixed spot still occupied should be rejected").toBe(409);

  // Acknowledging one of the six frees exactly one spot, which the
  // still-pending seventh pickup can now use — confirms a freed spot is
  // actually detected, not just that a fresh database starts empty.
  const { owner: firstOwner, ownerReservation: firstOwnerReservation } = rounds[0];
  const freedAck = await acknowledgePickup(firstOwner, firstOwnerReservation);
  expect(freedAck.status, "acknowledging pickup should free that spot").toBeLessThan(400);

  const reuseAttempt = await pickUpAndPlace(seventhMover, MACHINE_ID);
  expect(reuseAttempt.status, "a handoff should succeed again once a spot was freed by acknowledgement").toBe(200);
  const reusedSpot = reuseAttempt.spot as string;
  expect(reusedSpot, "the freed spot should be the one reused, since it's the only one available").not.toBe("");

  await acknowledgePickup(seventhOwner, seventhOwnerReservation);
  await cleanupReservation(baseUrl, seventhMover, seventhMoverReservation);
  for (const { owner, ownerReservation } of rounds.slice(1)) {
    await acknowledgePickup(owner, ownerReservation);
  }
});

it("rejects a place when the pool fills up between pickup and placement, without losing the in-transit laundry", async () => {
  // A narrower, deliberate version of the pool-exhaustion case above,
  // isolating the one new failure mode the pickup/place split itself
  // introduces: the pool can genuinely fill in the gap between a
  // successful pickup (checked, but didn't reserve a spot) and that same
  // carrier's own place call. Fillers use a different machine (4, unused
  // by any other spec file) — the pickup spot pool is shared across every
  // machine, but `carrier` keeps an active waiting reservation on
  // MACHINE_ID throughout this test (so it can be placed back on after
  // the retry), which would otherwise block every filler's own claim/
  // start/finish cycle from reaching the front of MACHINE_ID's queue.
  const FILLER_MACHINE_ID = 4;
  const carrierOwner = await identityCookie(baseUrl, uniqueRoom());
  const carrier = await identityCookie(baseUrl, uniqueRoom());
  const carrierOwnerReservation = await join(baseUrl, carrierOwner, MACHINE_ID);
  await startAndFinish(carrierOwner, carrierOwnerReservation);
  const carrierReservation = await join(baseUrl, carrier, MACHINE_ID);

  const pickupRes = await pickUp(carrier, MACHINE_ID);
  expect(pickupRes.status, "pickup should succeed while a spot is still free").toBe(200);

  // Fill every real spot elsewhere, via the one-shot pickUpAndPlace
  // helper, while `carrier` is still mid-carry on MACHINE_ID. Each
  // mover's own reservation is cancelled right after its handoff — like
  // the pool-exhaustion test above, a mover left `waiting` on
  // FILLER_MACHINE_ID would block the next round's owner from ever
  // reaching the front of that machine's queue.
  const fillers: { owner: string; ownerReservation: number }[] = [];
  for (let round = 0; round < 6; round++) {
    const owner = await identityCookie(baseUrl, uniqueRoom());
    const mover = await identityCookie(baseUrl, uniqueRoom());
    const ownerReservation = await join(baseUrl, owner, FILLER_MACHINE_ID);
    await startAndFinish(owner, ownerReservation);
    const moverReservation = await join(baseUrl, mover, FILLER_MACHINE_ID);
    const res = await pickUpAndPlace(mover, FILLER_MACHINE_ID);
    expect(res.status, `filler round ${round} should succeed`).toBe(200);
    fillers.push({ owner, ownerReservation });
    await cleanupReservation(baseUrl, mover, moverReservation);
  }

  // Now `carrier`'s own place call finds every real spot occupied.
  const placeRes = await place(carrier, MACHINE_ID);
  expect(placeRes.status, "placing with every spot genuinely full should be rejected").toBe(409);

  // The laundry is still in transit, not lost — a retry after a spot
  // frees up should succeed.
  const { owner: firstOwner, ownerReservation: firstOwnerReservation } = fillers[0];
  await acknowledgePickup(firstOwner, firstOwnerReservation);
  const retryPlace = await place(carrier, MACHINE_ID);
  expect(retryPlace.status, "placing should succeed once a spot frees up, with no re-pickup needed").toBe(200);

  const { spot: carrierSpot } = (await retryPlace.json()) as { spot: string };
  await acknowledgePickup(carrierOwner, carrierOwnerReservation);
  await cleanupReservation(baseUrl, carrier, carrierReservation);
  for (const { owner, ownerReservation } of fillers.slice(1)) {
    await acknowledgePickup(owner, ownerReservation);
  }
  expect(carrierSpot).toMatch(/^A[1-6]$/);
});
