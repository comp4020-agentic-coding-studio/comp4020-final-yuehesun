import { expect, inject, it } from "vitest";
import { scanUrlFor } from "../src/qr.ts";
import { claim, cleanupReservation, identityCookie, join, uniqueRoom } from "./support/queue-client.ts";

// plans/3d-walkthrough.md Stage 3 built GET /laundry/scan/:id's three
// branches (claim-confirm, fresh reservation, read-only) as a dedicated
// page; Stage 10 (user feedback) changed where an *already-identified*
// scanner lands — straight to the real home page, not that dedicated
// page — so most of what this file checks now is "the redirect actually
// happens," not the old page's own HTML content. The logged-out case
// (scanIdentityPage, POST /identity's own redirect field) is unchanged
// and still checked the same way. Uses machine 9 (a dryer), kept separate
// from every other spec file's machines (1, 2, 3, 4-6, 7-8 are all
// claimed by other files — see each file's own comment), so this file's
// own reservations can't interfere with theirs and vice versa.
const baseUrl = inject("baseUrl");
const MACHINE_ID = 9; // a dryer — plan.md: any machine type works here, this one's simply unclaimed by every other spec file
const OTHER_MACHINE_ID = 10; // a second, otherwise-unused dryer, for the "machine held by someone else" case

async function qrcodePng(machineId: number): Promise<Response> {
  return fetch(new URL(`/machines/${machineId}/qrcode.png`, baseUrl));
}

async function scanPage(cookie: string | undefined, machineId: number, roomQuery?: string): Promise<Response> {
  const url = new URL(`/laundry/scan/${machineId}`, baseUrl);
  if (roomQuery !== undefined) url.searchParams.set("room", roomQuery);
  return fetch(url, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
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

// docs/adr/0012's addendum: the 3D room's own identity cookie rides along
// in the QR payload as ?room=, so a scanning phone's identity form can be
// prefilled instead of asking the same person to retype a number they
// already typed once on the desktop session showing them this code.
it("scanUrlFor carries the identity as ?room= only when one is given", () => {
  const withIdentity = scanUrlFor("http://example.test", 9, "room304");
  expect(withIdentity.toString()).toBe("http://example.test/laundry/scan/9?room=room304");

  const noIdentity = scanUrlFor("http://example.test", 9, undefined);
  expect(noIdentity.toString()).toBe("http://example.test/laundry/scan/9");
});

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

it("prefills the identity form's room field from a valid ?room= query, but still requires pressing Continue", async () => {
  const res = await scanPage(undefined, MACHINE_ID, "room411");
  expect(res.status, "a prefilled scan is still just the identity form, not an auto-redirect").toBe(200);
  const html = await res.text();
  expect(html).toContain('name="room" value="room411"');
  // The redirect field (back to this machine's scan URL) still has to be
  // present too — prefilling the room shouldn't drop the existing
  // "come back here once identified" behaviour.
  expect(html).toContain(`name="redirect" value="/laundry/scan/${MACHINE_ID}"`);
});

it("ignores a malformed or hostile ?room= query instead of prefilling it", async () => {
  const res = await scanPage(undefined, MACHINE_ID, '"><script>alert(1)</script>');
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain('name="room" value=""');
  expect(html).not.toContain("<script>alert(1)</script>");
});

it("leaves the room field blank with no ?room= query, same as before this feature existed", async () => {
  const res = await scanPage(undefined, MACHINE_ID);
  const html = await res.text();
  expect(html).toContain('name="room" value=""');
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

it("redirects an already-identified scanner straight to the real home page, for an idle machine", async () => {
  const room = await identityCookie(baseUrl, uniqueRoom());

  const idleRes = await scanPage(room, MACHINE_ID);
  expect(idleRes.status, "an already-identified scan should redirect, not render a page of its own").toBe(303);
  expect(idleRes.headers.get("location"), "should land on the real home page").toBe("/");
});

it("redirects an already-identified scanner to the real home page even when the machine is held by someone else", async () => {
  const owner = await identityCookie(baseUrl, uniqueRoom());
  const stranger = await identityCookie(baseUrl, uniqueRoom());

  // claimAndStart this test's own reservation so it's unambiguously the
  // *front*, claimed reservation on this machine regardless of whatever
  // else might already be queued on OTHER_MACHINE_ID (this file's own
  // reservations are cleaned up after each test, but a shared machine id
  // across a whole spec run is still safest treated as "something else
  // might already be there," not assumed empty).
  const reservationId = await join(baseUrl, owner, OTHER_MACHINE_ID);
  // plans/laundry-scan-gated-claim.md: this file's own scanPage() helper
  // already hits the real GET /laundry/scan/:id route — reused directly
  // rather than importing a second scan helper, since it's the same real
  // request either way.
  await scanPage(owner, OTHER_MACHINE_ID);
  const claimStatus = await claim(baseUrl, owner, reservationId);
  expect(claimStatus, "the owner's own claim should succeed, to put this reservation in an unambiguous non-waiting state").toBeLessThan(400);

  const strangerView = await scanPage(stranger, OTHER_MACHINE_ID);
  // The scan route itself carries no per-machine knowledge once identity
  // is known — the machine still having to exist (404 for a bad id) is
  // the only branch left on this route; which state the machine is in is
  // entirely the real home page's own business once redirected there.
  expect(strangerView.status, "a stranger scanning a held machine should still just redirect home").toBe(303);
  expect(strangerView.headers.get("location")).toBe("/");

  await cleanupReservation(baseUrl, owner, reservationId);
});

it("404s for a nonexistent machine even when already identified", async () => {
  const room = await identityCookie(baseUrl, uniqueRoom());
  const res = await scanPage(room, 999_999);
  expect(res.status).toBe(404);
});
