import { expect, inject, it } from "vitest";
import { cleanupReservation, identityCookie, state, uniqueRoom } from "./support/queue-client.ts";

// Crit 10 extension, Stage 10 (plans/crit-10.md "Extension"; ADR 0008):
// simultaneous joins, a doubled claim, and the join-dedup window, all
// against the real running app over HTTP. Uses its own machine (3),
// separate from every other spec file's machines (1, 2, 4-8), so a
// burst of 20 simultaneous joins here can't interfere with another
// file's queue and vice versa.
const baseUrl = inject("baseUrl");
const MACHINE_ID = 3;

async function rawJoin(cookie: string, washingType = "normal"): Promise<Response> {
  return fetch(new URL(`/machines/${MACHINE_ID}/reservations`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: `washingType=${washingType}`,
    redirect: "manual",
  });
}

function reservationIdFromLocation(res: Response): number {
  const location = res.headers.get("location") ?? "";
  const id = Number(location.match(/\/reservations\/(\d+)/)?.[1]);
  if (!Number.isFinite(id)) throw new Error(`couldn't find a reservation id in Location "${location}"`);
  return id;
}

it("gives 20 simultaneous joins on one idle machine positions exactly 1..20, no gaps or duplicates", async () => {
  const cookies = await Promise.all(Array.from({ length: 20 }, () => identityCookie(baseUrl, uniqueRoom())));

  // ADR 0008's own claim: better-sqlite3 is synchronous and every
  // check-then-write in queue.ts runs with no await in between, so 20
  // requests racing on Node's event loop still can't interleave inside
  // one queue operation. Promise.all is what actually races them, not a
  // simulated race.
  const results = await Promise.all(cookies.map((cookie) => rawJoin(cookie)));
  const reservationIds = results.map(reservationIdFromLocation);

  const rows = await state(baseUrl, MACHINE_ID);
  const ours = rows.filter((r) => reservationIds.includes(r.reservationId));
  expect(ours.length, "all 20 joins should have created distinct reservations").toBe(20);

  const positions = ours.map((r) => r.position).toSorted((a, b) => a - b);
  // Positions among *our* 20 rows should be a contiguous run (no gaps, no
  // duplicates) — not necessarily literally 1..20, since another spec
  // file could in principle run concurrently against a shared app
  // (fileParallelism is off, so in practice this machine starts empty,
  // but the assertion only depends on contiguity + uniqueness either way).
  const first = positions[0];
  expect(positions).toEqual(Array.from({ length: 20 }, (_, i) => first + i));
  expect(new Set(positions).size, "no two of our reservations should share a position").toBe(20);
  expect(ours.filter((r) => r.position === first).length, "exactly one of the 20 should be at the front").toBe(1);

  for (let i = 0; i < cookies.length; i++) {
    await cleanupReservation(baseUrl, cookies[i], reservationIds[i]);
  }
});

it("lets only one of two simultaneous claims from the front room succeed", async () => {
  const front = await identityCookie(baseUrl, uniqueRoom());
  const joinRes = await rawJoin(front);
  const reservationId = reservationIdFromLocation(joinRes);

  const claim = () =>
    fetch(new URL(`/reservations/${reservationId}/claim`, baseUrl), {
      method: "POST",
      headers: { cookie: front },
      redirect: "manual",
    });

  const [first, second] = await Promise.all([claim(), claim()]);
  const statuses = [first.status, second.status].toSorted((a, b) => a - b);
  expect(statuses, "exactly one of two simultaneous claims should succeed, the other a 409").toEqual([303, 409]);

  await cleanupReservation(baseUrl, front, reservationId);
});

it("treats a repeated join (same room, machine, washing type) inside the dedup window as the same request", async () => {
  const room = await identityCookie(baseUrl, uniqueRoom());

  const [first, second] = await Promise.all([rawJoin(room), rawJoin(room)]);
  expect(first.status, "both responses should succeed").toBeLessThan(400);
  expect(second.status, "both responses should succeed").toBeLessThan(400);

  const firstId = reservationIdFromLocation(first);
  const secondId = reservationIdFromLocation(second);
  expect(secondId, "a near-simultaneous repeat join should point at the same reservation, not create a second one").toBe(
    firstId,
  );

  const rows = await state(baseUrl, MACHINE_ID);
  const ours = rows.filter((r) => r.reservationId === firstId);
  expect(ours.length).toBe(1);

  await cleanupReservation(baseUrl, room, firstId);
});
