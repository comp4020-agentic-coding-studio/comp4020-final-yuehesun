import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { machines, offers, reservations } from "./schema.ts";

// One SQLite file is the app's whole persistent state (ADR 0003). In
// production fly.toml will point DATABASE_PATH at the machine's volume
// (/data) so state survives a reload and a redeploy; locally it defaults to
// an untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — there's no
// separate machine to run them from (ADR 0003). Edit src/schema.ts,
// `pnpm db:generate`, commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007):
// the in-process harness (sim/, spec/fairness-properties.test.ts) points
// DATABASE_PATH at ":memory:" to run queue.ts against a fresh SQLite
// database with no file on disk — migrations and seeding below run
// exactly as they do for the real app, so the harness exercises the same
// schema, not a hand-rolled stand-in.
export const isInMemory = path === ":memory:";

// Clears reservations and offers between harness runs while keeping the
// seeded machines — cheaper than re-migrating a fresh database for every
// property-test run or every simulated day, and machines never change
// shape mid-run.
//
// reservations.offerId -> offers.id and offers.reservationId ->
// reservations.id form a reference cycle, so deleting either table first
// while the other still points at it trips SQLite's FK check (found by
// the property tests themselves, the first time they ran: fast-check's
// very first few random sequences created an offer, which was enough to
// make the cycle non-empty). Nulling reservations.offerId first breaks
// the cycle before either DELETE runs.
export function resetForHarness(): void {
  if (!isInMemory) {
    throw new Error("resetForHarness() only runs against an in-memory database — refusing to touch a real one");
  }
  db.update(reservations).set({ offerId: null }).run();
  db.delete(offers).run();
  db.delete(reservations).run();
}

const WASHER_COUNT = 8;
const DRYER_COUNT = 2;

seedMachinesIfEmpty();
convertLastTwoWashersToDryersIfNeeded();

// Crit 9 (plans/crit-9.md Stage 8): a fresh database seeds the final
// 8-washer/2-dryer split directly — convertLastTwoWashersToDryersIfNeeded
// below is only for a database that already ran crit 8's old 10-washer
// seed before dryers existed.
function seedMachinesIfEmpty(): void {
  if (db.select().from(machines).limit(1).all().length > 0) return;

  for (let i = 1; i <= WASHER_COUNT; i++) {
    db.insert(machines)
      .values({ label: `Washer ${i}`, type: "washer" })
      .run();
  }
  for (let i = 1; i <= DRYER_COUNT; i++) {
    db.insert(machines)
      .values({ label: `Dryer ${i}`, type: "dryer" })
      .run();
  }
}

// Crit 9 (plans/crit-9.md Stage 8): the live deployment already seeded 10
// washers under crit 8, before dryers existed — seedMachinesIfEmpty()
// above never runs again against a non-empty table, so a one-time,
// idempotent conversion is needed instead. Converts machines 9 and 10
// specifically, only if they're still washers (checked by label, so this
// is a no-op on every boot after the first). Left in place permanently
// rather than removed after one run — simpler than a one-shot migration
// script, and harmless to re-check on every boot.
function convertLastTwoWashersToDryersIfNeeded(): void {
  const oldWasher9 = db.select().from(machines).where(eq(machines.label, "Washer 9")).get();
  if (oldWasher9) {
    db.update(machines).set({ label: "Dryer 1", type: "dryer" }).where(eq(machines.id, oldWasher9.id)).run();
  }
  const oldWasher10 = db.select().from(machines).where(eq(machines.label, "Washer 10")).get();
  if (oldWasher10) {
    db.update(machines).set({ label: "Dryer 2", type: "dryer" }).where(eq(machines.id, oldWasher10.id)).run();
  }
}
