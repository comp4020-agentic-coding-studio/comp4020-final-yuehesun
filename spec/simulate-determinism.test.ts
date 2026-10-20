import { beforeEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../sim/harness.ts";
import { runOneDay } from "../scripts/simulate.ts";

// Crit 10 extension, Stage 13 (plans/crit-10.md "Extension"; ADR 0007,
// second use): scripts/simulate.ts's whole premise — that its PRNG-seeded
// behaviour model stands in for "the same Saturday" every time — only
// holds if the same seed genuinely produces the same day. A single
// module-level harness, reset between tests (the same pattern
// spec/queue-timing.test.ts uses) — createHarness() can only run once per
// process, since better-sqlite3's :memory: database is per-connection.
let h: Harness;

beforeEach(async () => {
  if (!h) h = await createHarness({ silent: true });
  h.reset();
});

it(
  "produces identical metrics for the same seed and policy",
  async () => {
    const first = await runOneDay(h, 12345, "move-back-one");

    h.reset();
    const second = await runOneDay(h, 12345, "move-back-one");

    expect(second.metrics).toEqual(first.metrics);
  },
  30_000,
);

// Stage 14: the replay recording is new logic running inside the same
// loop — it needs the same determinism guarantee the metrics already
// have, checked separately since record:true takes its own path through
// runOneDay (board-state lookups and event capture the non-recording run
// never executes).
it(
  "produces an identical replay for the same seed and policy",
  async () => {
    const first = await runOneDay(h, 12345, "move-back-one", true);

    h.reset();
    const second = await runOneDay(h, 12345, "move-back-one", true);

    expect(second.replay).toEqual(first.replay);
  },
  30_000,
);
