import { AsyncLocalStorage } from "node:async_hooks";

// Crit 10 (plans/crit-10.md Stage 1): every log line is tagged so a
// reader (a person watching `flyctl logs`, or an agent debugging later)
// can tell which lines belong to the same request or the same tick
// iteration. A module-level "current tag" variable would be unsafe
// specifically because this crit's own demo is two people acting at
// once — two in-flight requests interleave on the event loop, and a
// shared mutable variable would let one request's tag bleed into the
// other's lines. AsyncLocalStorage keeps each call chain's tag isolated
// from every other one running concurrently.
const tagStorage = new AsyncLocalStorage<string>();

// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"): the in-process
// harness (sim/, spec/fairness-properties.test.ts) runs hundreds of
// sequences through the real queue.ts, and every logged event/request line
// would otherwise flood the test runner's own stdout with noise nobody
// reads. A sink swap, not an env var or a route — nothing reachable from
// the running app can silence its own logs (plans/crit-10.md's whole
// point is that those lines are read at the crit).
let sink: (line: string) => void = (line) => console.log(line);

export function setSink(fn: (line: string) => void): void {
  sink = fn;
}

export function useConsoleSink(): void {
  sink = (line) => console.log(line);
}

export function genTag(): string {
  return Math.random().toString(16).slice(2, 8);
}

// Binds `tag` for the duration of `fn`'s call chain (including anything
// it awaits) — used once per incoming POST request, and once per tick
// iteration, so everything that function calls on its way down shares
// one tag with no parameter threading required.
export function withTag<T>(tag: string, fn: () => T): T {
  return tagStorage.run(tag, fn);
}

// Reuses the ambient tag if one is already bound (so a queue function
// called synchronously inside a request handler shares that request's
// own tag), otherwise mints a fresh one (so the same function called
// from the realtime tick, with no request behind it, still gets a tag).
// Lets settleMachine/processOffers call this without knowing which case
// they're in.
export function ensureTag<T>(fn: () => T): T {
  const current = tagStorage.getStore();
  if (current != null) return fn();
  return withTag(genTag(), fn);
}

function currentTag(): string {
  return tagStorage.getStore() ?? genTag();
}

// Quotes a field value if it contains whitespace, so `key=value` stays
// one token per field (queue.ts's own error messages, e.g. "not your
// reservation", do contain spaces).
function formatField(key: string, value: string | number): string {
  const str = String(value);
  return /\s/.test(str) ? `${key}="${str}"` : `${key}=${str}`;
}

// A named, business-meaningful event — a user's action (reservation_joined,
// reservation_claimed, ...), a denied attempt (reservation_cancel_denied,
// ...), or a tick-driven system decision (reservation_moved_back,
// offer_created, ...). Tag comes from the ambient request/tick context;
// a bare call outside any of those (shouldn't normally happen) still
// prints with a one-off tag rather than throwing.
export function logEvent(name: string, fields: Record<string, string | number> = {}): void {
  const parts = [`[${currentTag()}]`, name, ...Object.entries(fields).map(([k, v]) => formatField(k, v))];
  sink(parts.join(" "));
}

// The fixed request-line shape: [tag] METHOD path status XXms user=Y.
// Only called for state-changing (POST) requests — see app.ts's logging
// middleware and plans/crit-10.md's scope note on why GETs are excluded.
export function logRequest(tag: string, method: string, path: string, status: number, ms: number, user: string): void {
  sink(`[${tag}] ${method} ${path} ${status} ${ms}ms user=${user}`);
}
