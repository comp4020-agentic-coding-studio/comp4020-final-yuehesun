import { expect, inject, it } from "vitest";
import { cancel, identityCookie, join, state, type ReservationState } from "./support/queue-client.ts";

// Crit 8 Stage 1 contract: plans/crit-8.md. Uses machine 2 — kept separate
// from queue-fairness.test.ts's machine. Compares positions before/after
// relative to each other, not absolute values, so this doesn't depend on
// the machine's queue being empty when the test starts.
const baseUrl = inject("baseUrl");
const MACHINE_ID = 2;

function positionOf(rows: ReservationState[], reservationId: number): number {
  const row = rows.find((r) => r.reservationId === reservationId);
  if (!row) throw new Error(`reservation ${reservationId} not found in /machines/${MACHINE_ID}/state`);
  return row.position;
}

it("keeps queue position in join order, and bumps everyone up one when the front cancels", async () => {
  const alice = await identityCookie(baseUrl, `alice-${Date.now()}`);
  const bob = await identityCookie(baseUrl, `bob-${Date.now()}`);
  const carol = await identityCookie(baseUrl, `carol-${Date.now()}`);

  const aliceReservation = await join(baseUrl, alice, MACHINE_ID);
  const bobReservation = await join(baseUrl, bob, MACHINE_ID);
  const carolReservation = await join(baseUrl, carol, MACHINE_ID);

  const before = await state(baseUrl, MACHINE_ID);
  expect(positionOf(before, aliceReservation)).toBeLessThan(positionOf(before, bobReservation));
  expect(positionOf(before, bobReservation)).toBeLessThan(positionOf(before, carolReservation));

  await cancel(baseUrl, alice, aliceReservation);

  const after = await state(baseUrl, MACHINE_ID);
  expect(positionOf(after, bobReservation)).toBe(positionOf(before, bobReservation) - 1);
  expect(positionOf(after, carolReservation)).toBe(positionOf(before, carolReservation) - 1);
});
