// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007): a
// forward-only virtual clock, installed into src/clock.ts via setClock so
// every queue.ts call in this process reads simulated time instead of
// wall-clock time. "Forward-only" is deliberate — nothing in queue.ts
// expects time to move backward, and a driver that could rewind would let
// a test accidentally construct situations the real app can never reach.
export class VirtualClock {
  private ms: number;

  constructor(startMs: number) {
    this.ms = startMs;
  }

  now(): number {
    return this.ms;
  }

  // Advances by exactly `minutes` — the driver's only way to move time,
  // so a test reads as "N minutes pass" rather than an arbitrary jump to
  // an absolute timestamp.
  advanceMinutes(minutes: number): void {
    if (minutes < 0) throw new Error("VirtualClock only moves forward");
    this.ms += minutes * 60_000;
  }
}
