import { expect } from "vitest";

// Thin client for crit 9 Stage 3's "earlier machine" offer
// (plans/crit-9.md), shared by offer.test.ts.

export interface Offer {
  id: number;
  machineLabel: string;
}

export async function claimAndStart(baseUrl: string, cookie: string, reservationId: number): Promise<void> {
  const claimRes = await fetch(new URL(`/reservations/${reservationId}/claim`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(claimRes.status, "claiming should succeed").toBeLessThan(400);

  const startRes = await fetch(new URL(`/reservations/${reservationId}/start`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(startRes.status, "starting should succeed").toBeLessThan(400);
}

export async function finish(baseUrl: string, cookie: string, reservationId: number): Promise<void> {
  const res = await fetch(new URL(`/reservations/${reservationId}/finish`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(res.status, "ending the wash early should succeed").toBeLessThan(400);
}

// The offer only appears once the realtime tick (plans/crit-9.md Stage 1)
// notices the machine went idle and runs the eligibility algorithm — not
// instantly on finish(). Polls /my-status rather than sleeping a fixed
// guess, since the tick interval is an implementation detail this test
// shouldn't need to know.
export async function waitForOffer(baseUrl: string, cookie: string, timeoutMs = 5000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(new URL("/my-status", baseUrl), { headers: { cookie } });
    const html = await res.text();
    const match = html.match(/\/offers\/(\d+)\/accept/);
    if (match) return Number(match[1]);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("no offer appeared within the timeout");
}

export async function acceptOffer(baseUrl: string, cookie: string, offerId: number): Promise<number> {
  const res = await fetch(new URL(`/offers/${offerId}/accept`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  return res.status;
}

export async function declineOffer(baseUrl: string, cookie: string, offerId: number): Promise<number> {
  const res = await fetch(new URL(`/offers/${offerId}/decline`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  return res.status;
}
