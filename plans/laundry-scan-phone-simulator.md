# Laundry scan phone-simulator plan — a no-phone fallback for the 3D room's QR overlay

## Read first

- Overall vision: [`plan.md`](../plan.md) — the User story section (the
  real-world scan→claim→start flow this whole feature exists to make
  convincing), feature #19, and the "3D walkthrough" entries in Current
  state. [`docs/adr/0012-3d-walkthrough.md`](../docs/adr/0012-3d-walkthrough.md)
  — the QR code is an unprotected link, exactly as trustworthy as a room
  number; this plan doesn't touch that boundary.
- `plan.md`'s own still-outstanding item: "Stage 4's real two-device
  phone-scan rehearsal... needs a physical phone... my own, not scheduled
  for the agent." **This plan is not that rehearsal, and must never be
  described as satisfying it.** It's a separate, in-browser convenience
  for someone evaluating the build without a real phone on hand (e.g. a
  tutor at a crit) — see "Is this legitimate scope" below.
- `src/laundry-view.ts` lines ~1680-1760 — the existing `laundry-examine-
  overlay` (the full-screen black panel), `showExamineOverlay`/
  `hideExamineOverlay`, and `openMachineExamine` (the function that
  currently renders the QR `<img>` for a nearby idle/reservable machine).
  This plan adds to `openMachineExamine`'s own HTML, nothing else in the
  file's 2000+ lines.
- `src/views.ts` lines ~303-306 — `.laundry-examine-overlay`'s CSS (a
  centered flex column over the whole viewport) and `page()` (lines
  ~608-634) — the shared `<nav>`/shell every real page (including the one
  this plan reuses) already renders inside.
- `src/app.ts` — `GET /laundry/scan/:id` (lines 213-222, the real scan
  landing route: unauthenticated visitor sees `scanIdentityPage`,
  identified visitor is redirected to `/`) and `GET /` (lines 68-78, the
  real home page, identity-gated the same way). These two routes, exactly
  as they exist today, are **the entire "mechanism"** this plan uses —
  see "Feasibility" below.
- `spec/laundry-scan.test.ts` — covers `GET /laundry/scan/:id`'s three
  branches today (identity page when logged out, redirect to `/` when
  logged in, 404 for a bad id). This plan doesn't change that route's
  server-side behaviour at all, so these tests stay green unmodified; a
  new spec only needs to cover the new client-side affordance.
- `docs/adr/0002-identity.md` — identity is a plain cookie, same for
  every page in the app; no separate login exists to simulate.

## Background

**What prompted this.** The 3D walkthrough's whole premise (see `plan.md`
User story + `docs/adr/0012`) is that scanning a machine's real QR code
with a real phone is what makes the pitch — "a real residence could
adopt this" — convincing, which is exactly why Stage 4's physical
two-device rehearsal is called out as something the agent can't do and
the user still owes. But that same realism is a liability at a crit: a
tutor evaluating the build live may not have a phone out, or may not want
to dig for one, and the QR examine overlay today offers nothing to do
instead except read "scan with your phone's camera" and move on. The
request is for a fallback, right there in the same overlay, that lets
anyone without a phone actually complete the flow — claim, start, the
works — from the keyboard/mouse they're already using.

**Is this legitimate scope?** Checked against `CLAUDE.md`'s App rules:

- *"No feature exists purely to grow usage"* — this isn't a laundry-queue
  feature at all; it changes nothing about how a real resident uses the
  real app. It's a demo/accessibility affordance layered on the
  evaluation tool (the 3D room), not the product. Doesn't conflict.
- *"Talking is optional, never required"* — unaffected; this doesn't
  introduce or require any person-to-person channel.
- **The real risk to manage**: this must never be positioned as
  satisfying the outstanding Stage 4 phone rehearsal. That rehearsal
  specifically needs to prove a *physical* phone camera can decode a
  *physical* QR code rendered on a *physical* screen — a software
  simulation of "what's on the other side of the scan" proves nothing
  about that link. This plan's own Stage 1 (below) states this
  explicitly in its commit message and in a one-line comment next to the
  new button, so a future reader (or a tutor) never mistakes one for the
  other.

Verdict: legitimate, narrow, additive scope. No ADR update to `0012`
needed — the QR code's own trust model is untouched; this only adds a
second way to reach the same already-public, already-unprotected page.

## Feasibility and the real mechanism

**The question that matters: do we reuse the real page, or build a
second copy of it?** This codebase's own precedent is unambiguous
— `CLAUDE.md`'s test-harness rule ("never copy queue logic into a test or
the simulator: a copy can pass while the real rules fail") and
`board-state.ts` (one `boardStateFor()` shared by the 2D board and
`GET /laundry/machines-state`) both exist specifically to prevent two
renderings of the same fact drifting apart. The drop-off flow plan
(`plans/laundry-dropoff-flow.md`) diagnosed exactly this failure mode
happening for real: `openHandoffExamine`/`openDropoffExamine` tracked
basket visibility in a local JS variable *parallel to* the server's own
`myBasketVisible` field, and the two disagreed. **Building a second,
parallel rendering of the reservation UI inside the phone-frame overlay
is explicitly ruled out** for the same reason — it would be a second
copy of `homePage()`'s HTML/logic that can silently drift from the real
one (a new washing type added later, a new notice shape, a layout change
— anything that touches `views.ts` would need to be remembered twice).

**The mechanism: a same-origin `<iframe>` pointed at the real route.**
`GET /` and `GET /laundry/scan/:id` are already real, independently
reachable, fully-functional HTML pages, served by the exact same Hono
app the 3D room's own page is served by. An `<iframe src="/">` inside the
examine overlay is not a simulation of the mobile page — it **is** the
real mobile reservation page, rendered by the real server, from the
real database, using the browser's real session cookie (same-origin, so
`document.cookie`/`fetch` inside the iframe behave exactly as they would
in a real top-level tab). No new route, no new view function, no second
copy of any HTML string. This is the same "reuse the one real
implementation" shape `board-state.ts` and `queue.ts` already establish,
just applied to a whole page instead of a data fragment.

A fetch-and-inject of server-rendered HTML (fetching `/` and splicing its
body into a `<div>`) was considered and rejected: it would need its own
copy of `page()`'s `<head>` setup (the htmx/SSE scripts, the stylesheet)
to actually work once injected, which is exactly the "two copies that can
drift" problem above, for no benefit over an iframe — an iframe gets a
full, independent document context (its own `<head>`, its own SSE
connection, its own htmx instance) for free, with literally zero
duplicated markup.

**Live state sync — confirmed, not assumed.** `GET /events` (crit 9's SSE
stream, `src/app.ts` lines 280-288) is a plain `GET`, cookie-scoped like
any other request; an iframe's document opens its own independent
`EventSource` connection to it (SSE connections aren't tied to the
top-level page, just to whatever document opens them) using the same
session cookie. So claiming/starting a wash inside the iframe's real
`/` page triggers the real `hx-trigger="sse:changed"` re-fetches *inside
the iframe* exactly as they would in a real second tab — and separately,
the 3D scene's own existing `GET /laundry/machines-state` polling/SSE
listener (already live, unrelated to this feature) picks up the same
underlying database change on its own next tick. Two independent,
already-existing real-time paths converge on the one real write; nothing
new needs to be built to make the 3D view's machine state update when a
claim happens inside the simulated phone.

**Identity.** The iframe uses the same browser's already-set `person`
cookie — the person who walked into `/laundry` already identified
themselves to do that (see `GET /laundry` App.ts's own "no cookie ->
identity page" guard, same as `GET /`), so by the time they're close
enough to a machine to open the examine overlay, `GET /` inside the
iframe will render the real home page, not the identity prompt. Edge
case: if somehow unidentified (shouldn't be reachable in practice, since
entering `/laundry` already requires it), the iframe just shows the real
identity form instead — correct, not broken, no special-casing needed,
since that's exactly what `GET /` already does for anyone without a
cookie.

## Visual design

The QR overlay (`.laundry-examine-overlay`, `src/views.ts` ~303) is
already a centered flex column over the full viewport with free space on
either side at most viewport widths (the QR `<img>` is fixed at `12rem`).
Plan:

- Change `.laundry-examine-overlay`'s layout from a single centered
  column to a two-part row on wide viewports (flex-wrap, so it still
  stacks on narrow ones): the existing QR code + heading stays on the
  left/center exactly as today; a new slot appears on the right only
  once the phone-simulator is opened.
- Add one small, quiet link/button under the existing "Scan with your
  phone's camera..." hint: **"No phone? Simulate a phone scan"** (plain
  English per `CLAUDE.md`'s language rule). Styled like the overlay's
  existing `.btn-quiet`, not `.btn-primary` — this is a fallback, not the
  primary path, and shouldn't visually compete with "scan this code,"
  which is the real thing being demonstrated.
- Clicking it reveals a CSS "phone frame": a fixed-aspect-ratio
  (9:19.5, a modern phone screen) rounded-rect panel (`border-radius`,
  a dark bezel border, a small notch/speaker detail at the top purely
  decorative) containing the `<iframe src="/">`, sized to fit inside that
  frame. Pure CSS, no new library — matches this project's existing
  "plain CSS, no component framework" approach everywhere else in
  `views.ts`.
- A close control on the phone frame itself (reuse `.btn-quiet`, same
  pattern as the overlay's own existing close button) lets the user
  dismiss just the phone, independent of closing the whole examine
  overlay.
- No ADR needed: this is a presentation/demo-convenience decision with no
  product authorization or fairness-rule weight — the project's own
  convention (per `docs/adr/0012`, `0013`, `0014`) is ADRs for decisions
  that change who can do what or how trust/authorization works. This
  changes neither; it's routine UI, same tier as the Stage 6 visual pass
  that was folded straight into `plans/3d-walkthrough.md` with no ADR.

## Build plan

### Stage 1 — the button and the phone frame (no new routes, no schema)

- `src/laundry-view.ts`: extend `openMachineExamine(machineId)`'s HTML
  with the new quiet link, plus a small inline `<script>`-free DOM
  wire-up (consistent with the rest of this file's plain
  `addEventListener` style, no new framework) that, on click, inserts the
  phone-frame markup (the `<iframe>`, `src` set to `/` — plain `/`, not a
  machine-scoped scan URL, since the person is already identified and the
  home page already shows every machine including this one) and toggles
  a CSS class controlling the overlay's two-column layout.
- `src/views.ts`: the new `.laundry-examine-overlay` layout rule (flex
  row/wrap) and the new `.phone-frame`/`.phone-frame iframe` rules, added
  next to the existing `.laundry-examine-overlay` block (~line 303) —
  kept as plain CSS additions, no restructuring of the existing rules.
- A one-line code comment at the new button's HTML, and the Stage 1
  commit message, both state explicitly: *this simulates what a phone
  would show after scanning; it does not replace or satisfy the real
  two-device phone rehearsal `plan.md` still has outstanding* — so the
  distinction survives in the repo, not just in this plan file.
- **Verify:** Playwright — open `/laundry`, approach a reservable
  machine, interact, confirm the QR `<img>` is still present and
  unchanged; click "Simulate a phone scan," confirm an `<iframe>` appears
  showing the real home page (assert on real page content inside the
  iframe's `contentDocument`, e.g. the machine board, not just that an
  iframe element exists); inside that iframe, join a queue, confirm the
  join actually lands in the database (same assertion style
  `spec/laundry-handoff.test.ts` already uses: check real server state
  after the action, not just a 200 response) and that `/laundry/machines-
  state` (or a 3D-scene state inspection, matching how `spec/laundry-
  scan.test.ts`/Stage 10's own verification already probes real state
  from outside the 3D canvas) reflects the change.

### Stage 2 — spec coverage

- A new `spec/laundry-scan-simulator.test.ts` (or folded into the
  existing `spec/laundry-scan.test.ts` if small enough once written —
  decide at implementation time by actual line count, not up front): a
  Playwright test driving the simulated phone end-to-end (open overlay,
  open phone frame, claim/join inside the iframe, confirm real reservation
  state changed). This is the first Playwright-driven iframe interaction
  in the spec suite — check `spec/laundry-presence.test.ts`'s own existing
  note that no prior spec drives multiple browser *contexts*; this is a
  single context with an iframe, which is simpler, but confirm the
  Playwright API for asserting inside `frameLocator()` before assuming the
  existing page-level assertions compose directly.
- No change needed to `spec/laundry-scan.test.ts` itself — the real `GET
  /laundry/scan/:id` route this plan reuses is untouched.

## What this explicitly does not do

- Does not add a new route, a new view function, or any duplicated HTML
  of the home page's content — `GET /` is reused as-is.
- Does not touch `src/queue.ts`, `src/schema.ts`, or any authorization
  boundary (`docs/adr/0002`, `0013`) — the iframe acts under the same
  cookie the person already has, with the same permissions as using `/`
  in a real second tab.
- Does not satisfy or replace Stage 4's real two-device phone-scan
  rehearsal — that item stays open in `plan.md` exactly as it is today.

## The "Machines" nav label

Separately raised: the top nav's `<a href="/">Machines</a>`
(`src/views.ts` line 621, also the literal page title `"Machines"` passed
to `page()` at line 1156 in `homePage()`) undersells what that page
actually is. Reading `homePage()` itself (lines 1136-1184): it's a
pinned "your status" block (your own active reservations, offers,
pending pickups, with a "Switch room" control) above a board of every
machine's queue state — i.e. **a personal status/reservation view with
the machine board underneath it**, not a bare machine list.

The rest of the repo already settled on a name for this: `plan.md` and
every crit plan (`plans/crit-9.md`, `plans/crit-10.md`,
`plans/3d-walkthrough.md`) consistently call this page "the home page" —
over 15 occurrences, zero uses of "Machines" as a concept anywhere
outside the nav link and the `<title>` string itself. "Machines" isn't
just inaccurate, it's the one place in the whole project not using the
term everywhere else already agrees on.

**Recommendation: rename the nav link (and the page `<title>`) to
"Home."** Reasoning:
- Matches the vocabulary already used everywhere else in `plan.md` and
  every plan file — zero new terminology introduced, zero risk of a
  fourth competing term.
- "Reservations" or "My Queue" were considered and rejected: the page is
  not only about the viewer's own reservations — the board half shows
  *every* machine's state for everyone, logged-in-viewer or not equally
  relevant, the same way `README.md`'s "What this is" describes the app
  as a shared queue view, not a personal reservations list. "Home" covers
  both halves without overclaiming either one.
- "Board" was also considered: it undersells the pinned status block the
  same way "Machines" undersold the board — the page is bigger than
  either half alone.
- This is a one-line, zero-risk text change (`src/views.ts` lines 621 and
  1156), bundled into Stage 1 above rather than its own stage.
