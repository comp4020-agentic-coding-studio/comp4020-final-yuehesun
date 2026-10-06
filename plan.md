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

## Current state

- Crit 8, in progress. `README.md` has a "good" argument grounded in the
  real mechanism. `docs/adr/0001-app-concept.md` is written. This plan was
  just split into this overall file plus `plans/crit-8.md`.
- Still open, blocking Stage 1 of crit 8: **identity** and **tech stack**
  (see Open decisions, below).
- No code exists yet.

## The feature list

Every idea discussed so far, with where it currently stands. "Core" means
it's load-bearing for the app to work at all; "crit N" means it's scheduled
there; "gap" means nobody's claimed it yet.

1. **Fairness rule** — core. Crit 8: miss your 3-minute claim window, lose
   your spot, full stop. Crit 9: upgrade to the two-tier-reminder + offer
   system (see #12) as the crit's one documented multi-user decision, with
   crit 8's blunt version as the rejected-for-now alternative.
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
    eligible person gets first refusal) — **gap**, no crit assigned. A
    candidate for crit 9's one documented decision, alongside #1 and #8.
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
- Cross-machine "earlier machine" offers (#12)
- Push notifications for "it's your turn" (#2), if wanted beyond the spec
  minimum

**Reminder: revisit this list when crit 9 planning starts.** Each item
needs either a crit slot or a conscious decision to drop it — don't let
them sit here past crit 9.

## Mapping onto crits (summary — full detail in each crit's own plan file)

- **Crit 8** (`plans/crit-8.md`): one machine type, manual reservation
  (pick or scan), simple fairness, estimated/fixed time, persistence. The
  smallest version that's genuinely alive.
- **Crit 9** ("all at once"): real, working real-time sync (<1s, no
  reload); one documented multi-user decision — likely #1's offer system,
  possibly #8 or #9 instead or alongside, time permitting.
- **Crit 10** ("fly by instruments"): server-side logging of every queue
  action; a live "what's happening now" view for a logs-only demo; #7 as a
  bonus if time allows.

## Open decisions (blocking crit 8 Stage 1)

1. **Identity** — anonymous/short-lived browser id, vs. self-declared name
   or room number remembered per browser. *Pending.*
2. **Tech stack** — framework/runtime, persistence (the Fly volume at
   `/data` is the only thing that survives a redeploy), real-time
   transport. Being discussed one decision at a time, each its own ADR.
   *Pending.*

## The "good" harness — status

Per the brief: `README.md` is the argument, `CLAUDE.md` (and what it
references) is the enforceable rules, `spec/` is the automated checks —
and the strongest version says plainly which claims are enforced vs.
judged.

- `README.md`: updated with the real mechanism (enforced/judged split,
  what we chose not to build).
- `CLAUDE.md`: app-specific rules drafted, held back deliberately until
  identity is decided (one rule depends on it).
- `spec/`: concrete checks aren't written yet (no tech stack chosen), but
  what they need to cover is listed in `plans/crit-8.md`'s Stage 2.

## Process notes

- Forks/overrides get logged in `process-notes.md` per `CLAUDE.md`,
  pointing at the relevant ADR instead of re-telling the story.
- ADRs live in `docs/adr/`, one file per decision, numbered.
