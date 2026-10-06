# Crit 8 plan — "It's alive!"

## Read first

- Overall vision: [`plan.md`](../plan.md) — read this first for background,
  the full feature list, and what's deliberately deferred.
- Crit 8 brief:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/
- `spec/README.md` in this repo.

## Background (short)

Laundry Queue: a shared queue for a laundry room's machines, so strangers
can coordinate over a scarce resource without chatting, friending, or
accounts. Full mechanism and reasoning in `plan.md`.

## What this crit requires (from the spec)

1. App deployed and live at its `*.fly.dev` URL by the cutoff.
2. "Alive": a stranger can visit, do the core thing, and find their trace
   still there when they come back. No real-time or polish expected yet.
3. `README.md` states a first-pass "good" argument, published in full at
   `/readme/`.
4. Repo goes public at the cutoff and stays public.
5. Process evidence: commits that grew with the work, `PROCESS.md`, and
   `reflections/crit-8.md`.
6. Can account for how the work was directed, grounded, and corrected.

## Scope for this crit

From `plan.md`'s feature list, this crit ships:

- One machine type only (no dryers/shoe washers yet).
- Reserve a specific machine by picking it online, or by scanning an
  unreserved machine on site (which creates and fulfils the reservation in
  one step).
- Washing type chosen at reservation time, fixing the duration up front.
- Estimated vs. fixed time: estimate assumes the person ahead starts on
  schedule; becomes fixed once they actually start.
- Claim (scan) vs. start (separate tap) as distinct actions.
- Simple fairness: miss your 3-minute claim window once it's your turn,
  lose your spot, next person's up.
- Cancelling moves the line up by one.
- Persistence: queue state survives reload, restart, and redeploy.

Explicitly **not** this crit: auto-assign, cross-machine offers, the
two-tier reminder/offer system, uncollected-clothes handling, a second
machine type, push notifications, real cross-browser real-time sync. These
are either later-crit or gap items — see `plan.md`.

## Stages

### Stage 1 — schema and the core queue loop

- Data: a machine (id, status); a reservation (machine, person, washing
  type → duration, joined-at, claimed-at, started-at, status:
  waiting/current-turn/claimed/running/done/cancelled).
- Join a queue: pick a specific machine, or scan an unreserved machine
  on-site.
- See your position and an estimated/fixed time (computed from the chain
  of reservations ahead of you, per `plan.md`'s rule — no extra stored
  field needed).
- When you're at the front and the machine's free: 3-minute claim window;
  miss it, you lose your spot, next person's up.
- Claim (scan) → mark claimed. Start (separate tap) → record actual start.
- Cancelling moves the line up by one.
- Depends on: identity decision (who a reservation belongs to), tech stack
  decision (what this is built with, how it's stored).

### Stage 2 — make it alive, deployed, and documented

- Replace the placeholder `Dockerfile`/app with the real one; wire up
  `/data` for persistence across restarts/redeploys.
- Confirm the "alive" check by hand: a stranger joins a queue, closes the
  tab, comes back, their place is still there.
- Add `spec/*.test.ts` checks for what's enforced this crit:
  - a machine never has two simultaneous active claims
  - a queue's position only moves forward, except through the documented
    miss-window rule
  - no messaging/chat endpoint or UI element exists anywhere in the app
  - (the base `invariants.test.ts` headings/200 checks already ship)
- Finish `README.md` (enforced/judged split, what we chose not to build),
  `PROCESS.md` (stack/workflow ADRs feed this), and `reflections/crit-8.md`.
- `pnpm check` and `pnpm check:evidence` green, repo flipped public, `/ship`.

## Open decisions blocking Stage 1

1. **Identity** — anonymous/short-lived browser id vs. self-declared
   name/room number. *Pending.*
2. **Tech stack** — framework/runtime, persistence, real-time transport.
   *Pending.*
