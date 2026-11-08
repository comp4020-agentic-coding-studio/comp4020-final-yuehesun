import { expect, inject, it } from "vitest";
import { claim, cleanupReservation, identityCookie, join, scan, state, uniqueRoom } from "./support/queue-client.ts";

// Crit 8 Stage 1 contract: plans/crit-8.md. Uses machine 1 — kept separate
// from queue-order.test.ts's machine so the two files can't interfere with
// each other's queue.
const baseUrl = inject("baseUrl");
const MACHINE_ID = 1;

it("never lets a machine have two active (claimed/running) reservations at once", async () => {
  const alice = await identityCookie(baseUrl, uniqueRoom());
  const bob = await identityCookie(baseUrl, uniqueRoom());

  const aliceReservation = await join(baseUrl, alice, MACHINE_ID);
  const bobReservation = await join(baseUrl, bob, MACHINE_ID);

  // plans/laundry-scan-gated-claim.md: both scan before either claims —
  // claim()'s scan check runs only after its front-of-queue check, so an
  // unscanned claim would already be rejected by the ordering check
  // first, and this test wouldn't actually be exercising the "at most one
  // claim succeeds" mutual-exclusion rule it means to test.
  await scan(baseUrl, alice, MACHINE_ID);
  await scan(baseUrl, bob, MACHINE_ID);

  // Whichever of these two actually reached the front of the queue, at
  // most one claim can succeed — this holds whether or not the machine
  // already had a queue before this test ran.
  await claim(baseUrl, alice, aliceReservation);
  await claim(baseUrl, bob, bobReservation);

  const rows = await state(baseUrl, MACHINE_ID);
  const ours = new Set([aliceReservation, bobReservation]);
  const activeOfOurs = rows.filter((r) => ours.has(r.reservationId) && (r.status === "claimed" || r.status === "running"));
  expect(activeOfOurs.length, "two reservations we just created both ended up active").toBeLessThanOrEqual(1);

  await cleanupReservation(baseUrl, alice, aliceReservation);
  await cleanupReservation(baseUrl, bob, bobReservation);
});
