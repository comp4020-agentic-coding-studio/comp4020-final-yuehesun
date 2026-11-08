import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, expect, it } from "vitest";
import { claim, identityCookie, join, scan, uniqueRoom } from "./support/queue-client.ts";

// plans/laundry-dropoff-spot-confirm.md Stage 1: the regression for "I
// picked up and it asked me again". The rule: once anyone has moved the
// laundry out of a machine, the machine is empty. A machine can hold
// SEVERAL untouched `done` rows — owners who never pressed "collected",
// and rows left from before start() enforced an empty drum — and one
// pick-up used to handle only the newest, so the next stale row surfaced
// and kept the machine "full" (start() refused, the 3D room offered
// another pick-up).
//
// Those rows can't be built through the HTTP API any more (start() now
// refuses on a machine that still holds laundry), so this file runs its
// own server on its own port against a scratch database and inserts the
// legacy rows directly — never APP_URL, never .data/app.db (CLAUDE.md's
// test harness rules). Port 8096: ≥ 8090, not 8080, not restart.test.ts's
// 8091.
const PORT = 8096;
const BASE_URL = `http://localhost:${PORT}`;
const MACHINE_ID = 1;

let tmpDir: string;
let dbPath: string;
let proc: ChildProcess | undefined;

function startServer(): Promise<ChildProcess> {
  const child = spawn("node", ["src/server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: dbPath, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server didn't print 'listening' within 15s")), 15_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.on("error", reject);
  });
}

async function waitForPortFree(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(300) });
    } catch {
      return;
    }
    if (Date.now() >= deadline) throw new Error(`port ${port} is still answering after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(joinPath(tmpdir(), "laundry-stale-drum-spec-"));
  dbPath = joinPath(tmpDir, "app.db");
  proc = await startServer();
});

afterAll(async () => {
  // Always kill and confirm the port is free — also when a test failed.
  if (proc) {
    const child = proc;
    proc = undefined;
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.on("exit", () => resolve()));
  }
  await waitForPortFree(PORT);
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedStaleDoneRows(count: number): void {
  const db = new Database(dbPath);
  const insert = db.prepare(
    `INSERT INTO reservations (machine_id, person_name, washing_type, duration_minutes, joined_at, status)
     VALUES (?, ?, 'normal', 30, ?, 'done')`,
  );
  for (let i = 0; i < count; i++) insert.run(MACHINE_ID, `room${9000 + i}`, Date.now() - 100_000 + i);
  db.close();
}

async function machineState(cookie: string): Promise<{ unclaimedLaundry?: unknown } | undefined> {
  const res = await fetch(new URL("/laundry/machines-state", BASE_URL), { headers: { cookie } });
  const body = (await res.json()) as { machines: { id: number; unclaimedLaundry?: unknown }[] };
  return body.machines.find((m) => m.id === MACHINE_ID);
}

it("treats the machine as empty after one pick-up, even with several stale done rows on it", async () => {
  seedStaleDoneRows(3);

  const next = await identityCookie(BASE_URL, uniqueRoom());
  const reservation = await join(BASE_URL, next, MACHINE_ID);
  await scan(BASE_URL, next, MACHINE_ID);
  expect(await claim(BASE_URL, next, reservation), "claim is unconditional on the laundry").toBeLessThan(400);

  expect((await machineState(next))?.unclaimedLaundry, "stale laundry is on the machine before the pick-up").toBeTruthy();

  const startBefore = await fetch(new URL(`/reservations/${reservation}/start`, BASE_URL), {
    method: "POST",
    headers: { cookie: next },
    redirect: "manual",
  });
  expect(startBefore.status, "start is refused while laundry is in the drum").toBe(409);

  const pickup = await fetch(new URL(`/machines/${MACHINE_ID}/pickup`, BASE_URL), { method: "POST", headers: { cookie: next } });
  expect(pickup.status).toBe(200);

  expect(
    (await machineState(next))?.unclaimedLaundry,
    "one pick-up must empty the whole machine, not just the newest row",
  ).toBeUndefined();

  const second = await fetch(new URL(`/machines/${MACHINE_ID}/pickup`, BASE_URL), { method: "POST", headers: { cookie: next } });
  expect(second.status, "there is nothing left to pick up").toBe(404);

  const startAfter = await fetch(new URL(`/reservations/${reservation}/start`, BASE_URL), {
    method: "POST",
    headers: { cookie: next },
    redirect: "manual",
  });
  expect(startAfter.status, "starting must succeed after a single pick-up").toBeLessThan(400);
});
