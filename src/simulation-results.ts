import { readFileSync } from "node:fs";
import type { SimulationResults } from "../scripts/simulate.ts";

// Crit 10 extension, Stage 13 (plans/crit-10.md "Extension"; ADR 0007,
// second use; ADR 0010): read fresh on every request (same pattern as
// README.md via src/readme.ts), not cached at boot, so re-running
// `pnpm sim` shows up without restarting the server. Returns undefined
// rather than throwing when the file doesn't exist yet — a fresh
// checkout before anyone has run `pnpm sim` is a normal state, not an
// error.
const RESULTS_PATH = "sim/results.json";

export function readSimulationResults(): SimulationResults | undefined {
  try {
    const raw = readFileSync(RESULTS_PATH, "utf8");
    return JSON.parse(raw) as SimulationResults;
  } catch {
    return undefined;
  }
}
