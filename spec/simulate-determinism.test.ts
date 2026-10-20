import { expect, it } from "vitest";
import { createHarness, type Harness } from "../sim/harness.ts";
import { runOneDay } from "../scripts/simulate.ts";

// Crit 10 extension, Stage 13 (plans/crit-10.md "Extension"; ADR 0007,
// second use): scripts/simulate.ts's whole premise — that its PRNG-seeded
// behaviour model stands in for "the same Saturday" every time — only
// holds if the same seed genuinely produces the same day. This runs
// runOneDay twice, same seed and policy, on a freshly reset harness each
// time, and checks the raw metrics come out byte-for-byte identical.
it(
  "produces identical metrics for the same seed and policy",
  async () => {
    const h: Harness = await createHarness({ silent: true });

    h.reset();
    const first = await runOneDay(h, 12345, "move-back-one");

    h.reset();
    const second = await runOneDay(h, 12345, "move-back-one");

    expect(second).toEqual(first);
  },
  30_000,
);
