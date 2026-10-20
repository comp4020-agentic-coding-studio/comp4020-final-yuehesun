# 0008: Two people at once, bad connections and restarts

## Status

Accepted — implementation pending (`plans/crit-10.md` Stage 10).

## Context

The final project's top band asks the app to hold up under use it wasn't
designed for, such as two people acting at once or a slow connection. In a
laundry room that is ordinary, not exotic: a Saturday morning means
several residents joining the same free machine within seconds, phones on
weak Wi-Fi in a basement, and screens locked mid-wait.

Four ways that could go wrong:

1. Two rooms join the same idle machine together and both end up first.
2. One room's claim arrives twice (a double tap) and is counted twice.
3. On a slow connection a resident taps "Reserve" again because nothing
   seemed to happen, and holds two places.
4. A phone drops the live connection and keeps showing an old queue, or
   the server restarts and loses state.

## Options considered and decisions

**Simultaneous actions.** The app runs as one process on one machine with
`better-sqlite3`, whose calls are synchronous, and every check-then-write
in `src/queue.ts` runs without an `await` in between. So two requests
can't interleave inside a queue operation. No locking is added; instead a
spec proves it (20 rooms joining one machine at once get positions 1..20;
a doubled claim succeeds once). If the app ever ran on two machines, or a
queue function gained an `await` between its read and its write, this
would stop being true, and the spec is what would catch the second case.

**Double submit.** Options: disable the button only on the client;
reject on the server; or both. Client-only fails when the second request
is already sent, or comes from a reload. Rejecting every second join from
a room would break the 2-per-type rule (darks and lights). Decision: both
— buttons are disabled while their request is in flight, and the server
treats an identical join (same room, same machine, same washing type)
arriving within **3 seconds** of the first as the same request, returning
the existing reservation. Three seconds is far longer than a double tap
and far shorter than a real second load.

**Lost connection.** Options: silently retry; reload the whole page; or
retry and refetch the fragments, saying so. Silent retry is what leaves a
stale queue on screen, which is the worst case for an app whose point is
that you can trust the screen instead of standing in the room. A full
reload loses scroll position and any open dialog. Decision: while the
live connection is down, a text notice says "Connection lost —
reconnecting…"; when it comes back, every live fragment is re-fetched once
and the notice disappears.

**Restart.** State is already in SQLite on the volume (ADR 0003). The
decision is to test it rather than assume it: a spec starts its own server
on a temporary database, creates reservations, restarts it and checks
every position and status survived.

## Consequences

- Four new specs, all enforced, so README's "What's enforced" grows.
- The duplicate window adds one lookup to every join.
- The "no interleaving" guarantee depends on one process and synchronous
  queue functions. That is written here so a future change that breaks
  either knows what it is breaking.
- The reconnect notice is checked by hand (DevTools offline / Slow 3G), not
  by a spec: whether it reads clearly is judged.