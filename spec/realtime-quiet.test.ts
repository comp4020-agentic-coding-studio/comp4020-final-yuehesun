import { expect, inject, it } from "vitest";
import { cleanupReservation, identityCookie, join, uniqueRoom } from "./support/queue-client.ts";

// Regression for a real report on the deployed app: the Claim notice flashed
// and vanished. A dryer queued behind a wash that hasn't started has an
// estimate built on "now", which changed the realtime digest on every tick, so
// the server broadcast "changed" twice a second forever and every open home
// page re-rendered. A queue nobody is acting on must stay quiet.
const baseUrl = inject("baseUrl");
const WASHER = 7;

async function countChanged(ms: number): Promise<number> {
  const controller = new AbortController();
  const res = await fetch(new URL("/events", baseUrl), { signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let count = 0;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      count += (decoder.decode(value).match(/event: *changed/g) ?? []).length;
    }
  } catch {
    // aborted: the counting window is over
  }
  clearTimeout(timer);
  return count;
}

it("doesn't broadcast changes while a dryer waits on a wash that hasn't started", async () => {
  const cookie = await identityCookie(baseUrl, uniqueRoom());
  const wash = await join(baseUrl, cookie, WASHER);
  const queued = await fetch(new URL(`/reservations/${wash}/queue-dryer`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: "dryingType=test",
    redirect: "manual",
  });
  expect(queued.status, "queueing the dryer should succeed").toBeLessThan(400);

  await new Promise((r) => setTimeout(r, 1200)); // let the real changes above broadcast
  const changes = await countChanged(2500);
  expect(changes, "a queue nobody is acting on must not keep broadcasting").toBeLessThanOrEqual(1);

  await cleanupReservation(baseUrl, cookie, wash);
});
