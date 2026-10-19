# Plan — Laundry Queue (overall vision)

## Read first

- The final project brief and spec:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/
- Crit 8 "It's alive!" (week 9):
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/
- Crit 9 "All at once" (week 10) and crit 10 "Fly by instruments" (week 11)
  specs on the course site describe what later crits need to satisfy.
- `spec/README.md` in this repo (the two fixed invariants, and that
  `spec/*.test.ts` is ours to extend).
- `CLAUDE.md` in this repo for the working rules.
- `docs/adr/` for decisions already locked in.

This file is the **whole-project vision** — it doesn't get rewritten, only
grown. Each crit has its own plan file under `plans/` (e.g.
`plans/crit-8.md`) with that crit's stage-by-stage detail; those files link
back here for background instead of repeating it.

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

## User story

In the real world, scanning a machine's QR code is tied to payment and
starting the cycle in one motion — machine status naturally comes from
that scan, not from someone remembering to log it by hand. We don't have
real washing machines to scan, so `README.md` explains that starting a
machine is simulated as an on-page interface: in testing, you click the
machine on the page and choose a washing type (which sets the time)
instead of scanning a real code.

A resident checks their phone from their room and sees every machine's
status: which are running, when each will be free, and whether the person
ahead of them in a line has actually scanned in yet.

To do laundry, they make a reservation one of three ways: let the app
assign whichever machine would start soonest, pick a specific machine
themselves, or walk up and scan a machine's code on site — which opens
that machine's reservation directly. If they scan a machine that's already
reserved, the page switches to that machine's reservation/status page
instead of claiming it.

Their reservation gets a time: an estimate until the person ahead of them
scans in, then fixed. The estimate is based on the washing type they chose
when they reserved (type fixes the duration up front) — the only real
uncertainty is whether the person ahead comes late or dawdles before
starting, not how long their wash runs. They're notified when their time
becomes fixed, or changes.

A machine that's reserved but still sitting idle counts as occupied —
scanning it on site can't start it until that reservation lapses.

As their turn approaches, they get two reminders: one when there's a
single person ahead of them (time to start heading down), and one when
it's actually their turn. From the moment it's officially their turn, they
have 3 minutes to scan the machine — this is how they claim it. Claiming
means the machine is theirs because they've arrived; actually starting the
wash is a separate tap afterward, since they need a moment to load clothes
and detergent. Miss the 3-minute window, and they move back one place
rather than losing their spot outright. In between — after the previous
person's cycle ends but before the next person has scanned in — the
machine shows as "free but unclaimed," visible to everyone, so people can
see the next person might be running late and a chance to move up could be
coming.

If they decide not to do laundry after all, cancelling moves everyone
behind them up by one.

Sometimes a chance comes up earlier than expected — either because the
person ahead of them missed their turn, or because a different machine of
the same type freed up with nobody queued for it. Both cases are handled
the same way, as an offer: accept, and they have 10 minutes to come down
and scan; decline, or don't respond within 2 minutes, and the offer passes
to the next eligible person while they keep their original place; accept
but then don't show up within 10 minutes, and it counts as a missed turn
(move back one place, not to the back of the line).

If the previous person's clothes are still in the machine when it's done,
the next person can take them out, put them in a basket or numbered shelf,
mark that in the app, and the owner is told.

Underneath, each machine has its own short line — used both for ordinary
reservations and for someone moving up a place after a missed turn. The
app's auto-assign option puts a new reservation into whichever machine's
line would actually start earliest (by estimated start time, not by how
many people are in each line). For earlier-machine offers specifically,
all the lines for one machine type are treated as a single queue ordered
by when people joined, and the offer goes to whoever's been waiting
longest among those for whom switching would genuinely be earlier —
someone who's already about to start on their own machine gets skipped,
and the offer moves to the next person instead.

## Current state

- Crit 8, both stages built. `README.md` has a "good" argument grounded in
  the real mechanism, an honest enforced/judged split, and what's excluded
  on purpose vs. just not built yet. `CLAUDE.md` has the app rules. Four
  ADRs are locked in: app concept (0001), identity (0002, superseded),
  tech stack (0003), identity format (0004).
- Stage 1 (schema, routes, queue logic) and the UI design pass are both
  built and committed; `spec/queue-fairness.test.ts`,
  `spec/queue-order.test.ts`, and `spec/identity-format.test.ts` all pass.
- Stage 2: the real Dockerfile replaces the placeholder (Node 24 runs
  TypeScript directly, no build step), `fly.toml` points `DATABASE_PATH`
  at the volume, and `/readme/` renders `README.md` via `marked`. `pnpm
  check` is green (6/6) against a locally-run instance — Docker itself
  isn't available in this dev environment, so the exact `docker build` CI
  runs hasn't been verified locally; that's CI's job on push.
  `PROCESS.md` is written (246 words).
- Still needed before shipping: `reflections/crit-8.md` (the user's own —
  not drafted by the agent), then flipping the repo public and deploying.
- **Crit 9, all stages 1-4 and 7 done; shipped.** Real-time sync over SSE
  (a server tick, not just write-triggered broadcasts, catches passive
  expiries — a claim window running out with nobody making a request —
  within ~1s). The documented multi-user decision: #1's fairness rule
  upgraded from crit 8's blunt "ejected outright" to "move back one
  place," plus #12's cross-machine "earlier machine" offer, both decided
  together since the offer mechanism only exists because the move-back
  rule creates the slack it responds to — see
  [`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md).
  Along the way, also dropped the reservation detail page (redundant once
  every action was already on the home page) and added "end the wash"
  (ends a running wash early, the same end state a normal finish already
  produces). `spec/offer.test.ts` covers the offer's accept/decline paths;
  the move-back-one swap stays manually verified (same as the rest of
  crit 8's timing-dependent behavior — nothing automates waiting out a
  real window). `README.md`'s "Several people at once" now describes the
  real mechanism. `PROCESS.md` rewritten in full (948 words, per the
  final-project brief's 900-1100 target).
- **Crit 9 Stage 6 (visual design pass) done.** User-supplied reference
  UI (`research/1.png` plus Instagram/site examples, see
  `research/ui-references.md`) drove a redraw: rounded illustrated
  machine icon, status-dot sequence for a reservation's own lifecycle
  (not queue position, which can move backward), nav moved above the
  title, palette/contrast pass. Adopted/not-adopted reasoning recorded
  inline in `plans/crit-9.md` Stage 6, benchmarked against
  `plans/crit-8.md`'s accessibility rule (colour/shape never the only
  cue) and the move-back-one mechanic.
- **Crit 9 Stage 8 (dryers, the stretch) done.** No new machines — 2 of
  the existing 10 washers converted to dryers (idempotent conversion,
  verified against a real pre-existing production-shaped database). A
  resident gets asked, after reserving a wash, whether to also queue a
  dryer for after it; `pickDryer()` picks the dryer that's soonest
  genuinely available *after* the wash itself finishes, not just whoever
  is "next in line" — the claim window on that dryer reservation doesn't
  start until the linked wash reaches "done", so it can't expire before
  the resident could physically be there. Dryer icon now also has its
  own colour and shape detail (orange drum, vent slits) rather than
  sharing the washer's icon verbatim.
  `reflections/crit-9.md` written (the user's own). **Crit 9 is fully
  shipped**, deployed and verified live at
  `https://comp4020-final-yuehesun.fly.dev/`.
- **Crit 10 ("fly by instruments") — Stages 1-5 done, deployed and
  verified live.** `src/logging.ts` tags every log line via
  `AsyncLocalStorage` (not a module-level variable, since a shared
  mutable tag would mislabel the concurrent-actions scenario this crit
  demonstrates). Every state-changing POST gets a request line plus a
  named event (including denied cross-room attempts — the brief's own
  authorization example); GETs are excluded (crit 9's SSE re-fetches
  would otherwise bury "who did what" in polling noise). The queue's own
  tick-driven decisions (a move-back-one swap, an offer's creation or
  expiry) are logged too, under one shared tag per decision rather than
  attributed to a request that doesn't exist — verified by letting a
  real 3-minute claim window lapse untouched. `docs/adr/0006-action-
  logging.md` documents the shape and states plainly that log content is
  judged, not enforced (`spec/` never captures stdout). Deployed
  (`https://comp4020-final-yuehesun.fly.dev/`); a live smoke test — two
  room numbers, one denied cross-room cancel — confirmed `mise exec --
  flyctl logs -a comp4020-final-yuehesun` reads exactly as designed.
  **Still needed:** Stage 6's real two-Chrome-profile rehearsal (the
  user narrating from the logs alone, not curl standing in for it),
  Stage 7 (bonus, peak times from logs — needs its own persisted table,
  not reuse of stdout logging, per the plan's own scope note), Stage 8's
  wrap-up (`PROCESS.md` rewrite, `reflections/crit-10.md`).

## The feature list

Every idea discussed so far, with where it currently stands. "Core" means
it's load-bearing for the app to work at all; "crit N" means it's scheduled
there; "gap" means nobody's claimed it yet.

1. **Fairness rule** — core. Crit 8: miss your 3-minute claim window, lose
   your spot, full stop. **Done, crit 9**: move back one place instead,
   swapped with whoever's next, both sides told why — crit 8's blunt rule
   is the documented rejected alternative. See
   [`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md).
2. **The "it's your turn" notification** — crit 8 ships on-page live update
   only. A push notification (so you don't need the tab open) is a nice-to-
   have, not required by the real-time spec, and isn't scheduled anywhere
   yet.
3. **Identity, with no accounts** — open decision, blocking Stage 1.
4. **Scope discipline** — standing constraint, not a deliverable: stays one
   laundry room, resists becoming a generic multi-building booking product.
5. **Washer-then-dryer sequencing** — tentatively crit 9, "if time allows."
   Needs a second machine type (dryers) to exist first. Not guaranteed.
6. **Finished but not collected** (remove clothes, basket/shelf, notify
   owner) — **gap**, no crit assigned.
7. **Peak times from logs** ("when to go") — crit 10, but as a bonus on top
   of the required logging, not the deliverable itself. First thing to cut
   if crit 10 runs short on time.
8. **Wrong taps / stale state** — the crit 8 fairness rule's "lose your
   spot" already self-corrects a missed/wrong tap. The richer version
   ("people on site can correct someone else's claim") is **gap**, no crit
   assigned — also a candidate for crit 9's one documented decision, as an
   alternative to #12.
9. **Coming back** (what a returning user sees) — crit 8 covers the minimal
   version (your trace/position is still there). A richer, justified
   version is a candidate for crit 9's one documented decision.
10. **Three machine types** (washer, dryer, shoe washer) — crit 8 ships one
    type only. Dryers join in crit 9 (needed for #5). Shoe washers are
    **gap**, no crit assigned.
11. **Auto-assign** (app picks whichever machine of a type would start
    earliest, instead of you choosing) — **gap**. Currently crit 8's plan
    has people manually picking a machine.
12. **Cross-machine "earlier machine" offer** (if another machine of your
    type frees up early and nobody's queued for it, the longest-waiting
    eligible person gets first refusal) — **done, crit 9**, alongside #1,
    as the same documented decision. See
    [`docs/adr/0005-fairness-escalation.md`](docs/adr/0005-fairness-escalation.md).
13. **Estimated vs. fixed time** — core, crit 8. Estimate = scheduled slot
    assuming no delay; becomes fixed once the person ahead actually starts.
14. **Claim vs. start as separate actions** — core, crit 8. Scanning claims
    a machine ("it's mine"); starting is a separate tap that just records
    the real start time (duration was already chosen at reservation time).
15. **Cancelling moves the line up by one** — core, crit 8, simple to add.

## Gap tasks — no crit assigned yet

- Finished-but-not-collected handling (#6)
- Shoe washers as a third machine type (#10)
- Auto-assign (#11)
- Push notifications for "it's your turn" (#2), if wanted beyond the spec
  minimum

(#12, cross-machine "earlier machine" offers, shipped in crit 9 — see the
feature list above.)

## Mapping onto crits (summary — full detail in each crit's own plan file)

- **Crit 8** (`plans/crit-8.md`): one machine type, manual reservation
  (pick or scan), simple fairness, estimated/fixed time, persistence. The
  smallest version that's genuinely alive.
- **Crit 9** ("all at once"): **done, fully shipped** — real-time sync
  over SSE (<1s, no reload, including passive expiries via a server
  tick); one documented multi-user decision, #1's fairness escalation
  plus #12's cross-machine offer together
  (`docs/adr/0005-fairness-escalation.md`); the visual design pass; and
  dryers (#5), the stretch, also done.
- **Crit 10** ("fly by instruments") — planned (`plans/crit-10.md`), not
  yet built: server-side logging of every state-changing action (who did
  what, including denied attempts and the queue's own tick-driven
  decisions), documented in a new ADR against the already-shipped
  identity/authorization model; #7 (peak times from logs) as a bonus if
  time allows.

## Decisions locked in for crit 8 Stage 1

1. **Identity** — self-declared name or room number, remembered per
   browser, no account. See
   [`docs/adr/0002-identity.md`](docs/adr/0002-identity.md).
2. **Tech stack** — Hono, TypeScript/Node 24, Drizzle + `better-sqlite3`
   with migrations applied at boot, htmx (+ SSE for crit 9) for the pages.
   See [`docs/adr/0003-tech-stack.md`](docs/adr/0003-tech-stack.md).

Nothing left blocking Stage 1.

## The "good" harness — status

Per the brief: `README.md` is the argument, `CLAUDE.md` (and what it
references) is the enforceable rules, `spec/` is the automated checks —
and the strongest version says plainly which claims are enforced vs.
judged.

- `README.md`: updated with the real mechanism (enforced/judged split,
  what we chose not to build).
- `CLAUDE.md`: app-specific rules added, now that identity is decided.
- `spec/`: `queue-fairness.test.ts` and `queue-order.test.ts` now check the
  two enforced invariants, against the wire contract in `plans/crit-8.md`.
  They'll fail until Stage 1 exists to satisfy them — expected for now.

## Process notes

- Forks/overrides get logged in `process-notes.md` per `CLAUDE.md`,
  pointing at the relevant ADR instead of re-telling the story.
- ADRs live in `docs/adr/`, one file per decision, numbered.
