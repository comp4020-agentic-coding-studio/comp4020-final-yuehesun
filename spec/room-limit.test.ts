import { expect, inject, it } from "vitest";
import { cleanupReservation, identityCookie, join, uniqueRoom } from "./support/queue-client.ts";

// plan.md: a room can hold at most two active reservations per machine
// type at once — enough to wash darks and lights separately, not enough
// to tie up every washer. Uses machines 4-6, kept separate from the other
// spec files' machines (1 and 2) so queues can't interfere.
const baseUrl = inject("baseUrl");
const [MACHINE_A, MACHINE_B, MACHINE_C] = [4, 5, 6];

it("lets a room hold two active reservations of one type, but not a third", async () => {
  const room = await identityCookie(baseUrl, uniqueRoom());

  const first = await join(baseUrl, room, MACHINE_A);
  const second = await join(baseUrl, room, MACHINE_B);

  const res = await fetch(new URL(`/machines/${MACHINE_C}/reservations`, baseUrl), {
    method: "POST",
    headers: { cookie: room, "content-type": "application/x-www-form-urlencoded" },
    body: "washingType=normal",
    redirect: "manual",
  });
  expect(res.status, "a third reservation of the same type should be refused").toBe(409);

  await cleanupReservation(baseUrl, room, first);
  await cleanupReservation(baseUrl, room, second);
});
