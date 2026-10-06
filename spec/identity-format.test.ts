import { expect, inject, it } from "vitest";
import { uniqueRoom } from "./support/queue-client.ts";

// ADR 0004: identity is a room number only, as roomXXX (1-4 digits) — a
// name isn't unique enough to key the fairness rule and reservation
// ownership on, and an unbounded digit count once let a test run's
// 14-digit timestamp-shaped identities slip onto the live site.
const baseUrl = inject("baseUrl");

it("rejects an identity that isn't a room number", async () => {
  const res = await fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "room=Alice",
    redirect: "manual",
  });
  expect(res.status).toBe(400);
  expect(res.headers.get("set-cookie")).toBeNull();
});

it("rejects a room number shaped like a timestamp, not a real room", async () => {
  const res = await fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `room=room${Date.now()}`, // 13 digits — well past the 4-digit cap
    redirect: "manual",
  });
  expect(res.status).toBe(400);
  expect(res.headers.get("set-cookie")).toBeNull();
});

it("accepts a room number in roomXXX format", async () => {
  const res = await fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `room=${uniqueRoom()}`,
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("set-cookie")).toMatch(/^person=room\d{1,4}\b/);
});

it("accepts a bare number and prepends room", async () => {
  const res = await fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "room=304",
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("set-cookie")).toMatch(/^person=room304\b/);
});
