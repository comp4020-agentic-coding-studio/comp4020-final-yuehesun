# Crit 10 extension — one unattended run

Written for one unattended run of about two hours. Nobody will read your
questions or answer them: this file, `CLAUDE.md` (its "Unattended runs"
section governs this run), `plans/crit-10.md` (Extension) and ADRs
0007–0009 are the whole brief.

## 0. Ground rules

- **Nobody is there.** Never ask a question, never stop to wait for a
  reply, never end your turn early. Where you would ask, make the smallest
  reasonable call, record it and why in the commit message and
  `HANDOFF.md`, and keep going.
- **Use the time.** Finish every stage in order, each one completely (code,
  its checks, `pnpm check` green, committed) before the next. If a stage
  is done early, do not skim the next one: the UI stage in particular is
  expected to take the largest share of the run. Only stop when the
  Definition of done is met and Stage 6's extra critique round is done, or
  when you are genuinely blocked.
- **Already decided — do not reopen:**
  - Identity stays a bare, unverified room number. No device binding,
    pairing codes or tokens (ADR 0002/0004).
  - Production's fairness rule stays "move back one place" (ADR 0005).
  - No push notifications; turn alerts are in-page only (ADR 0009).
  - No wait-time prediction. No separate `/board`: the home page is the
    board.
- **Do not edit** `README.md`, `PROCESS.md`, `process-notes.md`,
  `reflections/`, or `docs/adr/` (except changing an ADR's Status from
  "Accepted — implementation pending" to "Accepted" when its stage ships).
  Suggestions for those go in `HANDOFF.md`.
- **Ports:** never 8080. Your servers use 8090+, are killed as soon as a
  check finishes, and you confirm the port is free.
- Never write test data into the deployed app or `.data/app.db`.
- If the same check fails twice after honest fixes, step back and rethink
  the approach; if still stuck, write what you tried in `HANDOFF.md` and
  move on to the next stage.

## Read first

- `CLAUDE.md`, `plan.md` (Background, Current state), `plans/crit-10.md`
  (especially "Extension")
- `docs/adr/0005`, `0006`, `0007-verification-harness.md`,
  `0008-contention-and-connections.md`, `0009-turn-alerts.md` — 0007–0009
  are the spec for Stages 1–3; where this prompt and an ADR differ, the ADR
  wins
- `src/queue.ts`, `src/db.ts`, `src/logging.ts`, `src/realtime.ts`,
  `src/app.ts`, `src/views.ts`, `src/washing-types.ts`,
  `src/drying-types.ts`
- `spec/README.md`, `spec/support/queue-client.ts`,
  `spec/queue-fairness.test.ts`, `spec/offer.test.ts`
- `.github/workflows/checks.yml`, `Dockerfile`, `.dockerignore`,
  `vitest.config.ts`

Before changing anything: start the app on a spare port with a scratch
`DATABASE_PATH`, run `APP_URL=http://localhost:<port> pnpm check`, confirm
green, stop the server. Then take the "before" screenshots for Stage 4
(step 4.1) while the old UI still exists.

## Stage 1 — injectable clock and property-based tests (ADR 0007)

1. `src/clock.ts` with one `now()` returning `Date.now()` in production.
   Replace every `Date.now()` in `src/queue.ts` (`join`, `claim`, `start`,
   `cancel`, `acceptOffer`, `queueDryer`, `suggestedDryer`, and the
   defaults of `settleMachine`, `queueFor`, `processOffers`). No behaviour
   change in production.
2. Smallest change to `src/db.ts` that lets `queue.ts` run in-process on a
   fresh in-memory database (e.g. `DATABASE_PATH=":memory:"` plus a reset
   that clears `reservations` and `offers`, keeping seeded machines).
   Migrations and seeding unchanged for the real app.
3. A sink switch in `src/logging.ts` so the harness can silence logs.
4. `sim/`: seeded PRNG (no dependency), forward-only virtual clock, and a
   driver that applies one action — join, claim, start, cancel, finish,
   accept/decline offer, queue a dryer, let N minutes pass — through the
   real `queue.ts` functions, then calls `settleMachine` and
   `processOffers` as the realtime tick does. No queue logic copied.
5. `fast-check` devDependency. `spec/fairness-properties.test.ts`: ≥200
   runs × 60 steps, every ADR 0007 invariant checked after every step,
   readable shrunk counterexamples (rooms, actions, minutes).
6. Direct virtual-clock tests: missed claim window swaps exactly the front
   two; same for a missed start window; accepted offer gets 10 minutes;
   unanswered offer expires after 2 and passes on; a dryer's window waits
   for its wash.
7. Green under `pnpm check` locally; confirm it would run in CI (source and
   `node_modules` exist on the runner).

**Done when** green, and you have deliberately broken `moveBackOnePlace`
(swap the wrong pair), seen the property test fail with a readable
counterexample, reverted, and quoted that output in the commit message.

## Stage 2 — contention, connections, restarts (ADR 0008)

Specs over HTTP against `APP_URL`, using room numbers no other spec uses:

1. 20 rooms join one idle machine in one `Promise.all`: positions exactly
   1..20, no gaps, no duplicates, one front.
2. The front room fires `claim` twice at once: one success, one 409.
3. Same room, same machine, same washing type, twice inside ADR 0008's
   3-second window: one reservation, both responses point at it. Client
   side: every state-changing button disabled while its request is in
   flight.
4. SSE drop: a text notice "Connection lost — reconnecting…"; on reconnect,
   every live fragment re-fetched once, notice removed. Verify with
   Playwright (go offline/online, throttle) and describe what you saw in
   the commit message.
5. `spec/restart.test.ts`: own server on port 8091 with a temp
   `DATABASE_PATH`; two rooms' reservations (one claimed); stop, restart on
   the same database, check every position and status. Always kills its
   server and confirms 8091 is free, on failure too.

## Stage 3 — in-page turn alerts (ADR 0009)

- My own status becomes "one ahead" or "my turn": `<dialog>`, one sentence,
  a "Got it" button; `document.title` changes ("● Your turn — Laundry
  Queue") until the tab is focused.
- Once per transition: reload or refetch never re-opens a dismissed alert
  (per reservation + state in `sessionStorage`, try/catch).
- No sound, no vibration, nothing for others' changes. Focus moves into the
  dialog; Escape closes it.
- Verify in two Playwright browser contexts (room A ahead of room B).

## Stage 4 — home page redesign (the most important stage)

The crit 9 design pass came out plain because the agent worked from a text
description, never looked at its own result, and had no design plan. This
stage fixes all three. **Do not shortcut any step.**

### 4.1 Before

Screenshot the current home page at 390×844 and 1280×800 in each of these
states, before any change: no room set; room set, no reservation;
waiting; my turn. Save to `research/screens/before-*.png`.

### 4.2 Reference

Download the images listed in `research/flighty/SOURCES.md` into
`research/flighty/` with `curl -f`; add `research/flighty/*.jpg` to
`.gitignore`. **Open and look at every image** (Read the file), then read
`research/flighty/mapping.md`. Write, in `research/design-plan.md`, a
short "What I see in the reference" section: for each image, three
concrete observations about hierarchy, spacing, type size ratios and how
status is shown. Borrow structure, not looks.

### 4.3 Design plan (before any CSS)

In `research/design-plan.md`:

- **Palette:** 4–6 named hex colours with roles; state colours for every
  machine/reservation state, each with its text label. Check text contrast
  ≥ 4.5:1 and state it.
- **Type:** one family (or two, clearly different), a type scale with at
  least 4 steps, and the ratio between my status's time figure and body
  text (it should be the largest thing on the page by a wide margin).
- **Spacing:** a scale (e.g. 4/8/12/16/24/32/48) and where each step is
  used.
- **Wireframes (ASCII):** room-number screen; the board at 390px and at
  1280px (at 1280px, use the width: my status beside or above a
  departure-board table, not one narrow centred column); my reservation in
  every state (waiting, one ahead, my turn, claimed, running, done, moved
  back, offer); the turn alert; the reconnect notice.
- **Self-review:** write down what the generic version of this page would
  look like (a pale background, identical white rounded cards with the
  same shadow, a centred column), then go through your plan line by line
  and change anything that matches it. List what you changed and why.

Commit the plan before writing CSS.

### 4.4 Build

- CSS custom properties for every colour, size and space in the plan, in
  one stylesheet. Keep htmx, server-rendered views, and every fragment id
  and `hx-*` attribute the SSE refetch relies on. If `spec/support/` reads
  page text, keep it stable or update both together.
- **Signature element:** my own status block, with the remaining time as
  the largest thing on the page, the reason for the current state in one
  plain line under it ("Waiting on room 210's wash, ends 14:20"; "You moved
  back one place: no claim within 3 minutes"), and exactly one primary
  action.
- **The board:** one row per machine — machine, state (word + colour), next
  room, time left — aligned in columns like a departure board, tabular
  figures for times. Washers and dryers grouped.
- **Avoid:** identical rounded cards with one shadow, pastel gradient
  washes, ALL-CAPS labels, emoji as icons, decoration that carries no
  information, motion that nobody triggered.
- 390px and 1280px both designed, not just "not broken"; visible keyboard
  focus; `prefers-reduced-motion` respected; colour never the only cue.
- Remove the stale home-page line saying reminders and live updates
  "aren't built yet".

### 4.5 Visual review loop (at least 2 rounds, at most 4, per screen)

For each screen and state in 4.3's wireframe list:

1. Playwright screenshots at 390×844 and 1280×800 (run real queue actions
   in two browser contexts to reach each state).
2. **Look at the screenshot**, then score it 1–5 against this checklist,
   writing the scores into `research/design-review.md`:
   - Is my status's time the first thing the eye lands on?
   - Can every machine's state be read without colour?
   - Does it match the wireframe and the type/spacing scale?
   - Does it use the 1280px width deliberately?
   - Does anything look like the generic version from 4.3?
   - Compared to the Flighty reference's hierarchy, what's weaker?
3. Write the three biggest problems, fix them, re-screenshot.
4. Stop a screen only when every score is ≥4 or after round 4.

Save the final screenshots as `research/screens/after-*.png` (same names as
the "before" set). These are our own screenshots; commit them.

## Stage 5 (stretch) — fairness simulation (ADR 0007, second use)

1. `scripts/simulate.ts` (`pnpm sim`): the Stage 1 harness, one Saturday
   (8:00–22:00), 100 residents, 8 washers + 2 dryers, 50 seeds. The
   behaviour model is one config object at the top, commented as
   assumptions, not measurements.
2. Same events under three missed-window policies: wait forever, eject
   (crit 8), move back one (current). Selectable only inside the
   simulator; nothing in the running app can select another.
3. Metrics per policy (mean and spread over seeds): join-to-start wait
   (median, p90, max); people moved back or ejected; minutes a machine sat
   free while someone waited behind an absent front person; extra wait a
   late person caused others vs. paid themselves.
4. `sim/results.json` committed; a spec checks same seed → identical JSON.
5. `/fairness`: server-rendered SVG bars from `sim/results.json` (no chart
   library), Stage 4's tokens, labelled "Simulated building, not real
   usage", listing the assumptions and `pnpm sim`; linked from the nav;
   the `Dockerfile` includes `sim/results.json`. Screenshot it at both
   widths and run one review round from 4.5.
6. Report numbers only; no conclusions about which policy is better
   anywhere except a neutral table in `HANDOFF.md`.

## Stage 6 — finish

1. `pnpm check` green against a fresh local server; and against the Docker
   image if Docker is available (`docker build -t app . && docker run -d
   -p 8092:8080 -e PORT=8080 --tmpfs /data app`, then
   `APP_URL=http://localhost:8092 pnpm check`). Stop every server; confirm
   ports free.
2. **Extra critique round:** re-screenshot every "after" state, pick the
   two weakest screens from `research/design-review.md`, do one more fix
   round on each.
3. `HANDOFF.md`:
   - what shipped per stage, with commit hashes; what didn't and why
   - every call you made without asking, and why
   - the shrunk counterexample from Stage 1's deliberate break
   - suggested lines for README's "What's enforced, what's judged", each
     naming its spec file
   - Stage 5's numbers as a neutral table
   - where you think the UI is still weakest
   - what I still need to check by hand on a real phone
4. Append to `plan.md`'s Current state (don't rewrite earlier entries).
5. Don't push, don't deploy. Last commit deletes `prompt.md`.

## Definition of done

- [ ] `src/clock.ts`; no `Date.now()` left in `src/queue.ts`
- [ ] Property tests + direct timing tests green; deliberate-break output in a commit message
- [ ] Simultaneous-join, double-claim, double-submit, restart specs green
- [ ] Reconnect notice and refetch verified, described in a commit
- [ ] In-page turn alert, once per transition, keyboard-accessible
- [ ] `research/design-plan.md` committed before CSS
- [ ] `research/design-review.md` with ≥2 scored rounds per screen
- [ ] Before/after screenshots at both widths in `research/screens/`
- [ ] Stale "not built yet" line gone
- [ ] (stretch) `pnpm sim`, `sim/results.json`, determinism spec, `/fairness`
- [ ] `pnpm check` green; no servers left running
- [ ] `HANDOFF.md`; `plan.md` Current state appended
- [ ] README, PROCESS, process-notes, reflections untouched
- [ ] Last commit deletes `prompt.md`
