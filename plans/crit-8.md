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

Built on ADR 0002 (identity) and ADR 0003 (stack). Concrete contract:

**Schema (Drizzle, `better-sqlite3`):**
- `machines`: `id`, `label` (e.g. "Washer 1").
- `reservations`: `id`, `machineId`, `personName` (the self-declared
  identity), `washingType`, `durationMinutes`, `joinedAt`, `claimedAt`
  (nullable), `startedAt` (nullable), `status` (`waiting` / `claimed` /
  `running` / `done` / `cancelled` / `missed`).

**Routes (Hono, htmx forms — human pages return HTML, one route returns
JSON purely for `spec/` and debugging):**
- `GET /` — identity prompt if no cookie set, else the machine list with
  queue state.
- `POST /identity` — sets the self-declared name/room cookie.
- `POST /machines/:id/reservations` — join this machine's queue (body:
  `washingType`); scanning an unreserved machine on-site is the same call.
- `POST /reservations/:id/claim` — claim (only valid if it's this
  reservation's turn).
- `POST /reservations/:id/start` — record the actual start time.
- `POST /reservations/:id/cancel` — leave the queue; bumps everyone behind
  up by one.
- `GET /machines/:id/state` — JSON queue state (`{ reservationId, person,
  status, position }[]`) — not a page a visitor sees, just how `spec/`
  checks invariants without parsing HTML.

**Logic:** position and estimated/fixed time are computed from the chain
of reservations ahead (per `plan.md`'s rule — no extra stored field for the
estimate). At the front of the queue with the machine free: 3-minute claim
window; miss it, status becomes `missed`, next person's up.

**Wire contract spec/ relies on** (so Stage 1 and the tests agree):
- `POST /machines/:id/reservations` on success: redirects (3xx) with a
  `Location` header containing `/reservations/<new id>`.
- `POST /reservations/:id/claim`: 2xx if it's genuinely this reservation's
  turn; 4xx (e.g. 409) if not — claiming out of turn is refused, not
  silently ignored.
- `POST /reservations/:id/cancel`: 2xx; bumps everyone behind up by one.
- `GET /machines/:id/state`: 200, JSON array of
  `{ reservationId, person, status, position }`, `position` 1-indexed
  within that machine's live queue (waiting/claimed/running), ordered by
  join time.
- Seed ~10 machines on first boot if the table's empty (same
  `seedIfEmpty` shape as the week 7 guestbook's `src/lib/db.ts`).

### Stage 2 — make it alive, deployed, and documented

- Replace the placeholder `Dockerfile`/app with the real one; wire up
  `/data` for persistence across restarts/redeploys.
- Confirm the "alive" check by hand: a stranger joins a queue, closes the
  tab, comes back, their place is still there.
- `spec/`: `queue-fairness.test.ts` (no machine has two simultaneous active
  claims) and `queue-order.test.ts` (position only moves forward, except
  through the documented miss-window rule) check what's enforced this crit
  against the route contract above. (The no-messaging claim is judged by
  review, not a test — see `README.md`. The base `invariants.test.ts`
  headings/200 checks already ship.)
- Finish `README.md` (enforced/judged split, what we chose not to build),
  `PROCESS.md` (stack/workflow ADRs feed this), and `reflections/crit-8.md`.
- `pnpm check` and `pnpm check:evidence` green, repo flipped public, `/ship`.

## Decisions behind this stage

1. **Identity** — self-declared name or room number, remembered per
   browser. See `docs/adr/0002-identity.md`.
2. **Tech stack** — Hono, TypeScript/Node 24, Drizzle + `better-sqlite3`,
   migrations at boot, htmx (+ SSE later). See
   `docs/adr/0003-tech-stack.md`.

Both resolved — nothing blocking Stage 1 now.
