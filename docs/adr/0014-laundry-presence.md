# 0014: Presence state is in-memory, never persisted

## Status

Accepted.

## Context

plans/laundry-presence.md adds a way for one resident's browser to see
another resident's character moving in the shared 3D room. This needs
every connected browser's current position, continuously, which is a
different shape of state from everything else this app tracks — every
other piece of state (a reservation, a machine, a pickup spot) lives in
the SQLite database and survives a restart (plan.md's own persists
requirement). Before building this, one real decision had to be made:
does a resident's position belong in that same database, or not?

## Decision

**No persistence.** `src/presence.ts` keeps every connected browser's
last-reported position in a plain in-memory `Map`, cleared on every
server restart and never written to `src/schema.ts`/migrated via
drizzle-kit. A stale entry (no report in `STALE_MS`) is dropped on a
timer; an explicit tab close sends a best-effort leave signal for
faster cleanup, but nothing here is ever the source of truth for
"was someone in the room" after the fact.

This is only safe because of this app's actual deployment topology
(fly.toml): one Fly machine, `--ha=false`, no horizontal scaling.
Presence state living in one process's memory is complete and correct
specifically because there is only ever one process. If a future change
ever runs more than one instance of this app, this design silently
stops working (two instances would each think they're the only
source of truth, and a resident connected to instance A would never see
a resident connected to instance B) — this ADR exists partly so that
decision gets re-examined if that ever changes, not rediscovered by
debugging a confusing production symptom.

## Consequences

- A server restart (a deploy, a crash, Fly's own auto-stop-when-idle
  behaviour) clears every visible character until each browser's own
  next report/broadcast cycle repopulates it — within a few hundred
  milliseconds of reconnecting, not a data-loss concern since nothing
  here was ever meant to survive a restart.
- Presence never touches `src/queue.ts`, `src/schema.ts`, or any
  `drizzle-kit` migration — keeping it architecturally impossible for
  a position report to affect fairness, reservation state, or anything
  CLAUDE.md's test-harness rules already protect.
- Adding a second Fly machine in the future requires revisiting this
  design (likely: a shared pub/sub layer, or accepting that presence
  becomes per-instance) — not a drop-in config change.
