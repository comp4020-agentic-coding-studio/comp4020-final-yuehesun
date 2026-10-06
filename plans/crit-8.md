# Crit 8 plan — "It's alive!"

## Read first

- Overall vision: [`plan.md`](../plan.md) — read this first for background,
  the full feature list, and what's deliberately deferred.
- Crit 8 brief:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/
- `spec/README.md` in this repo.

## Background 

**What we're building:** a shared queue for a laundry room's machines. A
student residence has ~10 machines for 100+ people; on weekends there's
always a wait, and leaving the room risks losing your turn. The app lets
people join a queue for a specific machine, see where they stand, and know
when it's their turn — without chatting, friending, or creating an account.
Shared state does the coordinating; talking stays optional.

This satisfies the final project's three fixed requirements: **multi-user**
(anyone looking at a machine's line is a different, queue-tracked person),
**real-time** (queue position and machine status update live), and
**persists** (your place in line, and every machine's state, survives
reloads, restarts and redeploys).

**Our definition of "good"** (see `README.md`): fair and seen to be fair;
the queue decides, not the people in it; talking is optional; honest about
real-time limits; keeps only what the queue needs (no profile, no history);
and stays scoped to one laundry room rather than becoming a generic
booking product.

See [`docs/adr/0001-app-concept.md`](docs/adr/0001-app-concept.md) for why
this app over the alternatives considered.

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

- **Done.** Replaced the placeholder `Dockerfile`/app with the real one
  (multi-stage `node:24-slim`, no build step — Node 24 runs TypeScript
  directly); `fly.toml`'s `DATABASE_PATH` points at `/data` for persistence
  across restarts/redeploys.
- **Done, locally.** Confirmed the "alive" check by hand: joined a queue,
  killed and restarted the process against the same database file, the
  reservation was still there. The exact containerized build CI runs
  (`docker build` + `docker run --tmpfs /data`) hasn't been verified in
  this dev environment — Docker isn't available here — so CI's first run
  on push is the real check of that path.
- **Done.** `spec/queue-fairness.test.ts`, `spec/queue-order.test.ts`, and
  `spec/identity-format.test.ts` check what's enforced this crit against
  the route contract above. (The no-messaging claim is judged by review,
  not a test — see `README.md`. The base `invariants.test.ts`
  headings/200 checks pass against the real app now too, via `/readme/`.)
- **Done.** `README.md` (enforced/judged split, what we chose not to
  build) and `PROCESS.md` (246 words, stack/workflow ADRs + the
  identity-format fork). `reflections/crit-8.md` is still needed — that's
  the user's own, not the agent's.
- `pnpm check` is green (6/6) locally. Still to do: `pnpm check:evidence`
  (blocked only on the reflection), repo flipped public, `/ship`.

## UI design

Stage 1's pages work but look like a wireframe — no colour, no visual
hierarchy, times buried in sentences. Real laundry-queue and queue-ticket
apps (campus laundry apps like LaundryView/CSCGo, ride-share arrival-time
chips, deli/pharmacy ticket boards, flight-status boards) share a pattern
worth copying: the one number someone's actually scanning for — a time, a
position, a status — is never left inline in a sentence. It's pulled out
into its own big, colour-coded block, and everything else stays quiet
around it.

**Status colours** — one meaning per colour, used consistently everywhere:
- **Green** — free, nobody queued.
- **Blue** — running (a wash is in progress).
- **Amber** — free but unclaimed (the urgent "claim window ticking" state —
  already started as `.unclaimed` in Stage 1's CSS; sharpen, don't replace).
- **Indigo accent** — "this one's yours", applied anywhere your own
  reservation shows up.

**Time chips.** Every time shown (starts at, free at, claim deadline) gets
its own rounded pill instead of sitting inline in a sentence — larger, bold
numerals, a short label above or below. Every chip shows **both** forms
together: the clock time ("2:45 PM") and the relative time ("in 12 min") —
different people scan for different ones, so show both rather than
picking. The estimated-vs-fixed distinction README argues for becomes a
*visual* difference too, not just a "~": a fixed time is a solid-filled
chip; an estimated time is the same shape but outlined and lighter, so the
uncertainty is visible before you even read the label.

**Queue position badges.** Each row in a machine's line gets a small round
numbered badge instead of plain "#2" text — scannable at a glance, the
same pattern as a deli-counter ticket number.

**Machine icons.** Each card gets a small icon next to the machine's
number — a plain inline SVG shape per machine type, not an icon library or
image asset. Crit 8 only has one type (washers), so the icon does nothing
useful yet on its own, but it's the hook crit 9's second type (dryers)
needs: once two shapes exist, people tell machines apart by glancing at the
icon before reading the label. Intuitive-first means building this now,
not bolting it on later when it'd mean restyling every card.

**Machine cards.** One card per machine. Layout responds to the two
viewport sizes the crit is marked at: a single column at phone width
(plan.md's user story has people checking from their room on a phone), and
a multi-column grid on a wide screen — CSS Grid with `auto-fill`/`minmax`
so it reflows with no JS and no hard breakpoint to maintain. Card
border/background follows the status colours above. A ticking claim window
shows an actual countdown, not static "3 minutes left" text, so the
urgency doesn't require doing math.

**Your status, pinned.** If you have an active reservation anywhere, a
small block at the very top of the page — above the machine grid — always
shows it: which machine, your position, and when it's your turn (same dual
clock/relative time format as everywhere else). You shouldn't have to find
your own card in a grid of ten to answer "am I up yet?". Nothing shown here
if you have no active reservation.

**Accessibility.** Colour never carries meaning alone — every status chip
or badge also has a text label ("Running", "Free", "Your turn"), and every
icon has an accessible text equivalent. Every control is a real `<button>`
or link, never a styled `<div>`, so everything works from the keyboard with
a visible focus state.

**Buttons.** The one action that matters right now (Claim, Start, Reserve)
is visually the loudest thing on the card — bigger, filled, colour-matched
to urgency (amber for "claim now"). Cancel stays small and quiet so it's
not pressed by accident.

**Staying small.** No icon library, no image assets, no CSS framework —
plain CSS custom properties for the palette and a handful of reusable
classes (chip, badge, card). Consistent with ADR 0003's minimalism and the
256MB budget; this is styling, not new dependencies.

## Decisions behind this stage

1. **Identity** — self-declared name or room number, remembered per
   browser. See `docs/adr/0002-identity.md`.
2. **Tech stack** — Hono, TypeScript/Node 24, Drizzle + `better-sqlite3`,
   migrations at boot, htmx (+ SSE later). See
   `docs/adr/0003-tech-stack.md`.

Both resolved — nothing blocking Stage 1 now.
