# Crit 10 plan — "Fly by instruments"

## Read first

- Overall vision: [`plan.md`](../plan.md) — background, the full feature
  list, and what's deliberately deferred.
- Crit 9's own plan: [`plans/crit-9.md`](crit-9.md) — real-time transport
  and the fairness-escalation decision this crit builds on top of.
- Crit 10 brief:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/
- Final project brief:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/
- `spec/README.md` in this repo.
- `README.md` — the "good" argument this crit's new ADR has to be
  benchmarked against (enforced vs. judged split).

## Background

**What we're building:** a shared queue for a laundry room's machines —
see `plan.md`'s Background and User story sections for the full picture.
Crit 8 shipped the smallest working version; crit 9 added real-time sync
and the fairness-escalation decision (ADR 0005).

**What crit 10 adds, per the brief:** the app already tells people apart
server-side (identity is a room number, checked on every action via
`queue.ts`'s `loadOwned`/`loadOwnedOffer`, documented in ADR 0002/0004) —
crit 10's job isn't inventing that mechanism, it's making it *legible from
the outside*: server-side logging of who did what, so at the crit two
pod-mates can use the app from its URL alone, in separate Chrome profiles,
while the student narrates purely from `flyctl logs` — no clicking through
the UI themselves. The logging has to outlive the crit (it's what gets
read later when the deployed app misbehaves, not a one-off demo prop).

## What this crit requires (from the spec)

1. The final project is multi-user by the brief's definition: two or more
   people, each in their own browser, act on shared state, and the app
   tells them apart — already true (ADR 0002/0004), reconfirmed here, not
   redecided.
2. What each person may see and change is checked on the server, and that
   decision is written down in the repo with why — already true
   (`loadOwned`/`loadOwnedOffer`, `MAX_ACTIVE_PER_TYPE`), cross-referenced
   from this crit's new ADR rather than re-argued.
3. The app logs who did what, server-side, and the logging outlives the
   crit (not removed after the demo).
4. At the crit, two pod members use the app from its URL alone, in
   separate Chrome profiles, while the student narrates from
   `mise exec -- flyctl logs -a <repo>` alone — no touching the app.
5. Process evidence: commits that grew with the work, `PROCESS.md`
   rewritten in full, `reflections/crit-10.md`.

## Scope for this crit

From `plan.md`'s feature list and the user's own decisions:

- **Logging infrastructure + event coverage** (core, required this crit):
  every state-changing action gets a log line identifying the room and
  the action; denied/unauthorized attempts are logged too (the brief's
  authorization example is a denied cross-ownership action); the queue's
  own automatic decisions (move-back-one swaps, auto-completed washes,
  offers created/expired) are logged as clearly system-initiated, not
  attributed to a request that doesn't exist.
- **Only state-changing requests are logged** (user's decision): GET
  requests — including the SSE-driven fragment re-fetches
  (`/machines/:id/card`, `/my-status`) that every open tab polls on every
  state change — are not logged. Logging every GET would flood
  `flyctl logs` with routine re-fetch traffic that isn't "someone doing
  something," making the actual narration harder to follow, not easier.
- **Tick-driven events get their own tag** (user's decision, "low cost,
  useful for narrating 'this was the system's own decision'"): a
  move-back-one swap's two affected reservations, or a newly created
  offer, share one tag that has no HTTP request behind it — visibly
  different from a request-tagged line.
- **No new spec/ test for log content** — same reasoning as crit 8/9's
  timing-dependent behavior: `spec/` only talks to the running app over
  HTTP, it doesn't capture the process's own stdout, so whether the right
  line actually gets printed is a judged claim, verified by hand (see
  Stage heading `## Decisions behind this stage`).
- **Peak-times view (`plan.md`'s #7), bonus only, attempted last** — per
  the user, written into this plan but not built until logging itself is
  solid (Stage 7, explicitly the first thing cut if short on time).

Explicitly **not** this crit: inventing a new identity/authorization
mechanism (already shipped), new queue features, UI redesign.

## Stages

### Stage 1 — logging infrastructure (`src/logging.ts`)

New module, no dependency on Hono or Drizzle types — just stdout
formatting and tag propagation.

- `genTag(): string` — a short random tag (6 hex-ish characters), cheap,
  collisions don't matter (it's a narration aid, not a primary key).
- **Tag propagation via `node:async_hooks`'s `AsyncLocalStorage`, not a
  module-level variable.** A module-level "current tag" variable would be
  unsafe here specifically *because* crit 10's whole point is two people
  acting concurrently — two in-flight requests interleave on Node's event
  loop (e.g. both mid-`await`), and a shared mutable variable would let
  one request's tag bleed into the other's log lines, corrupting the exact
  thing this crit is supposed to demonstrate. `AsyncLocalStorage` keeps
  each request's (or each tick-iteration's) tag isolated to its own async
  call chain, with no new dependency (it's Node built-in).
- `withTag<T>(tag: string, fn: () => T): T` — runs `fn` with `tag` bound
  for the duration of its (possibly async) call chain. Used once per
  incoming POST request (Stage 2) and once per tick iteration (Stage 4).
- `ensureTag<T>(fn: () => T): T` — runs `fn` under the *current* tag if
  one is already bound (so a queue function called synchronously inside a
  request handler reuses that request's tag), otherwise mints a fresh one
  (so the same function called from the realtime tick, with no ambient
  request, still gets a tag). This is what lets `settleMachine` and
  `processOffers` (Stage 4) need zero parameters changed at any of their
  existing call sites — both request handlers and the tick call them
  exactly as before.
- `logEvent(name: string, fields?: Record<string, string | number>): void`
  — prints `[tag] name key=val key=val` to stdout via `console.log`, tag
  from the ambient context (or a fresh one-off tag if called with no
  context bound at all, so it never throws). A value containing a space
  is wrapped in quotes (queue.ts's own error messages, e.g. `"not your
  reservation"`, do) so the line stays one `key=value` token per field.
- `logRequest(method, path, status, ms, user): void` — prints the fixed
  shape `[tag] METHOD path status XXms user=Y`.

No logging call anywhere yet — this stage is just the primitive.

**Verify:** a quick standalone script (or a scratch route) confirms two
overlapping `withTag` calls — started concurrently, each sleeping a tick
before logging — never see each other's tag. This is the one property
the whole crit depends on, so it's worth confirming in isolation before
wiring it into real routes.

### Stage 2 — request-line logging (POST only)

- One `app.use` middleware in `src/app.ts`, registered first, before any
  route: if `c.req.method !== "POST"`, call `next()` and return (no
  logging — this is where GETs are explicitly excluded, per scope above).
  For a POST, mint a tag, run the rest of the chain inside
  `logging.withTag(tag, next)`, then log the request line once `next()`
  resolves (status is final by then).
- `user` is the `person` cookie if present, else `"-"` (matches the
  brief's own example format, and covers `POST /identity` itself, which
  runs before any cookie is set).

**Verify:** `pnpm dev` locally, a few curl POSTs (identity, reserve,
cancel) each produce exactly one request line; a GET produces none.

### Stage 3 — named events for user-triggered actions

Business-meaningful event lines, layered on top of Stage 2's request
line (which already fires for every POST regardless of whether a named
event below also fires — so even an action this stage forgets to name
still leaves *some* trace).

- `POST /identity`: `identity_set` with `room`. `POST /identity/clear`:
  `identity_cleared` with `room`.
- `POST /machines/:id/reservations` (join): success →
  `reservation_joined` with `reservation`, `room`, `machine`, `type`;
  the `MAX_ACTIVE_PER_TYPE` 409 → `reservation_join_denied` with `room`,
  `machine`, `reason`. (The plain 400 for a malformed washing/drying type
  is not logged as a named event — that's a form mistake, not a decision
  about who gets to do what; Stage 2's request line already shows the
  400.)
- **`actionRoute` gains a `name` parameter** (one-line change at each of
  its 8 call sites in `app.ts`): on success, `logEvent(name, {id, room})`;
  on failure, `logEvent(\`${name}_denied\`, {id, room, reason})`. This
  covers claim/start/cancel/finish/dismiss-notice/dismiss-dryer-
  prompt/accept-offer/decline-offer uniformly, including the
  brief's own authorization example for free: two rooms, one tries to act
  on the other's reservation, `loadOwned` already returns the 403 — this
  stage is what makes that 403 show up as a named, room-attributed line
  instead of disappearing into an unlabelled request row.
- `POST /reservations/:id/queue-dryer`: success → `dryer_queued` with
  `reservation` (the wash), `room`, `machine` (the chosen dryer); failure
  → `dryer_queue_denied` with `reason`.

**Verify:** exercise every action once locally (including one deliberate
cross-ownership attempt — room A tries to cancel room B's reservation)
and confirm the exact event name + fields appear. This cross-ownership
check is also the dry run for the crit's own authorization story.

### Stage 4 — tick-driven system events

The queue's own automatic decisions, not triggered by any request:

- **`settleMachine(machineId, now)`**: wrap its existing body in
  `logging.ensureTag(() => { ...unchanged... })` — one line at the top,
  nothing else about the function changes. Inside `moveBackOnePlace`, add
  two calls sharing that same ambient tag: `reservation_moved_back`
  (`reservation`, `room`, `machine`) and `reservation_moved_up`
  (`reservation`, `room`, `machine`) — both under one tag is the whole
  point (per the user: cheap, and it's what lets the narration say "these
  two lines are one swap, the system's own call," not two unrelated
  events). The running→done auto-transition (wash's own timer elapsed,
  nobody clicked "end the wash") logs `reservation_completed_auto`
  (`reservation`, `room`, `machine`) — named differently from Stage 3's
  `reservation_finished` (the manual "end the wash early" action) so the
  two are never confused reading the log.
- **`processOffers(now)`**: same `ensureTag` wrap. Expiring an overdue
  offer logs `offer_expired` (`offer`, `reservation`, `room`, `machine`);
  creating a new one logs `offer_created` (`offer`, `reservation`,
  `room`, `machine`).
- **Why `ensureTag` and not a fresh tag every time:** both functions are
  called two ways — directly inside a request handler (`join`/`cancel`/
  `finish`/`acceptOffer` all call `settleMachine` synchronously as part of
  handling one POST) and from the realtime tick with no request behind
  it at all. `ensureTag` reuses whatever tag is already bound (the
  request's own, from Stage 2) in the first case, and mints a fresh one
  in the second — so a swap that happens as the *direct, synchronous*
  consequence of someone cancelling correctly shares that cancel's own
  tag, while a swap the tick notices on its own (nobody made a request at
  all — crit 9's "passive expiry" case) gets a tag of its own. No call
  site outside `logging.ts` needs to know which case it is.

**Verify:** let a real claim window lapse untouched (same manual-
verification shape as crit 8/9's other timing-dependent rules — nothing
here automates waiting out a real window) and confirm
`reservation_moved_back`/`reservation_moved_up` appear under one shared
tag with no request line anywhere near them. Separately, let a `test`
wash run to completion untouched and confirm `reservation_completed_auto`
fires (vs. clicking "End the wash," which should instead produce Stage
3's `reservation_finished`).

### Stage 5 — document it

- New ADR, `docs/adr/0006-action-logging.md`: the log line shapes (request
  line vs. named event line), why only POST (GET/SSE-refresh noise would
  bury the signal the brief actually wants — "who did what," not "which
  fragment re-rendered"), why tags and not full request correlation IDs
  threaded everywhere, why tick-driven events get their own tag instead of
  inheriting a request's. Explicitly **not** re-deciding the
  authorization/identity model — cross-references ADR 0002/0004 (identity)
  and `queue.ts`'s `loadOwned`/`loadOwnedOffer` as where that's already
  decided and enforced; this ADR is about making it *observable*, not
  about what it is.
- States plainly: the log format and event coverage are **judged**, not
  **enforced** — `spec/` talks to the running app over HTTP, not its
  stdout, so nothing automatically checks a given action actually printed
  the line this plan says it should. Verified by hand per-stage above,
  same as crit 8/9's own timing-dependent rules.
- Confirms (one line, since it's already true and costs nothing new):
  identity is a bare room number, never a secret by ADR 0002's own
  argument, so logging it in full is not a "never log this" violation —
  nothing else the app touches (no tokens, no cookies' raw values) goes
  into a log line.
- `README.md`'s "what's enforced, what's judged" section gets one new
  sentence once this is verified, not before.

### Stage 6 — rehearse the actual crit format

Before trusting this at the real crit: open the deployed app in two
separate Chrome profiles (incognito counts) using only the `*.fly.dev`
URL, confirm getting in needs nothing beyond what's on the page (already
true — a typed room number, no shared cookie/localStorage trick), act as
two different rooms including one deliberate denied cross-ownership
attempt and one real expiry, and narrate from `flyctl logs -a <repo>`
alone, without touching the app myself — the literal dry run of what the
crit asks for. If the narration is hard to follow from the raw log
stream, that's a signal to come back and adjust field names or event
coverage, not a sign the demo plan is wrong.

### Stage 7 — bonus: peak times from logs (`plan.md`'s #7)

Only attempted once Stages 1–6 are built, verified, and deployed — first
thing cut if short on time, per `plan.md`'s existing flag on this
feature.

**Scope note, decided now so it isn't re-litigated mid-build:** stdout
logs alone can't back a "peak times" feature that has to *persist* (a
fixed project requirement) — Fly doesn't give the app a queryable history
of its own past stdout, and a redeploy/restart loses whatever a log
tail isn't actively capturing. If attempted, this needs its own small,
separate, persisted table (e.g. one row per logged event, written
alongside the `console.log` call rather than instead of it) — genuinely
new schema, through `drizzle-kit generate` like any other schema change,
not a reuse of the crit's core logging mechanism. Flagging this now so
"bonus feature" isn't assumed to be free once the core logging exists.

### Stage 8 — wrap-up

- Grow `plan.md`: update the feature list's status for #7 (if attempted),
  current-state section, and the crit 10 row in "Mapping onto crits."
- `PROCESS.md` rewritten in full again (900–1100 words) — covering the
  logging design and why it's shaped the way it is, alongside the
  already-documented earlier crits.
- Remind the user to write `reflections/crit-10.md` (their own).
- Redeploy, confirm `pnpm check` green, and do a real two-Chrome-profile
  check against the **live** app (not just local) — `flyctl logs -a
  <repo>` reading the real deployed stdout, not the dev server's.

## Decisions behind this stage

1. **Logging is judged, not enforced** — `spec/` only exercises the
   running app over HTTP; nothing captures stdout, so whether a given
   action actually produced the log line this plan describes is verified
   by hand, the same shape as crit 8/9's timing-dependent rules (claim
   windows, swaps) that nothing automates waiting out either.
2. **Only POST requests are logged, by the user's explicit call** — the
   app's own SSE-driven GET re-fetches would otherwise dominate the log
   stream with routine polling that isn't "someone doing something,"
   defeating the brief's own point (narrate who did what from the logs).
3. **Tick-driven events get their own tag, by the user's explicit call**
   — low implementation cost (`ensureTag` is one line per function), and
   directly supports narrating "the system made this call on its own" at
   the crit, which is exactly the move-back-one/offer mechanism crit 9
   already built but crit 8 never had to make legible from outside.
4. **AsyncLocalStorage over a module-level tag variable** — not a style
   preference: a shared mutable tag would actively mislabel concurrent
   requests, which is the one failure mode this crit is specifically
   checking for (two people acting at once, told apart correctly).
5. **The bonus peak-times view needs its own persisted table, not reuse
   of the stdout logging** — decided now, before Stage 7 is attempted, so
   it isn't discovered mid-build that "just read the logs" can't actually
   survive a restart.
