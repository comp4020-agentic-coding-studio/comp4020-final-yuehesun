import { expect, inject, it } from "vitest";

// ADR 0004: identity is a room number only, as roomXXX — a name isn't
// unique enough to key the fairness rule and reservation ownership on.
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

it("accepts a room number in roomXXX format", async () => {
  const res = await fetch(new URL("/identity", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `room=room${Date.now()}`,
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  expect(res.headers.get("set-cookie")).toMatch(/^person=room\d+/);
});
