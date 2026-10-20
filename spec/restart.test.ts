import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { claim, cleanupReservation, identityCookie, join, state, uniqueRoom } from "./support/queue-client.ts";

// Crit 10 extension, Stage 10 (plans/crit-10.md "Extension"; ADR 0008):
// state is already in SQLite on the volume (ADR 0003) — this tests that
// claim rather than assumes it, by running its own server on its own
// port against a temp database file, restarting the process on the same
// file, and checking every position and status survived. Never touches
// APP_URL or .data/app.db (CLAUDE.md's test harness rules).
const PORT = 8091;
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

async function stopServer(child: ChildProcess): Promise<void> {
  child.kill("SIGKILL");
  await new Promise<void>((resolve) => child.on("exit", () => resolve()));
}

// Confirms the port is actually free, not just that kill's exit code was
// 0 (CLAUDE.md's port discipline rule) — polls briefly since the OS can
// take a moment to release a just-killed process's listening socket.
async function waitForPortFree(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(300) });
    } catch {
      return; // connection refused (or timed out) = nothing's listening
    }
    if (Date.now() >= deadline) throw new Error(`port ${port} is still answering after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(joinPath(tmpdir(), "laundry-restart-spec-"));
  dbPath = joinPath(tmpDir, "app.db");
  proc = await startServer();
});

afterAll(async () => {
  if (proc) {
    await stopServer(proc);
    proc = undefined;
  }
  await waitForPortFree(PORT);
  rmSync(tmpDir, { recursive: true, force: true });
});

it("keeps every reservation's position and status across a server restart, on the same database", async () => {
  const roomA = uniqueRoom();
  const roomB = uniqueRoom();
  const cookieA = await identityCookie(BASE_URL, roomA);
  const cookieB = await identityCookie(BASE_URL, roomB);

  const reservationA = await join(BASE_URL, cookieA, MACHINE_ID);
  const reservationB = await join(BASE_URL, cookieB, MACHINE_ID);

  const claimStatus = await claim(BASE_URL, cookieA, reservationA);
  expect(claimStatus, "the front reservation should claim successfully before the restart").toBeLessThan(400);

  const before = await state(BASE_URL, MACHINE_ID);
  const beforeA = before.find((r) => r.reservationId === reservationA);
  const beforeB = before.find((r) => r.reservationId === reservationB);
  expect(beforeA?.status).toBe("claimed");
  expect(beforeB?.status).toBe("waiting");

  // Stop the server entirely, then restart it fresh against the same
  // database file — migrate() runs again at boot (src/db.ts), seeding is
  // a no-op against a non-empty machines table, and nothing else should
  // change.
  if (!proc) throw new Error("server wasn't running");
  await stopServer(proc);
  await waitForPortFree(PORT);
  proc = await startServer();

  const after = await state(BASE_URL, MACHINE_ID);
  const afterA = after.find((r) => r.reservationId === reservationA);
  const afterB = after.find((r) => r.reservationId === reservationB);

  expect(afterA, "reservation A should still exist after the restart").toBeTruthy();
  expect(afterB, "reservation B should still exist after the restart").toBeTruthy();
  expect(afterA?.status).toBe(beforeA?.status);
  expect(afterB?.status).toBe(beforeB?.status);
  expect(afterA?.position).toBe(beforeA?.position);
  expect(afterB?.position).toBe(beforeB?.position);

  await cleanupReservation(BASE_URL, cookieA, reservationA);
  await cleanupReservation(BASE_URL, cookieB, reservationB);
});
