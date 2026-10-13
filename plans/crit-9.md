# Crit 9 plan — "All at once"

## Read first

- Overall vision: [`plan.md`](../plan.md) — background, the full feature
  list, and what's deliberately deferred.
- Crit 8's own plan: [`plans/crit-8.md`](crit-8.md) — the schema, routes,
  and fairness rule this crit builds on top of.
- Crit 9 brief:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/
- `spec/README.md` in this repo.
- `README.md` — the "good" argument this crit's decision has to be
  benchmarked against (see Stage 2).

## Background

**What we're building:** a shared queue for a laundry room's machines —
see `plan.md`'s Background and User story sections for the full picture.
Crit 8 shipped the smallest version that's genuinely alive: one machine
type, manual reservation, a blunt fairness rule (miss your 3-minute claim
window, lose your spot outright), persistence, no real-time sync at all.

**What crit 9 adds, per the brief:** real-time sync (a change one person
makes reaches every other open session within about a second, with no
reload) and one documented decision about how the app behaves when
several people use it at once, benchmarked against what `README.md` says
good means, with alternatives considered.

## What this crit requires (from the spec)

1. The app is real-time by the brief's definition, deployed by the
   cutoff: a change one person makes appears in every other open session
   within about a second, with no reload.
2. One decision about how the app behaves when several people use it at
   once is made, written down in the repo (ADR format suggested), and we
   can say why — benchmarked against `README.md`'s "good" argument, with
   the rejected alternative named.
3. Process evidence: commits that grew with the work, `PROCESS.md`
   rewritten in full (900–1100 words per the final-project brief — see
   `CLAUDE.md`), and `reflections/crit-9.md`.
4. Can account for how the work was directed, grounded, and corrected.

## Scope for this crit

From `plan.md`'s feature list:

- **Real-time transport** (core, required this crit): SSE, broadcast on
  every write, plus a server-side tick so passive expiries (claim window
  running out, a wash finishing) also reach every open page within a
  second — not just writes.
- **The documented decision, full scope** (per discussion, not the
  smaller "move back one place only" option): upgrade #1's fairness rule
  from crit 8's blunt version to the two-tier reminder + offer system,
  and build #12 (cross-machine "earlier machine" offers) alongside it,
  since the brief's offer mechanism only makes sense once both the
  same-queue and cross-machine cases are handled the same way (see
  `plan.md`'s User story).
- **Stretch, Stage 4 only**: dryers (#5), a second machine type —
  attempted only after Stages 1–3 are built and verified, first thing cut
  if time runs short. Not required by crit 9's spec.

Explicitly **not** this crit, staying in `plan.md`'s gap list: finished-
but-not-collected handling (#6), shoe washers (#10), push notifications
beyond the real-time requirement (#2).

## Stages

### Stage 1 — real-time transport

Built on ADR 0003's "htmx + SSE" plan. Refined design, against the real
code in `src/`:

**Signal, not content, over SSE.** Rendered HTML differs per viewer
(whether a row is "mine," whether the claim/start buttons show) — if the
server pushed rendered HTML over SSE, every connected browser would get
the same content regardless of whose cookie it is. Instead, SSE carries
only a change *signal* (which machine changed); each browser's own page,
on receiving it, makes a normal cookie-carrying GET to re-fetch the one
small fragment affected. htmx does this natively (`hx-trigger="sse:..."`
triggering a regular `hx-get`), so the existing identity/rendering logic
in `views.ts` needs no change, only two new fragment routes:

- `GET /machines/:id/card` — just that machine's card HTML (identity-aware).
- `GET /my-status` — just the pinned "your status" block (identity-aware).

The reservation detail page re-fetches itself (`GET /reservations/:id`,
already exists) on its own machine's event — no new route needed there.

**New module `src/realtime.ts`:** a small in-process pub/sub —
`subscribe`/`unsubscribe` for SSE stream objects (Hono's `streamSSE`
helper from `hono/streaming`), and `broadcast(event)` that writes a named
SSE event (e.g. `machine-3`, plus a generic `changed` event for the
my-status block, which doesn't know in advance which machine its
reservation is on) to every connected stream.

**New route:** `GET /events` — one shared SSE stream per connected
browser. The home page and reservation page both open it once
(`hx-ext="sse" sse-connect="/events"` on the page shell), so one
connection serves every live fragment on that page.

**The tick does the detecting, not the route handlers.** Rather than
remembering to call `broadcast()` inside `join`/`claim`/`start`/`cancel`
separately (easy to miss one), a single server-side interval (every
~500ms) is the one place that decides when to broadcast: for every row in
`machines`, it recomputes `queue.queueFor(machineId, now)` (which already
calls `settleMachine()` internally — this is also how passive expiries,
like a claim window running out with nobody requesting anything, get
noticed at all), compares the result to a cached digest from the last
tick, and broadcasts only if it changed. One mechanism catches both
"someone just clicked something" and "a timer ran out with nobody
watching" — the person who acted already sees their own result
immediately via the normal redirect; the tick is what gets *everyone
else's* page to under a second.

**Separate keepalive:** Fly's proxy can drop an idle SSE connection, so a
longer-interval heartbeat (~20–25s, independent of the 500ms state-check
tick) writes an empty comment to every open stream to keep it alive.

**Verify before Stage 2 lands on top:** confirm real-time works against
crit 8's *existing* fairness rule first — two browser tabs, one claims,
the other's card updates within a second with no reload; one tab's claim
window visibly expires (nobody touches either tab) and the other tab
reflects it within a second. This isolates "is real-time actually
working" from "is the new fairness logic correct," so a bug in Stage 2/3
doesn't get blamed on the transport.

**Files touched:** new `src/realtime.ts`; `src/app.ts` (new `/events`,
`/machines/:id/card`, `/my-status` routes, start the tick at boot same as
`db.ts`'s seed-on-import pattern); `src/views.ts` (export `myStatusBlock`
alongside the already-exported `machineCard`; add the SSE extension
script tag and `hx-ext`/`sse-connect`/`hx-trigger` attributes to the page
shell and the relevant elements). `src/queue.ts` and `src/schema.ts`
untouched this stage.

### Stage 2 — fairness escalation (same-queue case)

Benchmark this against `README.md`'s "good" argument before writing code,
not after: `README.md` argues the point of this app is removing the cost
of being physically present to hold a place, via Maister's waiting-
psychology research and the FastPass precedent (a scheduled window you
can walk away from). Crit 8's blunt rule — miss the window, ejected
outright — punishes exactly the behavior the app exists to permit
(stepping away). The gentler rule below is argued from that, not picked
for its own sake.

**The decision:** miss your claim window (3 min) or your start window (5
min) and you move back exactly one place — swapped with whoever's next —
instead of losing your spot outright. Implemented as a `joinedAt` swap
between the two reservations in `settleMachine()`, not a new sort column:
position is still "order by `joinedAt`," so nothing else about `queueFor`
changes.

**Rejected alternative (for the ADR):** crit 8's own rule, ejected
outright on a miss. Named explicitly as what we had and chose to move
away from, with the reasoning above.

Verify alone, before Stage 3: two people in one machine's queue, the
front misses their window, confirm they're now second rather than gone,
and the real-time push carries the swap to both browsers within a
second.

### Stage 3 — offer system (early-opening case)

New mechanism for the two cases crit 8 never had: the person ahead of you
missing their turn (handled differently from Stage 2's own-queue case
when it creates slack elsewhere), and a different machine of your type
going fully idle with nobody queued for it.

**Schema:** new `offers` table — `id`, `reservationId` (who it's offered
to), `machineId` (which machine), `offeredAt`, `respondBy` (offeredAt + 2
min), `status` (`pending` / `accepted` / `declined` / `expired`).

**Tick extension:** the same Stage 1 tick that calls `settleMachine()`
also, per machine type, checks for an idle machine with no queue and at
least one eligible waiting person on another machine of that type
(furthest from their own start, per `plan.md`'s "longest waiting, skip
anyone already about to start on their own machine" rule), and creates an
offer if none is already pending for that machine.

**Routes:** `POST /offers/:id/accept`, `POST /offers/:id/decline`.

**Accept semantics (decided):** accepting vacates the original
reservation entirely — same effect as a cancel, bumping everyone behind
it up by one — and claims the new machine directly. No double-holding:
once you've accepted, you're doing laundry, there's no reason to keep a
second place.

**Decline / no-response (decided):** declining, or not responding within
2 minutes, passes the offer to the next eligible person while the
original holder keeps their place untouched. If nobody eligible is left,
the machine falls back to crit 8's existing "free but unclaimed" amber
state — no new state invented, it's just visibly claimable by anyone who
walks up or reserves next.

**Accepted-but-not-scanned:** 10 minutes to actually claim (scan) the new
machine once accepted, or it counts as a missed turn under Stage 2's
move-back-one rule, same mechanism, not a separate rule.

Verify: one machine goes idle with an eligible person waiting elsewhere,
confirm the offer appears, accept and decline paths both tested, and the
no-taker fallback to "free but unclaimed" when nobody's eligible.

### Stage 4 — document the decision

- `docs/adr/0005-fairness-escalation.md`: the full policy (Stage 2 +
  Stage 3 together, since the offer mechanism only exists because the
  move-back-one rule creates the slack it responds to), benchmarked
  against `README.md`, crit 8's blunt rule named as the rejected
  alternative with why.
- `README.md`'s "Several people at once" section filled in with what
  actually happens, once Stages 1–3 are verified — not before, so it
  describes real behavior, not intent (see `README.md`'s current
  placeholder comment).
- New `spec/` tests: the move-back-one swap, and an offer's accept/decline
  outcome — both against the wire contract these stages define.

### Stage 5 — stretch: dryers (only if Stages 1–4 are done and verified)

Second machine type (`type: "dryer"` already supported by the schema's
`machines.type` column from crit 8). First thing cut if time is short.
If attempted: seed dryers in `seedMachinesIfEmpty`, a second machine icon
shape (the hook crit 8's UI design pass already built for this), and
confirm the per-type active-reservation cap and cross-machine offers
correctly scope by type rather than merging washers and dryers into one
queue.

### Stage 6 — wrap-up

- Grow `plan.md`: update the feature list's status for #1, #12 (now
  shipped), current-state section, crit 9 row in "Mapping onto crits."
- `PROCESS.md` rewritten in full (900–1100 words, per `CLAUDE.md`'s
  updated numbers) — not appended to. Must explain the stack/workflow
  choices and trade-offs, not just this crit's new work.
- Remind the user to write `reflections/crit-9.md` (their own, not
  drafted by the agent).
- Redeploy, confirm `pnpm check` green, and do a real two-browser check
  against the live app (not just local) before calling this crit done.

## Decisions behind this stage

1. **Scope of the fairness decision** — full two-tier reminder + offer
   system (Stages 2+3 together), not the smaller move-back-one-only
   option, per explicit discussion: the two mechanisms share one
   underlying idea (missing a turn costs one place, never the whole
   queue) and building only half would leave `plan.md`'s User story
   partially unimplemented without a stated reason.
2. **Dryers are a stretch, Stage 5 only** — explicitly optional per the
   brief ("if time allows"), not required by crit 9's spec, attempted
   only after the required work is verified.
3. **Accept vacates the original reservation entirely; no-taker falls
   back to "free but unclaimed"** — both decided in discussion, recorded
   here so Stage 3 doesn't re-litigate them mid-build.
