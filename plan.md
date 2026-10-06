# Plan — Laundry Queue

## Read first

- The final project brief and spec:
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/
- Crit 8 "It's alive!" (week 9):
  https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/
- Crit 9 "All at once" (week 10) and crit 10 "Fly by instruments" (week 11)
  specs on the course site describe what later stages need to satisfy.
- `spec/README.md` in this repo (the two fixed invariants, and that
  `spec/*.test.ts` is ours to extend).
- `CLAUDE.md` in this repo for the working rules (plan/verify/commit/process
  discipline).
- `docs/adr/` for decisions already locked in.

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

**Our definition of "good"** (see `README.md`): fair and seen to be fair; the
queue decides, not the people in it; talking is optional; honest about
real-time limits; keeps only what the queue needs (no profile, no history);
and stays scoped to one laundry room rather than becoming a generic
booking product.

**Key decisions so far:**
- [`docs/adr/0001-app-concept.md`](docs/adr/0001-app-concept.md) — why the
  laundry queue over the alternatives considered.
- Fairness rule, crit 8 version: plain first-come-first-served; miss your
  claim window and you lose your spot (full rule below).

## Current state

- Crit 8, in progress. `README.md` has a first-pass "good" argument.
  `docs/adr/0001-app-concept.md` is written. The full mechanism (below) is
  designed and reviewed for consistency, but **no code exists yet** —
  `Dockerfile`/`placeholder/` are still the starter template.
- **Open, blocking Stage 1:** how we tell people apart with no accounts
  (identity), and the tech stack (framework, persistence, real-time
  transport). Both need an answer before Stage 1's schema is final — see
  "Open decisions" below.
- Not yet committed: this plan, the README rewrite, and the ADR. Each gets
  its own commit once reviewed.

## The full vision (all crits — not all of this ships this week)

This section is the complete mechanism as designed, so later stages know
where they're going. Only "Crit 8 stages" below is built now; everything
else is marked for a later crit.

**Machines and types.** Machines belong to a type (washer, dryer, shoe
washer). Each machine has its own short queue/line.

**Making a reservation** (three ways): the app auto-assigns you to whichever
machine (of a type) would start earliest; you pick a specific machine
yourself; or you walk up and scan an unreserved machine on site, which
creates and gives you that reservation directly. Scanning an *already
reserved* machine instead opens that machine's queue/status page.

**Choosing a wash.** When you reserve, you pick a washing type, which fixes
its duration up front. Nothing about duration is decided later — "starting"
a machine later on is just a timestamp, not another choice.

**Estimated vs. fixed time.** Your place in line has a scheduled start: the
end of whoever's ahead of you. If they haven't actually started yet, that
end time is an *estimate* (assumes they start on schedule, run their known
duration). Once they tap "start" on site, their end time becomes *fixed*
(their real start time + their known duration), and that fixes your
estimate's basis too. The only real uncertainty is when someone actually
gets around to starting — never how long they'll run, since that's fixed at
reservation time.

**Claiming and starting.** Claiming (scanning the machine's code on site)
means "I've arrived, this machine is mine." Starting is a separate tap after
you've loaded clothes/detergent — it just records the real start time.

**Your turn, and missing it.** Normal case: you're reminded once when one
person is ahead of you (time to head down), and again when it's actually
your turn. From that point you have 3 minutes to claim on site, or you lose
your spot and the next person gets it.

**The offer mechanism** (unifies two cases: someone ahead missing their turn
early, and another machine of your type freeing up with nobody queued for
it). Instead of a sudden 3-minute deadline with no warning, an early chance
is sent as an offer: accept → 10 minutes to come down and claim; decline, or
no response within 2 minutes → offer passes on, you keep your original
place; accept but don't show within 10 minutes → counts as a missed turn
(you move back one place, not all the way to the back).

Cross-machine offers treat all lines of one type as a single queue ordered
by join time; the offer goes to the earliest-joined person for whom
switching would actually be earlier (skipping anyone already about to start
where it wouldn't be).

**Cancelling** moves everyone behind you up one.

**Finished but not collected.** If the machine's done but the previous
person's clothes are still in it, the next person can remove them (basket or
numbered shelf), mark it in the app, and the owner is notified. Claiming a
machine with uncollected clothes in it prompts a "removed and confirmed"
step before you can start.

**Peak times (crit 10).** The server-side activity log (required for crit
10 anyway) can drive a "when to go" view showing the week's busiest times —
a bonus built on top of the logging, not the logging requirement itself.

## Mapping the vision onto crits

- **Crit 8 (this one):** one machine type only; reserve by picking a
  specific machine or scanning on site; simple fairness (miss your 3-minute
  window, lose your spot, full stop — no offers, no two-tier reminders yet);
  no cross-machine logic. This is the smallest version that's genuinely
  "alive."
- **Crit 9 ("all at once"):** the two-tier reminder + unified offer system
  becomes *the* one documented multi-user decision the crit asks for — crit
  8's instant-forfeit rule is the rejected alternative, with a clear reason
  (not enough warning time in practice). Second machine type (dryers) and
  washer-then-dryer sequencing can land alongside it as ordinary features,
  without being the headline decision.
- **Crit 10 ("fly by instruments"):** server-side logging of every queue
  action, a live "who's doing what now" view for the blind demo, and the
  peak-times feature as a bonus on top.
- **Not yet scheduled:** uncollected-clothes handling and cross-machine
  offers may land in crit 9 or slide to crit 10 depending on time —
  revisit when crit 9 starts.

## Open decisions (must resolve before Stage 1 is final)

1. **Identity** — how we tell people apart with no accounts. Candidates:
   anonymous/short-lived browser id, vs. self-declared name or room number
   remembered per browser. *Pending.*
2. **Tech stack** — framework/runtime, persistence (the Fly volume at
   `/data` is the only thing that survives a redeploy), and real-time
   transport. Being discussed one decision at a time, each locked in as its
   own ADR. *Pending.*

## Crit 8 stages

### Stage 1 — schema and the core queue loop

Scope: one machine type, a handful of machines, each with its own line.

- Data: a machine (id, status), a reservation (machine, person, washing
  type → duration, joined-at, claimed-at, started-at, status:
  waiting/current-turn/claimed/running/done/cancelled).
- Join a queue: pick a specific machine, or scan an unreserved machine
  on-site (creates + fulfils the reservation in one step).
- See your position and an estimated/fixed time (per the estimate rule
  above — no extra stored field needed, computed from the chain).
- When you're at the front and the machine's free: 3-minute claim window;
  miss it, you lose your spot, next person's up.
- Claim (scan) → mark claimed. Start (separate tap) → record actual start,
  fixes your end time for whoever's behind you.
- Cancelling moves the line up by one.
- Depends on: identity decision (who a reservation belongs to), tech stack
  decision (what this is built with, how it's stored).

### Stage 2 — make it alive, deployed, and documented

- Replace the placeholder `Dockerfile`/app with the real one; wire up
  `/data` for persistence across restarts/redeploys.
- Confirm the crit 8 "alive" check by hand: a stranger joins a queue, closes
  the tab, comes back, their place is still there.
- Add `spec/*.test.ts` checks for the invariants that matter here (e.g. no
  double-claim on a machine, queue position only moves forward except on a
  miss).
- Finish `README.md`, `PROCESS.md` (stack/workflow ADR already feeds this),
  and `reflections/crit-8.md`.
- `pnpm check` and `pnpm check:evidence` green, repo flipped public, `/ship`.

## Process notes

- Forks/overrides get logged in `process-notes.md` per `CLAUDE.md`, pointing
  at the relevant ADR instead of re-telling the story.
- ADRs live in `docs/adr/`, one file per decision, numbered.
