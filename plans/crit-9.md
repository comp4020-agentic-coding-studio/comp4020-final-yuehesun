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
- **Visual design pass (Stage 6), last, blocked on the user**: the current
  UI is still crit 8's first-pass styling. The user flagged it as "too
  ugly" but wants function finished first — they'll bring reference UI
  examples and image/icon assets once the functional stages are done,
  rather than the agent picking a direction unprompted.

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

### Stage 1.5 — drop the reservation detail page; add "end the wash"

Two usability problems the user found by actually using the app, both
settled before Stage 2 since Stage 2's notice plan below depends on where
actions live:

**1. The reservation detail page is redundant and adds a pointless hop.**
`myStatusBlock` (pinned at the top of the home page) already renders
`actionButtons(row)` — claim, start, cancel are already right there. The
only thing `GET /reservations/:id` adds is an extra click via "Manage
your reservation →" to reach a page that shows the same actions again.
This also cuts against `README.md`'s own argument (calm technology: the
queue should take care of itself, not make you hunt for the controls) —
an action already surfaced on the page you land on shouldn't need a
second page to actually use.

- Remove the "Manage your reservation →" link and the `reservationPage`
  function; `machineCard` renders `actionButtons(row)` directly for the
  viewer's own row, the same as `myStatusBlock` already does.
- `GET /reservations/:id` loses its page but not the route itself — it now
  just bounces straight to `/` (`c.redirect("/", 303)`). This has to stay
  a real route, not a removed one: `POST /machines/:id/reservations`'s
  `Location` header still has to point at `/reservations/<id>` (`spec/`'s
  `join()` client parses the id out of that header string, never actually
  following it), but a real browser's "Reserve" form submit *does* follow
  a 303 — caught by the user clicking it for real after the page was
  removed outright the first time, which 404'd. The action routes
  themselves (`/reservations/:id/claim` etc.) are untouched.
- Nothing shared with anyone outside the app depends on this URL (no
  sharing/bookmarking use case exists in `plan.md`'s user story), so
  there's no deprecation concern.

**2. `running` has no way out.** `queue.cancel()` only accepts `waiting`
or `claimed` — once a wash is `running`, nothing lets it end early. Real
laundry sometimes needs to stop early (an emergency, a mistake); this is
also the one thing that makes crit 9's manual real-time verification slow
to repeat, since otherwise ending a run means waiting out its real
duration or hand-editing the database.

- **Add "end the wash"** (not "pause"): a `running` reservation can be
  marked `done` early, same end state `settleMachine()` already produces
  for a wash that finished normally — no new status, no change to
  `queueFor`'s logic.
- **No "pause."** Rejected: this app never actually controls a machine
  (`README.md` is explicit that "start" just records a timestamp) — a
  pause would mean inventing a frozen-duration concept purely in software,
  complicating every downstream estimate (`queueFor`'s whole chain assumes
  a fixed duration) for a real-world event (stepping out mid-wash to add
  a sock) that doesn't actually change when the machine frees up for the
  next person. The queue only cares when a machine is free again, not
  whether someone opened the door in between.
- **Confirmation required**: the form's own `onsubmit="return confirm(...)"`
  (plain browser-native `confirm()`, not htmx's `hx-confirm` — this form
  is a normal POST with a 303 redirect like every other action here, and
  `hx-confirm` only intercepts htmx-issued requests) blocks submission
  unless the user accepts, since this ends something irreversible and the
  person clicking it might be the next queue position's neighbor acting
  by mistake, not just the machine's own owner.
- New route: `POST /reservations/:id/finish` (parallel shape to the
  existing `claim`/`start`/`cancel` action routes, owner-only via the same
  `loadOwned` check `queue.ts` already uses).

Verify: claim, start, then end a wash early — confirm the machine becomes
free/unclaimed-for-the-next-person immediately rather than waiting out
the original duration, and the confirm step actually blocks a single
accidental click.

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

**Both people affected have to be told, not just repositioned.** A rule
that silently moves people around is worse than crit 8's blunt one: at
least "ejected" was visible (your reservation just disappeared), where a
silent swap means someone's position changed for a reason they were never
shown. Per discussion, both sides of the swap get a one-line notice in
the one place they already look to check their own status — the pinned
"your status" block (`myStatusBlock`), now the only place a reservation's
own controls live after Stage 1.5 — not a separate notification system or
a toast.

- **The person who moved back:** a neutral, factual line, not a scolding
  one — "Your claim window passed, so you moved back one place." (not
  "You missed your turn.")
- **The person who moved up because of it:** says why it happened, not
  just that it did — "The person ahead of you missed their window — it's
  your turn now."
- **Scope:** only this same-queue case. Stage 3's offers already require
  an explicit accept/decline click, which is itself the confirmation —
  no separate notice is layered on top of an offer.
- **Storage:** one nullable column on `reservations` (e.g. `notice: text`,
  values `"moved_back"` / `"moved_up"`, or `null`) rather than a separate
  notices table — a reservation only ever has one outstanding notice at a
  time, so there's nothing to list. `settleMachine()`'s swap sets it on
  both rows it just swapped.
- **Dismissal:** a small inline "Got it" button clears the column
  (`POST /reservations/:id/dismiss-notice` or folded into the existing
  action routes) — doesn't auto-expire on a timer, since the whole point
  is confirming the person actually saw it, not that enough time passed.
- **If a new notice arrives before the old one's dismissed:** the new one
  replaces it (one column, one value) rather than stacking a history —
  this reports current truth, not a log; a log of past notices isn't
  something either `README.md`'s argument or the fairness decision needs.
- **No `spec/` test planned for this** — same as the rest of crit 8's
  timing-dependent behavior (nothing currently automates "wait out a real
  3-minute window"), verified by hand instead: two sessions, one actually
  left to time out, confirm both notices appear with the right wording and
  clear on their own "Got it" independently.

Verify alone, before Stage 3: two people in one machine's queue, the
front misses their window, confirm they're now second rather than gone,
both notices appear with the text above, dismissing one doesn't clear the
other, and the real-time push carries the swap (and the notice) to both
browsers within a second.

### Stage 3 — offer system (early-opening case)

New mechanism for the case crit 8 never had: a machine of your type goes
fully idle (zero active reservations) while someone elsewhere, on a
different machine of the same type, is still waiting — `plan.md`'s
"earlier machine" offer. (The person-ahead-missed-their-turn case from
`plan.md`'s User story is already covered: Stage 2's move-back-one swap
*is* that case, for the same queue — no separate offer needed there since
there's always a definite "next person" to hand the turn to directly.)

**Schema:**
- New `offers` table — `id`, `reservationId` (who it's offered to),
  `machineId` (the idle machine), `offeredAt`, `respondBy` (`offeredAt` +
  2 min), `status` (`pending` / `accepted` / `declined` / `expired`).
- `reservations` gets a new nullable `offerId` column (FK `offers.id`),
  set only on the new reservation created by accepting an offer. This is
  how `settleMachine` knows to give it a 10-minute claim window instead
  of the normal 3-minute one (`front.offerId != null ? OFFER_CLAIM_WINDOW_MS
  : CLAIM_WINDOW_MS`), and it's also how "my pending/active offer
  history" is queryable without a separate join table.

**Eligibility algorithm** (runs in the tick, not a route handler — same
"tick does the detecting" reasoning as Stage 1): for an idle machine of
type T with no pending offer already outstanding,
1. List every `waiting` reservation on every *other* machine of type T,
   ordered by `joinedAt` ascending (longest-waiting first).
2. Skip anyone who already has a pending offer for any machine (never
   double-offer the same person), or a `declined`/`expired` offer already
   on record for *this* machine (prevents an instant re-offer ping-pong
   back to someone who just said no — see limitation below).
3. Skip anyone whose current `scheduledStartMs` is already `<= now` —
   switching gains them nothing, per `plan.md`'s "someone already about
   to start on their own machine gets skipped."
4. The first remaining candidate gets the offer.

**Documented limitation, by design, not an oversight:** step 2's
decline/expire exclusion is sticky for as long as the machine stays
continuously idle — it doesn't reset if the machine is used and goes
idle again later (that would need tracking "which idle spell" an offer
belongs to, which this doesn't). Accepted as a reasonable simplification:
worst case, someone who declined an opening doesn't get re-asked about
that exact same opening — not a fairness problem, just slightly
conservative.

**Offer processing, once per tick, before per-machine digests are
computed** (so the same tick's broadcast reflects it): expire any pending
offer past its `respondBy`, then run the eligibility algorithm for every
now-offer-free idle machine. Fires the generic `changed` SSE event
whenever anything changed — offers aren't tied to one `QueueRow`, so they
can't ride the existing per-machine digest check.

**Routes:** `POST /offers/:id/accept`, `POST /offers/:id/decline` —
owner-only (the offer's reservation's `personName` must match), same
`loadOwned`-style check as every other action route.

**Accept (decided):** only valid while the original reservation is still
`waiting` — already `claimed`/`running` means they're committed to their
own machine, accepting doesn't make sense, 409. On success: original
reservation → `cancelled` (same effect as `cancel`, bumps its own queue
up by one); a new `waiting` reservation is created on the offer's
machine, same `washingType`/`durationMinutes` carried over, `offerId` set
to this offer; `settleMachine` starts its (10-minute) claim window
immediately, since the machine was idle. Offer → `accepted`. No re-check
against `MAX_ACTIVE_PER_TYPE` — this is a swap, not an addition; the
person's active-reservation count for this type is unchanged.

**Decline (decided):** marks the offer `declined` and stops there — the
*next* tick's offer processing naturally finds the next eligible
candidate, rather than duplicating candidate-selection logic in the
route handler. Original reservation/place untouched.

**No eligible candidate at all (wording fix from `plan.md`):** `plan.md`
says this falls back to "free but unclaimed" — but a machine nobody's
ever been offered to, with zero reservations on it, is `machine-free`
(green "Free," open to anyone) in the app's existing vocabulary, not
`machine-unclaimed` (amber, which specifically means someone's reserved
it but hasn't claimed yet). Same underlying intent ("visibly claimable by
anyone"), just the already-correct existing green state, not a new one.

**Accepted-but-not-scanned:** handled entirely by `settleMachine`'s
existing claim-window logic once `offerId` gives it the 10-minute window
— if it lapses, Stage 2's `moveBackOnePlace` runs the same as any other
missed window. With nobody else queued on that machine yet (the common
case, since it was just idle), there's nothing to swap with — same
graceful no-op Stage 2 already has for a solo queue, which reads to a
viewer as the machine sitting at "unclaimed" past its deadline. No new
code path.

Verify: one machine goes idle with an eligible person waiting elsewhere
on a different machine of the same type — confirm the offer appears for
them (not anyone already about to start); accept cancels their old spot
and claims the new machine with a visibly longer countdown; decline hands
it to the next eligible person within one tick; with nobody eligible, the
machine just reads as plain "Free."

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

### Stage 5 — superseded

Originally a stretch slot for dryers, not attempted during Stages 1–4.
Per discussion, dryers are now explicitly scheduled — see Stage 8, done
after Stage 6's visual pass so the new illustrated machine icon style
only needs to be drawn once, for both machine types together.

### Stage 6 — visual design pass

The current UI is still crit 8's first-pass styling — functional, but not
visually refined. Deliberately deferred until every functional stage
above (1–5) was built and verified, so this redesign sits on top of
settled behavior, not something still changing underneath it.

**References gathered** (`research/ui-references.md`, `research/1.png`):
the openHAB community washing-machine widget (fetched and verified
directly), CSC GO's real marketing/app-store pages (verified; the user's
own UMN link 403'd and isn't relied on directly), the user's own
descriptions of LaundryView/MIT/campus-laundry UI patterns and
queueing-system UX (Appointedd, vQueue, Qwaiting), and a style reference
image the user saved directly into `research/` (a package-delivery
tracking app's "order status" screens) — this one the agent *did* view
directly, unlike the earlier unreachable Instagram link it stood in for.

**What the reference image actually shows** (`research/1.png`): pale-cyan
page background, white rounded cards, a row of 4 step-dots connected by a
thin line (filled teal circle + checkmark for done, hollow outline for
upcoming) — a genuinely linear, one-directional sequence (order placed →
processing → cleaned → delivered). A large hand-drawn-style illustration
(a washing machine with detergent and a basket; a cleaned bag) sits below
the dots, then a bold status heading, one line of supporting text, a
single pill-shaped primary button ("CALL AGENT"), and a quiet text link
below a divider for a secondary action ("ORDER DETAILS").

**What's adopted, what's not, and why** — judged against `README.md`'s
calm-technology argument and this app's own mechanics, not copied
wholesale:

- **A status-dot sequence (waiting → claimed → running → done), adopted
  — but scoped to one reservation's own lifecycle, not queue position.**
  The reference material's step-dot pattern (filled = done, hollow =
  upcoming) reads naturally as a *linear, one-directional* progress
  indicator. Queue *position* in this app is not linear in that sense —
  the move-back-one escalation can send someone backward, which a
  classic progress-dot UI has no honest way to represent. Position stays
  expressed as the existing "#N in line" text. The dot sequence is used
  only for a single reservation's own state machine (waiting → claimed →
  running → done), which genuinely is linear, so it's an honest use of
  the pattern there. It sits next to the existing text badge, not instead
  of it (colour/shape is never the only cue, per `plans/crit-8.md`'s
  accessibility rule).
- **Washer/dryer colour coding (light blue / orange), noted but not
  implemented this stage.** Clean pattern, directly reusable once a
  second machine type exists (crit 9 Stage 5's dryers weren't attempted,
  so there's only one type to colour right now) — recorded here so the
  palette is designed with that extension in mind (one more accent colour
  reserved, not retrofitted later), not built for a type that doesn't
  exist yet.
- **"Done but not collected," not added.** MIT's own team removed this
  exact state after finding it confused users — and `plan.md`'s own gap
  list already has this feature (#6) unscheduled. Independent confirmation
  that skipping it for now, rather than designing speculative UI for an
  unbuilt feature, is the right call.
- **Position + estimated wait + a clear turn alert, kept as the already-
  implemented core — this stage makes them visually louder, not new.**
  The reference queueing systems (Appointedd, vQueue, Qwaiting) converge
  on exactly these three things mattering most; this app already has all
  three (`positionLine`, `rowTimeChip`'s "Est. ready at"/"Claim by", the
  notice banner) — the redesign's job is visual hierarchy, making the one
  number someone's actually scanning for the loudest thing on the card,
  not inventing new mechanics.
- **No manual "defer my turn" button.** Appointedd's deferral button is
  close to this app's move-back-one escalation, but deliberately
  different in kind: that's a user-initiated action, this app's rule is
  system-enforced when a window is missed, specifically because
  `README.md`'s argument is that the queue should watch the clock so the
  resident doesn't have to. Adding a manual defer button would be asking
  the user to do the remembering the whole app exists to remove.
- **Colour palette: shift toward the reference's pale-cyan page
  background and white rounded cards, within the existing semantic
  colours.** `--good`/`--warning`/`--info`/`--mine` keep their current
  *meanings* (free/urgent/running-or-claimed/yours) — this is a palette
  refresh, not a re-mapping of what each colour means, since `spec/`'s
  and the accessibility rule's guarantees don't depend on the exact hex
  values. `--page` moves from its current near-white to a pale cyan;
  cards (`--surface`) stay white with more generous corner-rounding to
  match the reference.
- **Hand-drawn-style illustrated SVG icons, not flat line icons —
  decided over keeping the current minimal style.** The reference's
  machine/package illustration is noticeably more detailed than this
  app's current plain-line machine icon (a circle in a rectangle). Still
  hand-authored inline SVG, not an external image asset or icon library
  (ADR 0003's "no image assets, no icon library" constraint is about
  *files*, not about how detailed a `<svg>`'s own paths are) — but a
  real increase in SVG complexity and a new maintenance cost worth naming
  up front: a second machine type (dryers, Stage 8) needs its own
  illustration drawn in the same style, not a copy-paste recolour.

**Scope:** restyle the existing structure (machine cards, chips, badges,
the pinned "your status" block, the notice banners from Stage 2, the
offer cards from Stage 3) against the reference image — not a rebuild of
the page structure, routes, or any behavior, which stay exactly as the
functional stages left them. Re-verify accessibility (colour-plus-text,
keyboard focus, real `<button>`/`<a>` elements) holds after restyling,
per `plans/crit-8.md`'s existing accessibility rules.

**Build order:** palette/card shape first (lowest risk, every page
benefits immediately), then the status-dot sequence on the pinned "your
status" block and reservation rows, then the illustrated machine icon
last (the most time-consuming piece, and the one later stages — dryers —
will need a second version of anyway).

### Stage 8 — dryers, plus an auto-queued dryer reservation

Two machines, not ten: convert 2 of the existing 10 seeded washers to
dryers (no new machine rows) and add a feature the user asked for —
reserving a washer offers to also queue you for a dryer, timed so you
don't lose it before your wash is even done. `plan.md`'s calm-technology
argument extends naturally here: the same cost (standing around to not
lose a slot) exists at the dryer step too, not just at the washer step.

**Converting 2 machines, in production, not just the seed.** `db.ts`'s
`seedMachinesIfEmpty` only runs against an empty table — crit 8's
deployment already seeded 10 washers, so editing that function does
nothing on the live database. A one-time, idempotent migration-time
step is needed: on boot, if machines 9 and 10 are still labelled/typed as
washers, rename and re-type them (`"Washer 9"` → `"Dryer 1"`, `type:
"washer"` → `"dryer"`) and leave the other 8 untouched. Idempotent so it
only acts once, and safe to leave in place rather than deleting after
the first successful boot — simpler than a one-shot migration script
with no real cost to keeping it.

**Dryer-specific duration options.** A separate `DRYING_TYPES` lookup
(same shape as `WASHING_TYPES`), not a reuse of the washing durations —
drying genuinely runs longer in practice, and the two should be free to
diverge (e.g. Quick dry 20 min / Normal dry 40 min / Heavy dry 60 min;
exact numbers aren't load-bearing, just distinct from the wash durations
so the two aren't secretly the same lookup table wearing two names).

**The real problem: a naive "pick the soonest dryer" would reserve a slot
you can't actually use yet.** If a dryer is sitting idle right now, the
app's existing rule starts a 3-minute claim window immediately — but the
resident is still at the washer, not standing at the dryer. By the time
their wash finishes, that window would already have expired, costing
them a move-back-one penalty for a window they were never actually able
to use. The fix:

- New nullable column on `reservations`: `notBeforeReservationId` (FK to
  another reservation). When set, `settleMachine()`'s "front of queue,
  waiting" branch does not start `turnStartedAt` (and so the claim window
  does not begin) until the referenced reservation's status is `done`.
  Everything else about queue position is unaffected — the dryer
  reservation still holds a real place in that dryer's queue, in join
  order, from the moment it's created; only its *claim clock* waits.
- **Dryer selection, corrected per the user's catch:** not "whichever
  dryer is empty right now," but for each of the 2 dryers, compute
  `max(washEndMs, thatDryerQueue'sOwnEstimatedStartForANewArrival)` —
  the later of (a) when the wash actually finishes and (b) when that
  dryer would actually be free for a new arrival — and pick whichever
  dryer gives the *earlier* of those two maximums. This is the same
  "would switching genuinely be earlier" reasoning Stage 3's offer
  eligibility already uses, applied here at reservation time instead of
  via a tick-driven offer.
- **Offered, not automatic** — same reasoning as Stage 3's offers: only
  the resident knows whether they actually want a dryer slot held for
  them. Surfaced as a dismissible prompt in the pinned "your status"
  block right after a washer reservation succeeds ("Want to queue a
  dryer for after this wash? It'll be ready when you are — unclaimed
  slots don't start their countdown until your wash is done."), not a
  checkbox buried in the reservation form itself.
- **Cancelling the washer reservation cancels the dependent dryer
  reservation too** (if not yet claimed) — there's no reason to hold a
  dryer slot for a wash that isn't happening.

**Scope check against existing rules:** `MAX_ACTIVE_PER_TYPE` (2 per
type) still applies per machine type independently — queuing a dryer
reservation counts against the dryer cap, not the washer cap, so this
doesn't let one resident monopolize more washers than the existing rule
already allows.

Verify: convert machines 9/10 on a fresh boot, confirm they show as
dryers with the new icon and duration options; reserve a washer with the
dryer prompt accepted, confirm the dryer reservation's claim window does
not start until the washer reservation reaches `done`; cancel a washer
reservation with a pending dependent dryer reservation and confirm the
dryer reservation is also cancelled; confirm the dryer-selection choice
matches the later-of-two-maximums reasoning above with a real multi-
dryer scenario.

### Stage 9 — wrap-up

- Grow `plan.md`: update the feature list's status for #1, #12 (now
  shipped), current-state section, crit 9 row in "Mapping onto crits," and
  #5/#10 once Stage 8's dryers land.
- `PROCESS.md` rewritten in full again (900–1100 words, per `CLAUDE.md`'s
  updated numbers) — not appended to — covering Stages 6 and 8 as well as
  the already-documented Stages 1–4.
- Remind the user to write `reflections/crit-9.md` (their own, not
  drafted by the agent) if not already done.
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
