// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007):
// queue.ts reads "now" only through this module. Production's now() is
// just Date.now() — no behaviour change — but ADR 0007's decision is to
// let tests and the simulator "swap that function for a virtual clock":
// setClock below is the one seam that does it, mirroring logging.ts's own
// sink-swap shape. Nothing reachable from the running app ever calls
// setClock — only sim/ and spec/fairness-properties.test.ts do, in their
// own process, against their own in-memory database.
let impl: () => number = () => Date.now();

export function now(): number {
  return impl();
}

export function setClock(fn: () => number): void {
  impl = fn;
}

export function useRealClock(): void {
  impl = () => Date.now();
}
