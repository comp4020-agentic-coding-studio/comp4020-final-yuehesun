import { expect, inject, it } from "vitest";
import { cleanupReservation, claim, identityCookie, join, uniqueRoom } from "./support/queue-client.ts";

// Stage 8.4b (plans/3d-walkthrough.md, docs/adr/0013): the real
// unclaimed-laundry handoff, driven against the real running app over
// HTTP exactly like every other spec/ file. Uses machine 2, shared with
// queue-order.test.ts — safe because both files always drive their own
// reservations through to a terminal state (done/cancelled) before
// returning, the same "shared machine id, but nothing is left active"
// guarantee laundry-scan.test.ts already relies on for machines 9/10.
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

async function handoff(cookie: string | undefined, machineId: number): Promise<Response> {
  return fetch(new URL(`/machines/${machineId}/handoff`, baseUrl), {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
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
  const strangerAttempt = await handoff(stranger, MACHINE_ID);
  expect(strangerAttempt.status, "only the front, waiting room for this machine may hand off its laundry").toBe(403);

  const handoffRes = await handoff(next, MACHINE_ID);
  expect(handoffRes.status, "the front, waiting room should be able to hand off the finished laundry").toBe(200);
  const { spot } = (await handoffRes.json()) as { spot: string };
  expect(spot, "a real spot from the fixed list should be assigned").toMatch(/^A[1-6]$/);

  // A second handoff attempt on the same machine has nothing left to hand
  // off (unacknowledgedLaundryOn is now empty) — this is the "not already
  // occupied by another unacknowledged handoff" case for this same
  // reservation, not the separate reused-spot case covered below.
  const secondAttempt = await handoff(next, MACHINE_ID);
  expect(secondAttempt.status, "nothing left to hand off once the laundry's already moved").toBe(404);

  const ownerStatus = await myStatusHtml(owner);
  expect(ownerStatus, "the owner should see a notice naming the real assigned spot").toContain(`Shelf ${spot}`);
  expect(ownerStatus, "the notice's acknowledge button should post to this reservation's own acknowledge-pickup route").toContain(
    `/reservations/${ownerReservation}/acknowledge-pickup`,
  );

  // Acknowledging on someone else's reservation must still be refused —
  // acknowledgePickup is loadOwned-gated like every other per-reservation
  // action, no exception for it (unlike the handoff step itself).
  const strangerAck = await acknowledgePickup(stranger, ownerReservation);
  expect(strangerAck.status, "only the laundry's real owner may acknowledge its pickup").toBe(403);

  const ackRes = await acknowledgePickup(owner, ownerReservation);
  expect(ackRes.status, "the real owner acknowledging pickup should succeed").toBeLessThan(400);

  const ownerStatusAfterAck = await myStatusHtml(owner);
  expect(ownerStatusAfterAck, "acknowledging should clear the pending-pickup notice").not.toContain(`Shelf ${spot}`);

  await cleanupReservation(baseUrl, next, nextReservation);
});

it("rejects a handoff with no unclaimed laundry waiting, and reuses a freed spot for an unrelated later handoff", async () => {
  const soleRoom = await identityCookie(baseUrl, uniqueRoom());
  const soleReservation = await join(baseUrl, soleRoom, MACHINE_ID);

  // The sole, front, waiting room on an otherwise-empty machine — there is
  // no done, unclaimed reservation for them to hand off here.
  const emptyAttempt = await handoff(soleRoom, MACHINE_ID);
  expect(emptyAttempt.status, "a handoff with nothing done and unclaimed on the machine should be rejected").toBe(404);

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

    const res = await handoff(mover, MACHINE_ID);
    expect(res.status, `round ${round}'s handoff should succeed while a spot is still free`).toBe(200);
    const { spot } = (await res.json()) as { spot: string };
    expect(spotsSeen.has(spot), `round ${round} should never reuse a spot still occupied by an earlier round`).toBe(false);
    spotsSeen.add(spot);
    rounds.push({ owner, ownerReservation });

    await cleanupReservation(baseUrl, mover, moverReservation);
  }

  expect(spotsSeen.size, "all six fixed spots should have been used across six rounds, with no duplicate").toBe(6);

  // A seventh handoff, while every spot is genuinely occupied, must be
  // rejected rather than silently reusing one that's still unacknowledged.
  const seventhOwner = await identityCookie(baseUrl, uniqueRoom());
  const seventhMover = await identityCookie(baseUrl, uniqueRoom());
  const seventhOwnerReservation = await join(baseUrl, seventhOwner, MACHINE_ID);
  await startAndFinish(seventhOwner, seventhOwnerReservation);
  const seventhMoverReservation = await join(baseUrl, seventhMover, MACHINE_ID);
  const fullPoolAttempt = await handoff(seventhMover, MACHINE_ID);
  expect(fullPoolAttempt.status, "a handoff with every fixed spot still occupied should be rejected").toBe(409);

  // Acknowledging one of the six frees exactly one spot, which the
  // still-pending seventh handoff can now use — confirms a freed spot is
  // actually detected, not just that a fresh database starts empty.
  const { owner: firstOwner, ownerReservation: firstOwnerReservation } = rounds[0];
  const freedAck = await acknowledgePickup(firstOwner, firstOwnerReservation);
  expect(freedAck.status, "acknowledging pickup should free that spot").toBeLessThan(400);

  const reuseAttempt = await handoff(seventhMover, MACHINE_ID);
  expect(reuseAttempt.status, "a handoff should succeed again once a spot was freed by acknowledgement").toBe(200);
  const { spot: reusedSpot } = (await reuseAttempt.json()) as { spot: string };
  expect(reusedSpot, "the freed spot should be the one reused, since it's the only one available").not.toBe("");

  await acknowledgePickup(seventhOwner, seventhOwnerReservation);
  await cleanupReservation(baseUrl, seventhMover, seventhMoverReservation);
  for (const { owner, ownerReservation } of rounds.slice(1)) {
    await acknowledgePickup(owner, ownerReservation);
  }
});
