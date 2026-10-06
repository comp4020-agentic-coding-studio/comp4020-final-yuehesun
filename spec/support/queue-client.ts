import { expect } from "vitest";

// Thin client for the crit 8 wire contract in plans/crit-8.md, shared by
// queue-fairness.test.ts and queue-order.test.ts.

export interface ReservationState {
  reservationId: number;
  person: string;
  status: string;
  position: number;
}

// ADR 0004: identity is a room number only, as roomXXX.
let roomCounter = 0;

export function uniqueRoom(): string {
  roomCounter += 1;
  return `room${Date.now()}${roomCounter}`;
}

export async function identityCookie(baseUrl: string, room: string): Promise<string> {
  const res = await fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `room=${encodeURIComponent(room)}`,
    redirect: "manual",
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`POST /identity didn't set a cookie for "${room}"`);
  return cookie.split(";")[0];
}

export async function join(baseUrl: string, cookie: string, machineId: number): Promise<number> {
  const res = await fetch(new URL(`/machines/${machineId}/reservations`, baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: "washingType=normal",
    redirect: "manual",
  });
  expect(res.status, "joining a machine's queue should succeed").toBeLessThan(400);
  const location = res.headers.get("location") ?? "";
  const id = Number(location.match(/\/reservations\/(\d+)/)?.[1]);
  if (!Number.isFinite(id)) {
    throw new Error(`couldn't find the new reservation's id in Location "${location}"`);
  }
  return id;
}

export async function claim(baseUrl: string, cookie: string, reservationId: number): Promise<number> {
  const res = await fetch(new URL(`/reservations/${reservationId}/claim`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  return res.status;
}

export async function cancel(baseUrl: string, cookie: string, reservationId: number): Promise<void> {
  const res = await fetch(new URL(`/reservations/${reservationId}/cancel`, baseUrl), {
    method: "POST",
    headers: { cookie },
    redirect: "manual",
  });
  expect(res.status, "cancelling a reservation should succeed").toBeLessThan(400);
}

export async function state(baseUrl: string, machineId: number): Promise<ReservationState[]> {
  const res = await fetch(new URL(`/machines/${machineId}/state`, baseUrl));
  expect(res.status).toBe(200);
  return res.json();
}
