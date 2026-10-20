// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007): one
// harness, used twice — spec/fairness-properties.test.ts's property tests,
// and scripts/simulate.ts's fairness comparison (Stage 13). It drives the
// real src/queue.ts functions against a fresh in-memory database and a
// forward-only virtual clock; nothing here re-implements a queue rule
// (ADR 0007's rejected "option 4" — a second copy of the rules could pass
// while the real ones are wrong).
//
// DATABASE_PATH must be set to ":memory:" *before* src/db.ts is first
// imported (it opens the database at module load time) — createHarness()
// below does that via a dynamic import, so a static `import` anywhere else
// in this file would be too late.
import { VirtualClock } from "./virtual-clock.ts";

export type MissedWindowPolicy = "wait-forever" | "eject" | "move-back-one";

export interface HarnessMachine {
  id: number;
  label: string;
  type: "washer" | "dryer";
}

export interface HarnessOptions {
  /** ms since epoch the virtual clock starts at. Defaults to a fixed,
   * readable instant so results are reproducible independent of wall time. */
  startMs?: number;
  /** Mutes every logged line from queue.ts during the run (Stage 9's log
   * "sink switch") — hundreds of property-test runs would otherwise flood
   * the test runner's own output with lines nobody is narrating from. */
  silent?: boolean;
}

export interface Harness {
  clock: VirtualClock;
  machines: HarnessMachine[];
  queue: typeof import("../src/queue.ts");
  db: typeof import("../src/db.ts")["db"];
  schema: typeof import("../src/schema.ts");
  /** Moves the virtual clock forward, then runs settleMachine for every
   * machine and processOffers once — the same work the realtime tick
   * (src/realtime.ts) does on a timer, but driven explicitly so a test
   * can advance exactly N minutes and then inspect state. */
  advanceMinutes(minutes: number): void;
  /** All reservations currently in the database, for invariant checks. */
  allReservations(): import("../src/schema.ts").Reservation[];
  /** All offers currently in the database, for invariant checks. */
  allOffers(): import("../src/schema.ts").Offer[];
  /** Resets reservations/offers (keeps the seeded machines) so a fresh
   * property-test run, or a fresh simulated day, starts clean without
   * reopening the database. */
  reset(): void;
}

// Each call creates its own in-memory database — better-sqlite3's
// ":memory:" path opens a brand-new database per connection, so a module
// cached from an earlier call (if this is ever invoked twice in one
// process) would otherwise share state across runs. The harness is
// designed to be created once per process (one vitest file, one
// scripts/simulate.ts run), matching how src/db.ts is a module-level
// singleton in the real app too.
let created = false;

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  if (created) {
    throw new Error("createHarness() can only run once per process — better-sqlite3's :memory: db is per-connection");
  }
  created = true;

  process.env.DATABASE_PATH = ":memory:";
  const dbModule = await import("../src/db.ts");
  const queue = await import("../src/queue.ts");
  const schema = await import("../src/schema.ts");
  const clockModule = await import("../src/clock.ts");
  const logging = await import("../src/logging.ts");

  if (options.silent) {
    logging.setSink(() => undefined);
  }

  const clock = new VirtualClock(options.startMs ?? Date.UTC(2026, 0, 3, 8, 0, 0)); // a fixed Saturday 08:00 UTC
  clockModule.setClock(() => clock.now());

  const machines: HarnessMachine[] = dbModule.db
    .select()
    .from(schema.machines)
    .all()
    .map((m) => ({ id: m.id, label: m.label, type: m.type as "washer" | "dryer" }));

  function advanceMinutes(minutes: number): void {
    clock.advanceMinutes(minutes);
    queue.processOffers(clock.now());
    for (const m of machines) {
      queue.settleMachine(m.id, clock.now());
    }
  }

  function allReservations() {
    return dbModule.db.select().from(schema.reservations).all();
  }

  function allOffers() {
    return dbModule.db.select().from(schema.offers).all();
  }

  function reset(): void {
    dbModule.resetForHarness();
  }

  return { clock, machines, queue, db: dbModule.db, schema, advanceMinutes, allReservations, allOffers, reset };
}
