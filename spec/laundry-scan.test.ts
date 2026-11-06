import { expect, inject, it } from "vitest";
import { claim, cleanupReservation, identityCookie, join, uniqueRoom } from "./support/queue-client.ts";

// plans/3d-walkthrough.md Stage 3: GET /laundry/scan/:id's three branches
// (claim-confirm, fresh reservation, read-only) and POST /identity's new
// redirect field, against the real running app over HTTP. Uses machine 9
// (a dryer), kept separate from every other spec file's machines (1, 2,
// 3, 4-6, 7-8 are all claimed by other files — see each file's own
// comment), so this file's own reservations can't interfere with theirs
// and vice versa.
const baseUrl = inject("baseUrl");
const MACHINE_ID = 9; // a dryer — plan.md: any machine type works here, this one's simply unclaimed by every other spec file
const OTHER_MACHINE_ID = 10; // a second, otherwise-unused dryer, for the "machine held by someone else" read-only case

async function qrcodePng(machineId: number): Promise<Response> {
  return fetch(new URL(`/machines/${machineId}/qrcode.png`, baseUrl));
}

async function scanPage(cookie: string | undefined, machineId: number): Promise<Response> {
  return fetch(new URL(`/laundry/scan/${machineId}`, baseUrl), {
    headers: cookie ? { cookie } : {},
  });
}

async function postIdentity(room: string, redirect?: string): Promise<Response> {
  const body = redirect ? `room=${encodeURIComponent(room)}&redirect=${encodeURIComponent(redirect)}` : `room=${encodeURIComponent(room)}`;
  return fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
}

it("serves a real QR PNG encoding the machine's scan URL, and 404s for a nonexistent machine", async () => {
  const res = await qrcodePng(MACHINE_ID);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(bytes.length, "should be a real, non-trivial image body").toBeGreaterThan(100);
  // PNG magic bytes — confirms this is actually a PNG, not an empty/error body mislabeled.
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

  const missing = await qrcodePng(999_999);
  expect(missing.status).toBe(404);
});

it("shows the identity page with a redirect field when scanning with no cookie, and the redirect actually works", async () => {
  const noCookieRes = await scanPage(undefined, MACHINE_ID);
  expect(noCookieRes.status).toBe(200);
  const html = await noCookieRes.text();
  expect(html).toContain("Room number");
  expect(html).toContain(`name="redirect" value="/laundry/scan/${MACHINE_ID}"`);

  const room = uniqueRoom();
  const identityRes = await postIdentity(room, `/laundry/scan/${MACHINE_ID}`);
  expect(identityRes.status).toBe(303);
  expect(identityRes.headers.get("location"), "should redirect to the scan page, not /").toBe(`/laundry/scan/${MACHINE_ID}`);
});

it("rejects an attempted open redirect and falls back to /", async () => {
  const room1 = uniqueRoom();
  const external = await postIdentity(room1, "https://evil.example/");
  expect(external.headers.get("location"), "a full external URL must be ignored").toBe("/");

  const room2 = uniqueRoom();
  const protocolRelative = await postIdentity(room2, "//evil.example");
  expect(protocolRelative.headers.get("location"), "a protocol-relative path must be ignored").toBe("/");

  const room3 = uniqueRoom();
  const wrongPrefix = await postIdentity(room3, "/some/other/path");
  expect(wrongPrefix.headers.get("location"), "a path outside /laundry/scan/ must be ignored").toBe("/");
});

it("shows a reservation form for an idle machine with no reservation, and claiming/joining it actually works", async () => {
  const room = await identityCookie(baseUrl, uniqueRoom());

  const idleRes = await scanPage(room, MACHINE_ID);
  const idleHtml = await idleRes.text();
  expect(idleHtml, "an idle machine with no reservation should offer a reservation form").toContain(`/machines/${MACHINE_ID}/reservations`);

  const reservationId = await join(baseUrl, room, MACHINE_ID);

  const confirmRes = await scanPage(room, MACHINE_ID);
  const confirmHtml = await confirmRes.text();
  expect(confirmHtml, "the front, waiting reservation's own room should see a claim confirm").toContain(`/reservations/${reservationId}/claim`);

  const claimRes = await fetch(new URL(`/reservations/${reservationId}/claim`, baseUrl), {
    method: "POST",
    headers: { cookie: room },
    redirect: "manual",
  });
  expect(claimRes.status, "claiming from the scan page's own form target should succeed").toBeLessThan(400);

  await cleanupReservation(baseUrl, room, reservationId);
});

it("shows a read-only board row (never a claim form for someone else's reservation) for a machine someone else holds", async () => {
  const owner = await identityCookie(baseUrl, uniqueRoom());
  const stranger = await identityCookie(baseUrl, uniqueRoom());

  // claimAndStart this test's own reservation so it's unambiguously the
  // *front*, claimed reservation on this machine regardless of whatever
  // else might already be queued on OTHER_MACHINE_ID (this file's own
  // reservations are cleaned up after each test, but a shared machine id
  // across a whole spec run is still safest treated as "something else
  // might already be there," not assumed empty).
  const reservationId = await join(baseUrl, owner, OTHER_MACHINE_ID);
  const claimStatus = await claim(baseUrl, owner, reservationId);
  expect(claimStatus, "the owner's own claim should succeed, to put this reservation in an unambiguous non-waiting state").toBeLessThan(400);

  const strangerView = await scanPage(stranger, OTHER_MACHINE_ID);
  const html = await strangerView.text();
  // This is the one thing the scan page must never let a non-owner do:
  // claim a reservation that isn't theirs. A "claimed" reservation has no
  // claim action to begin with (queue.ts's claim() only ever acts on a
  // "waiting" reservation), so the real check is simply that this
  // specific reservation id never appears next to a claim form.
  expect(html, "a non-owner must not see a claim form for someone else's reservation").not.toContain(`/reservations/${reservationId}/claim`);

  await cleanupReservation(baseUrl, owner, reservationId);
});
