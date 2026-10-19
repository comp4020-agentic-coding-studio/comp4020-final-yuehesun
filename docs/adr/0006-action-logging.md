# 0006: Action logging — tagged request/event lines, POST-only

## Status

Accepted. This is crit 10's required logging, demonstrated at the crit
against two classmates using the app from its URL alone.

## Context

The app has been multi-user since crit 8: identity is a bare room number
in a cookie (ADR 0002/0004), and every state-changing route checks
ownership on the server before acting (`queue.ts`'s `loadOwned` and
`loadOwnedOffer`, checked again by `spec/queue-fairness.test.ts`'s
"never two active claims" invariant). Crit 10 doesn't redecide any of
that — it asks for something new on top: the server has to say, out
loud, who did what, so that at the crit the student can narrate two
classmates' actions purely from `flyctl logs -a <repo>`, without
touching the app.

Before this crit, the only thing the process ever printed was
`realtime.ts`'s `console.error` on a tick failure — nothing recorded an
actual reservation, claim, or denial.

## Decision

**Two kinds of log lines, both plain `console.log` to stdout** (what
`flyctl logs` reads in production, what the terminal shows in dev — no
new infrastructure, no log file, no third-party service):

- A **request line** for every state-changing request:
  `[tag] METHOD path status XXms user=room304`.
- A **named event line** for every business-meaningful outcome:
  `[tag] event_name key=value key=value ...`, e.g.
  `[tag] reservation_claimed id=12 room=room304` or, on denial,
  `[tag] reservation_cancelled_denied id=12 room=room108
  reason="not your reservation"`.

**Only POST requests get a request line — GET requests are never
logged.** This app's own real-time transport (crit 9, ADR implied by
`plans/crit-9.md` Stage 1) means every open browser tab re-fetches
`/machines/:id/card` or `/my-status` on every state change, over and
over, for as long as the tab stays open. Logging those GETs would flood
the log stream with routine polling that nobody actually did — exactly
the opposite of what the brief asks for (narrate who did what). A
visitor loading `/` for the first time also isn't logged, for the same
reason: it's not an action on shared state.

**Identity is the room number in full, never redacted.** ADR 0002
already decided a room number isn't a secret — it's the one thing the
queue is allowed to know, on purpose, specifically so it *can* be
reported back (the uncollected-clothes nudge, the fairness notices).
Logging it in full is consistent with that, not a new exposure; nothing
else the app touches (cookie values, request bodies beyond the one typed
field) goes into a log line.

**Every log line carries a short tag in brackets, scoped per request or
per tick iteration via `node:async_hooks`'s `AsyncLocalStorage`
(`src/logging.ts`), not a module-level variable.** This matters
specifically *because* crit 10's own demo is two people acting at the
same time: a plain shared variable holding "the current tag" would let
one in-flight request's tag bleed into another concurrent request's log
lines the moment either one awaits anything, mislabelling exactly the
scenario this crit is built to show working correctly.
`AsyncLocalStorage` keeps each call chain's tag isolated from every
other one running at the same time, with no extra dependency (it's a
Node built-in) and no parameter to thread through every function call.

**Tick-driven system decisions get their own tag, not a request's.**
`settleMachine`'s move-back-one swap (ADR 0005) and `processOffers`'
offer creation/expiry aren't triggered by any request at all when the
realtime tick (crit 9) is what notices them — a claim window lapsing
with nobody touching either browser tab is the whole point of "passive
expiry." Both functions call `logging.ensureTag`, which reuses the
current tag if one is already bound (so a swap triggered as the direct,
synchronous consequence of someone's own cancel shares that cancel's
request tag) or mints a fresh one otherwise (so a swap the tick notices
on its own gets a tag that's visibly not attached to any request). Both
sides of one swap — `reservation_moved_back` and `reservation_moved_up`
— are logged under that one shared tag, so reading the log shows them as
one decision the system made, not two unrelated lines a reader has to
piece together by timestamp alone.

**Rejected alternative: log every request, including GETs.** Simpler to
implement (one middleware, no method check) and closer to the course's
own reference example (`GET /rooms/1 200 8ms user=...`). Rejected here
specifically because this app polls itself far more than the reference
app's example does — crit 9's SSE transport means an idle tab still
issues a GET on every tick-detected change elsewhere on the page, not
just on the viewer's own actions. Including those would make `flyctl
logs` mostly noise at the crit, undermining the actual ask (narrate who
did what from the logs) rather than serving it.

## Consequences

- Nothing about the authorization model changes — this ADR documents how
  an already-enforced decision (ADR 0002/0004, `loadOwned`) becomes
  *observable*, not what it is. A denied cross-room action (the brief's
  own authorization example) now produces a named, room-attributed
  `*_denied` event instead of disappearing into an unlabelled 403.
- The log format and event coverage are a **judged** claim, not an
  enforced one: `spec/` only exercises the running app over HTTP, it
  never captures the process's own stdout, so nothing automatically
  checks that a given action actually printed the line this ADR
  describes. Verified by hand, the same shape as crit 8/9's own
  timing-dependent rules (claim windows, the move-back-one swap) that
  nothing in `spec/` automates waiting out either.
- A tick-driven event (`reservation_moved_back`, `offer_expired`, ...)
  with no request line near it in the log is not a bug — it's the
  visible signature of a passive expiry, the one thing crit 8 never had
  to produce at all and crit 9's tick exists specifically to catch.
- The bare `tag` alone doesn't distinguish a request's tag from a tick
  iteration's — both are drawn from the same random format. Telling them
  apart at a glance means reading what follows the tag (a request line
  starts with an HTTP method; an event line doesn't), not the tag
  itself. Acceptable for a narration aid read by a person, not something
  parsed by a machine.
