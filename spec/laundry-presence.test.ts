import { expect, inject, it } from "vitest";
import { identityCookie, uniqueRoom } from "./support/queue-client.ts";
import { readFramesUntil } from "./support/sse-client.ts";

// plans/laundry-presence.md Stage 1: src/presence.ts's server-side
// behaviour, against the real running app over HTTP — report/broadcast/
// leave/stale-cleanup. No browser/Playwright needed here; Stage 2's
// client-rendering logic is verified separately, by hand, against a
// running dev server.
const baseUrl = inject("baseUrl");

function randomTabId(): string {
  return `test-tab-${Math.random().toString(36).slice(2)}`;
}

async function reportPresence(cookie: string, tabId: string, x: number, z: number, yaw: number, moving = false): Promise<Response> {
  return fetch(new URL("/laundry/presence", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ tabId, x, z, yaw, moving }),
  });
}

async function leavePresence(tabId: string): Promise<Response> {
  return fetch(new URL("/laundry/presence/leave", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tabId }),
  });
}

interface PresenceRecordWire {
  tabId: string;
  identity: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  lastSeenMs: number;
}

// Opens a presence stream and waits for the first broadcast whose
// decoded payload satisfies `until` — the broadcast tick runs on its own
// 250ms cadence (src/presence.ts's BROADCAST_MS) independent of when a
// report arrives, so a test always has to wait for *a* subsequent tick,
// never assume the very next frame reflects a report made moments ago.
async function waitForBroadcast(cookie: string, until: (records: PresenceRecordWire[]) => boolean, timeoutMs = 3000): Promise<PresenceRecordWire[]> {
  const res = await fetch(new URL("/laundry/presence-stream", baseUrl), { headers: { cookie } });
  expect(res.status).toBe(200);
  let latest: PresenceRecordWire[] = [];
  await readFramesUntil(
    res,
    (frame) => {
      if (frame.event !== "positions") return false;
      latest = JSON.parse(frame.data) as PresenceRecordWire[];
      return until(latest);
    },
    timeoutMs,
  );
  return latest;
}

it("rejects a report and a stream request from a browser with no identity cookie", async () => {
  const reportRes = await fetch(new URL("/laundry/presence", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tabId: randomTabId(), x: 0, z: 0, yaw: 0, moving: false }),
  });
  expect(reportRes.status).toBe(400);

  const streamRes = await fetch(new URL("/laundry/presence-stream", baseUrl));
  expect(streamRes.status).toBe(400);
});

it("rejects a malformed report body", async () => {
  const cookie = await identityCookie(baseUrl, uniqueRoom());
  const res = await fetch(new URL("/laundry/presence", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ tabId: randomTabId(), x: "not a number", z: 0, yaw: 0 }),
  });
  expect(res.status).toBe(400);
});

it("broadcasts two different tabs' reports, each carrying its own identity", async () => {
  const roomA = uniqueRoom();
  const roomB = uniqueRoom();
  const cookieA = await identityCookie(baseUrl, roomA);
  const cookieB = await identityCookie(baseUrl, roomB);
  const tabA = randomTabId();
  const tabB = randomTabId();

  const reportA = await reportPresence(cookieA, tabA, 1.5, -2.5, 0.3, true);
  expect(reportA.status).toBe(204);
  const reportB = await reportPresence(cookieB, tabB, -3, 4, 1.2, false);
  expect(reportB.status).toBe(204);

  const records = await waitForBroadcast(cookieA, (recs) => recs.some((r) => r.tabId === tabA) && recs.some((r) => r.tabId === tabB));

  const recA = records.find((r) => r.tabId === tabA);
  const recB = records.find((r) => r.tabId === tabB);
  expect(recA).toMatchObject({ identity: roomA, x: 1.5, z: -2.5, yaw: 0.3, moving: true });
  expect(recB).toMatchObject({ identity: roomB, x: -3, z: 4, yaw: 1.2, moving: false });
});

it("two tabs under the same room number both appear, independently", async () => {
  const room = uniqueRoom();
  const cookie = await identityCookie(baseUrl, room);
  const tab1 = randomTabId();
  const tab2 = randomTabId();

  await reportPresence(cookie, tab1, 0, 0, 0);
  await reportPresence(cookie, tab2, 5, 5, 0);

  const records = await waitForBroadcast(cookie, (recs) => recs.some((r) => r.tabId === tab1) && recs.some((r) => r.tabId === tab2));
  expect(records.filter((r) => r.identity === room).length).toBeGreaterThanOrEqual(2);
});

it("an explicit leave removes a tab from the next broadcast", async () => {
  const cookie = await identityCookie(baseUrl, uniqueRoom());
  const tabId = randomTabId();

  await reportPresence(cookie, tabId, 0, 0, 0);
  await waitForBroadcast(cookie, (recs) => recs.some((r) => r.tabId === tabId));

  const leaveRes = await leavePresence(tabId);
  expect(leaveRes.status).toBe(204);

  const afterLeave = await waitForBroadcast(cookie, (recs) => !recs.some((r) => r.tabId === tabId));
  expect(afterLeave.some((r) => r.tabId === tabId)).toBe(false);
});

// src/presence.ts's own STALE_MS (5000ms) — no way to reach it from this
// test process, which drives the real server over HTTP rather than
// sharing its process (unlike sim/'s own virtual-clock seam, which only
// ever runs in-process against an in-memory database per CLAUDE.md's
// test-harness rules). Waiting out the real interval is the simplest
// correct option, consistent with this project's own precedent of a
// real multi-minute wait elsewhere in its spec suite for a claim-window
// verification (see HANDOFF.md).
it(
  "a record with no report for longer than STALE_MS is dropped even without an explicit leave",
  async () => {
    const cookie = await identityCookie(baseUrl, uniqueRoom());
    const tabId = randomTabId();

    await reportPresence(cookie, tabId, 0, 0, 0);
    await waitForBroadcast(cookie, (recs) => recs.some((r) => r.tabId === tabId));

    await new Promise((resolve) => setTimeout(resolve, 5_200));

    const afterStale = await waitForBroadcast(cookie, (recs) => !recs.some((r) => r.tabId === tabId), 3000);
    expect(afterStale.some((r) => r.tabId === tabId)).toBe(false);
  },
  10_000,
);
