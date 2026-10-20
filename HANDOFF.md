# Handoff — crit 10 extension, one unattended run

Written by the agent at the end of the run `prompt.md` describes, per its
Stage 6. Read this alongside `plans/crit-10.md` ("Extension") and
`research/design-plan.md`/`research/design-review.md` for the detail
behind Stage 4.

## What shipped, per stage, with commit hashes

Commits run oldest to newest on `crit-10-extension`:

- `13e1f25` — `chore:` added `fast-check` and `playwright` devDeps;
  captured `research/screens/before-*.png` (four states, both
  viewports) before any redesign work.
- `8118424` — **Stage 1 (plan's Stage 9, ADR 0007)**: `src/clock.ts`;
  every `Date.now()` in `src/queue.ts` replaced; `src/db.ts` gains
  in-memory mode + `resetForHarness()`; `src/logging.ts` gains a sink
  switch; `sim/` (rng, virtual clock, harness, driver); `fast-check`
  property tests (`spec/fairness-properties.test.ts`, 200 runs x 60
  steps, all 7 invariants) plus direct timing tests
  (`spec/queue-timing.test.ts`). Found and fixed two real bugs (see
  "Stage 1's deliberate break" below for one of them in detail; the
  other was `resetForHarness()`'s FK-cycle ordering).
- `372eeb8` — `docs:` ADR 0007 status to Accepted (Stage 13/stretch
  still noted pending inside the ADR itself, since Stage 5 below wasn't
  attempted this run).
- `88a84b9` — **Stage 2 first half (plan's Stage 10, ADR 0008)**:
  join-dedup window, disable-in-flight buttons, `spec/contention.test.ts`
  (20 simultaneous joins, double claim, double-submit).
- `6196690` — **Stage 2 second half**: SSE reconnect notice + fragment
  refetch, `spec/restart.test.ts` (own server on :8091, verified killed
  and the port confirmed free in `afterAll`, including on failure).
- `1766f77` — `docs:` ADR 0008 status to Accepted.
- `1128c03` — **Stage 3 (plan's Stage 11, ADR 0009)**: in-page turn
  alerts, native `<dialog>`, `document.title` flashing, once-per-transition
  via `sessionStorage`, verified with two Playwright contexts.
- `d7cc0ac` — `docs:` ADR 0009 status to Accepted.
- `d46680e` — **Stage 4 part 1 (plan's Stage 12)**: `research/design-plan.md`
  committed before any CSS — reference observations, palette with
  hand-checked contrast ratios, type/spacing scales, ASCII wireframes,
  self-review against "the generic version."
- `8402c26` — **Stage 4 part 2**: the full `views.ts` rewrite (departure-board
  table, signature status hero, tokens), two real display bugs found via
  screenshots and fixed, `research/design-review.md`'s scored >=2-round
  review, `research/screens/after-*.png`.
- *(this commit)* — **Stage 6**: this file, `plan.md`'s Current state
  appended, Docker check result, extra critique round.
- *(final commit)* — deletes `prompt.md`, per the run's own last
  instruction.

## What didn't ship, and why

- **Stage 5 (stretch) — the fairness simulation (`scripts/simulate.ts`,
  `pnpm sim`, `sim/results.json`, `/fairness`) was not attempted.**
  `prompt.md` and `plans/crit-10.md` both name it the explicit first
  thing to cut if time runs short, and Stage 4 — named "the most
  important stage" and "not to be shortcut" — took the bulk of the
  run's time once the >=2-round scored screenshot loop, the two
  genuine display-bug fixes, and a real 3-minute wait for the
  moved-back/moved-up screenshots are counted. Rather than rushing
  Stage 5 and risking a second re-implementation of queue rules (the
  one thing ADR 0007 exists to prevent) under time pressure, I judged
  stopping after a solid Stage 4 and a complete Stage 6 to be the
  smaller risk. The harness `sim/` already built in Stage 1 is designed
  to be reused for exactly this (its own doc comments say so), so
  Stage 5 is a clean pickup, not a redesign, whenever it's next
  attempted.
- Docker verification: see below — `docker` isn't usable from this WSL2
  distro in this environment (the binary resolves to the Windows-side
  Docker Desktop install but WSL integration isn't enabled), so only
  the local-server `pnpm check` run could be confirmed, not the image
  build.

## Every call made without asking, and why

1. **Playwright's system libraries extracted by hand from `.deb`
   packages**, since `--with-deps`'s own install needs `sudo` which
   wasn't available unattended. Nothing added to the repo or
   `Dockerfile` for this — production never runs a browser, so this was
   purely a local verification workaround, deleted (`.scratch/`) after
   use each time.
2. **SSE disconnection was verified via a real `SIGKILL`'d server
   process, not browser-level offline emulation** — `context.setOffline()`
   and CDP network throttling didn't reliably interrupt an
   already-flowing streaming response in this sandbox. A real process
   kill genuinely severs the TCP connection, which is closer to the
   real failure mode (a server restart/deploy) than a browser-level
   simulation anyway.
3. **The moved-back/moved-up screenshots were captured by actually
   waiting out a real 3-minute claim window** (a backgrounded poll,
   not a sped-up clock), since the running app's screenshots must come
   from the real server, and `sim/`'s virtual clock is explicitly
   scoped to tests/the simulator only, never reachable from it.
4. **`noticeBanner()`'s "moved back" text was reworded** to "You moved
   back one place: no claim within 3 minutes." to match
   `research/design-plan.md`'s own wireframe line exactly, rather than
   leaving the pre-existing shorter copy. A wording-only change, not a
   mechanism change.
5. **Room numbers used across every screenshot/spec session followed
   ADR 0004's digit-only format strictly** (`room9xxx` ranges, one
   block per screenshot/spec pass) — an early draft script used a
   dash-containing room name and silently hit the error page; fixed by
   switching to compliant formats rather than loosening validation.
6. **Each screenshot pass used its own freshly-wiped scratch SQLite
   file** (`/tmp/crit10-scratch/*.db`), never `.data/app.db`, and never
   the same scratch file across both a `pnpm check` run and a
   screenshot session in the same sitting — `pnpm check`'s own spec
   runs fill machines with reservations that would otherwise pollute a
   "free machine" screenshot.
7. **Stage 5 skipped** (see above) — the single largest unasked-for
   call this run made, since `prompt.md` frames Stage 5 as something to
   attempt, not something mandatory.
8. **The "done" status's unreachability in the live UI was left
   unfixed** — see below. Changing `queue.ts`'s `ACTIVE_STATUSES` to
   include `"done"` would be a queue-logic change, and Stage 4 is
   scoped as a design-only pass over the existing data model.

## Stage 1's deliberate-break counterexample

Quoted in full in commit `8118424`'s message; reproduced here as
`prompt.md` Stage 6 asks:

Temporarily changed `moveBackOnePlace` to swap the missed reservation
with the *third* queue entry instead of the second (i.e., jump two
places instead of swapping the front two). The property test failed on
its very first run, shrunk to 5 tries:

```
Error: Property failed after 5 tests
{ seed: 756206106, path: "4:...:1:1:1:2:1:1:2:0:...", endOnFailure: true }
Caused by: Error: machine 1: queue order changed beyond a front-two
swap (3390,3391,3393 -> 3393,3391,3390)
```

This is exactly the injected bug (invariant 3 — "two reservations on the
same machine only change order through a move-back-one swap of the front
two"), caught on the first attempt. Reverted before the commit; `pnpm
check` confirmed green again afterward.

## Suggested lines for README's "What's enforced, what's judged"

Each names the spec file that would back it if added:

- "A simultaneous rush of joins on one machine still lands in a
  contiguous 1..n order with no gaps or duplicates" —
  `spec/contention.test.ts`.
- "Two near-simultaneous actions on the same reservation (a double
  claim, a double-submitted join) never create two reservations or two
  successful claims" — `spec/contention.test.ts`.
- "Reservation state survives a server restart on the same database" —
  `spec/restart.test.ts`.
- "The queue's timing rules — claim window, start window, an offer's
  claim/response windows, a dryer's window waiting for its wash — hold
  under any sequence of real actions, not just the paths a human
  thought to test" — `spec/fairness-properties.test.ts` and
  `spec/queue-timing.test.ts`.
- "A missed claim or start window always swaps exactly the front two
  reservations, never more" — `spec/fairness-properties.test.ts`
  (invariant 3, the one the deliberate-break drill above exercised
  directly).

## Stage 5's numbers

Not applicable — Stage 5 was not attempted this run (see above). No
numbers to report; nothing should be written into a neutral table
claiming one missed-window policy is better than another until the
simulation actually runs.

## Where the UI is still weakest

From `research/design-review.md`'s own notes, collected here:

- **The "done" reservation state is architecturally unreachable in the
  live UI.** `queue.ts`'s `ACTIVE_STATUSES = ["waiting", "claimed",
  "running"]` means `queueFor()` never returns a "done" row once
  `finish()` sets that status, so the status-hero block (including the
  "Done — thanks for using this machine" code path built for Stage 4)
  disappears entirely the instant a wash finishes — confirmed by
  screenshot (`research/screens`/`.scratch` — the capture shows no
  status-hero at all right after calling finish, the machine already
  back to "Free"). This is pre-existing `queue.ts` behaviour, not
  introduced by this redesign; fixing it (if a transient "done,
  thanks" moment is actually wanted) means changing which statuses
  `queueFor` treats as active, which is a queue-logic decision outside
  this design-only stage's scope.
- **A recurring minor desktop alignment note**: on most 1280px
  screenshots, the status column's left edge and the board's first
  column don't quite line up (the status column is a fixed 22rem, the
  board's own first column width is content-driven) — never scored
  below 4 on any screen because of it, but worth a look if there's
  another pass.
- **The offer decision-card can outweigh the hero figure's dominance on
  mobile** (scored 4, not 5, on item 1 of the checklist for the "offer"
  screen) — a deliberate trade-off (an offer is a time-boxed decision
  that has to be seen), not treated as a defect.
- **The room-number (identity) screen** is the one screen closest to
  "the generic version" described in `research/design-plan.md`'s
  self-review, mostly because there's no Flighty-equivalent reference
  screen to borrow structure from, and `prompt.md`'s own wireframe
  calls it "unchanged structure, restyled tokens only." Left as a
  candidate for a future pass, not fixed here.

## What to check by hand on a real phone

- The departure-board table's mobile stacking (`.board-label` reveal
  under 640px) — verified only via Playwright's 390px viewport
  emulation, never a real touchscreen. Worth confirming the
  label/value pairs read comfortably and the reserve-form dropdown is
  easy to tap.
- The turn-alert `<dialog>`'s focus-trap and on-screen keyboard
  interaction on an actual phone (native `<dialog>` behaviour can
  differ subtly between desktop Chrome, used for all the Playwright
  verification here, and mobile Safari/Chrome).
- Whether the status-hero's `--text-hero` (4.5rem) figure actually
  reads as comfortably dominant at a real phone's viewing distance and
  brightness, not just in a screenshot.
- The reconnect notice and turn-alert's `document.title` flash on a
  real phone's tab-switching behaviour (background tab throttling can
  differ from desktop Chrome's).
- Real multi-person timing: this run's Stage 2/3 verification used two
  Playwright browser contexts on one machine; a genuine two-phone test
  (per `plans/crit-10.md`'s own "two Chrome profiles" plan) hasn't
  happened this run.

## Docker check

`docker` is not usable from this WSL2 distro in this environment — the
`docker` binary on `PATH` resolves to the Windows-side Docker Desktop
install, and its output says WSL integration isn't enabled for this
distro. `docker build`/`docker run` could not be attempted. `pnpm check`
was instead confirmed green against a plain local server (`node
src/server.ts`, scratch port 8094, scratch `DATABASE_PATH`, killed and
port-freedom confirmed with `ss -tlnp` immediately after) — see the
Stage 4 commit message for that run's result (10 files, 21 tests). This
is the one Definition-of-done item this run could not fully verify;
confirming the real `docker build -t app . && docker run ...` path is
something to do by hand before shipping.

## Ports and servers

Every verification server this run started used 8090 or above (never
8080), and was killed with its port's freedom confirmed via `ss -tlnp`
immediately after each check — including the server left running from
the prior screenshot-capture session at the start of this continuation
(port 8090, confirmed free before any further work began). No server is
listening on any port this run used as of this commit.
