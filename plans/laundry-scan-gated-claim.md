# Scan-gated claim plan — requiring a real 3D-room scan before claiming

## Read first

- Overall vision: [`plan.md`](../plan.md) — the User story section
  (claiming is the resident's "I've arrived" moment; three parallel
  reservation paths: auto-assign, pick on the page, walk up and scan),
  feature #14 (claim vs. start as separate actions), and
  [`docs/adr/0012-3d-walkthrough.md`](../docs/adr/0012-3d-walkthrough.md)
  (the QR code's own unprotected-link trust model, and its addendum on
  carrying the room number as a prefill convenience).
- [`docs/adr/0015-scan-gated-claim.md`](../docs/adr/0015-scan-gated-claim.md)
  — **read this first, in full, before writing any code.** An earlier
  pass at this exact question (written the same day, by a separate
  session running in parallel with this one) concluded *reject* and
  logged five numbered arguments for why. The user overruled that
  rejection with real counter-arguments — see "The decision history"
  below for exactly which of those five arguments held up, which didn't,
  and why the rejection is itself now the superseded position, not the
  standing one. This plan exists because that overrule happened; it does
  not re-litigate the parts of 0015 that remain true (the project's own
  "good" argument, the no-test-fork rule, the need for a written design
  before code) — it satisfies them instead of ignoring them.
- `src/queue.ts` — `claim()` (currently: loads the reservation, checks
  it's the owner's, checks it's front-of-queue and `waiting`, sets
  `status: "claimed"`). This plan adds a new precondition to this
  function, not a new code path alongside it — see "Where the gate
  lives" below for why it must be inside `claim()` itself, not in
  `src/app.ts`.
- `src/app.ts` — `GET /machines/:id/qrcode.png`, `GET /laundry/scan/:id`
  (docs/adr/0012's addendum already reads the identity cookie here and
  prefills the room field; this plan adds a second thing that route does
  for an *already-identified* visitor), `actionRoute()` (the generic
  wrapper every simple action, including `claim`, is registered through —
  this plan's new rejection reason needs to render through the existing
  `errorPage()`, not a new response shape).
- `src/laundry-view.ts` — `openMachineExamine()`'s "Simulate a phone
  scan" iframe currently points at `/` (the real home page), not
  `/laundry/scan/:id` (the real scan landing route) — confirmed by
  reading the code, not assumed. This matters a lot for this plan: the
  phone-simulator's whole premise
  ([`plans/laundry-scan-phone-simulator.md`](laundry-scan-phone-simulator.md))
  is "this iframe is a real, unmodified instance of whatever a real scan
  already leads to" — if a gated claim lives on the home page and the
  simulator still points at `/`, the simulator would need its own
  stand-in scan event or it silently stops being able to demonstrate a
  claim at all. See "The phone-simulator's iframe" below.
- `src/views.ts` — `actionButtons()` (the home page's "Claim (scan)"
  button), `errorPage()` (the simplest existing way to show a rejection).
- `src/schema.ts` — this plan's new state needs a new column or table;
  see "Where the scan record lives" below for which, and `CLAUDE.md`'s
  schema rule (`drizzle-kit generate`, commit the migration, never edit
  one after the fact) applies.
- `sim/driver.ts`, `spec/support/queue-client.ts`,
  `spec/support/offer-client.ts` — every existing caller of `claim()`
  over HTTP or in-process. This plan's "no test/sim fork" requirement
  means every one of these needs to be taught the new precondition using
  the *same real function* production uses, not a bypass — see "No
  fork, by construction" below for exactly how.

## Background

**What prompted this.** Raised after the 3D walkthrough shipped real,
per-machine QR codes
([`docs/adr/0012`](../docs/adr/0012-3d-walkthrough.md)): the home page's
"Claim (scan)" button lets a resident claim with one click, no scan
involved — "scan" in its own label is a leftover from crit 8, when there
was no real machine or QR code to scan at all (`README.md`'s original
framing: claiming is simulated as an on-page tap standing in for a real
scan-to-pay motion). The question: now that a real, scannable QR code
exists per machine, should the home page's click-to-claim require having
actually scanned that code first?

## The decision history (read before building anything)

A first pass at this question, run in a separate, parallel session the
same day, concluded **reject** and wrote
[`docs/adr/0015-scan-gated-claim.md`](../docs/adr/0015-scan-gated-claim.md)
with five numbered arguments. The user read that rejection's reasoning
(independently reconstructed in this conversation, not literally copied
from 0015, but landing on overlapping points) and pushed back with three
real counter-arguments. Here is each of 0015's five arguments, whether it
survived the pushback, and why:

1. **"Claim was never meant to require a scan — it's one of three
   original reservation paths."** *Partially survives, reframed.* The
   user's actual position is narrower than "retire a reservation path":
   nothing about *auto-assign* or *picking a machine on the page* is
   touched by this plan at all — those are how you get a reservation in
   the first place. The gate only applies to **claim**, the specific
   "I've physically arrived" moment `plan.md`'s own User story already
   describes in those words ("Claiming means the machine is theirs
   because they've arrived"). The user's point: a click that claims a
   machine with no arrival check *contradicts* that documented meaning
   of claim, rather than being a legitimate alternate path to it. This
   plan agrees with the user: the three reservation paths (#11, #14, the
   User story) are unaffected; only the single already-documented
   "arrived" semantic of claim is being made to actually mean what it
   says.

2. **"README's 'a phone alone is enough' claim would be narrowed."**
   *Survives as a real constraint, but doesn't block the feature — it
   constrains how it's built.* A resident must still be able to do
   everything with a phone. The gate must not require a *desktop* 3D
   session (`/laundry`'s current third-person camera/WASD controls are
   desktop-shaped) — it requires having scanned a *real* QR code, which
   is phone-camera-native and needs no desktop session or WebGL 3D scene
   at all. Reading `docs/adr/0012` and `docs/adr/0012`'s addendum
   together: the existing `/laundry/scan/:id` route, reached by a real
   phone camera scanning a real sticker (or the 3D room's on-screen code,
   which is one way to display that same sticker, not the only way), is
   already the literal "scan with a phone" mechanism. The gate attaches
   to *that* route's own action, not to having visited the 3D scene.
   `README.md`'s claim survives intact: "a phone" still suffices,
   because a phone's camera scanning any printed/displayed code is the
   whole mechanism — see "Where the gate lives" below.

3. **"The QR code carries no real trust signal to gate on — it's just a
   second typed room number with extra steps."** *Does not survive,
   on inspection of what's actually being checked.* 0015's argument is
   that the code is unsigned/untimed per `docs/adr/0012`, so recording
   "identity X scanned machine Y" verifies nothing true about physical
   presence. But the user's counter-argument is sharper than "verify
   presence": **the gate doesn't need to prove presence cryptographically
   to be worth having — it needs to make clicking "Claim" require an
   extra real-world action (physically finding and scanning a code) that
   a resident sitting in their room cannot do by pure reflex.** This is
   exactly the same honesty-by-friction shape `docs/adr/0012` itself
   already accepts for identity: a room number isn't verified either, but
   requiring *some* number (not nothing) still does real work. A scan
   event is the same kind of soft-but-real gate, not a cryptographic one,
   and 0015 holds it to a standard (unforgeable proof of location) the
   rest of this app's own trust model never claims to meet anywhere else.
   **This is the single argument of 0015's five that this plan treats as
   actually wrong, not just outweighed.**
4. **"It forks queue-authorization behaviour between production and
   every test/simulation harness."** *Does not survive — a real
   alternative exists and this plan uses it.* 0015 frames the choice as
   "teach every spec/sim to fabricate a scan event" (a parallel, fake
   path) vs. "a test-only bypass flag" (exactly what `CLAUDE.md`
   forbids). Both are false alternatives: `spec/*.test.ts` and `sim/`
   already call `join()` before `claim()` to build up real preconditions
   — "set up the real state, then call the real action" is this
   project's existing test pattern, not a special case. If scanning
   becomes a new, real, `queue.ts`-exported function
   (`recordScan(machineId, personName)`, say), every caller — production
   route, spec file, `sim/driver.ts` — calls that *same* real function to
   set up the precondition before calling `claim()`, identically to how
   they already call the real `join()` first. See "No fork, by
   construction" below for the concrete shape.
5. **"The scan-gate needs new, non-trivial state, with open questions
   (how long does a scan stay valid, what about offers landing on a
   different machine, recovery if fairness moves you)."** *Survives in
   full — this is exactly why this plan exists before any code.* These
   are real, unanswered design questions. This plan's whole job is
   answering them before writing a line of `queue.ts` — see "Scan
   validity window," "Interaction with offers," and "Recovery" below.
   0015's point that this needs a written plan, not a quick addition, is
   correct and is why this file exists.

0015's sixth point ("timing — under a day before the deadline") is a
scope/sequencing call, not a design argument; it's addressed in "Scope
for right now" at the end of this plan, not relitigated here.

**What this means for 0015 itself.** It stays in `docs/adr/` with its
`Status: Rejected` unchanged — it's a real decision record of a real
rejected position, and `CLAUDE.md`'s own process rule says to log a real
fork even when (especially when) it gets reversed, not delete the
losing side. This plan's own status, once built, becomes a new ADR
(`0016`, numbered after it) that explicitly supersedes 0015 rather than
editing 0015 to pretend the first pass never happened.

## Where the gate lives

**Correction, found while re-reading this plan before building anything
(per `CLAUDE.md`'s own rule — verify a memory/claim against the current
code before acting on it): the paragraph originally here described
calling `recordScan()` from inside `scanClaimConfirm()`/
`scanReservationForm()`/`scanReadOnly()`. Those three functions, and the
`scanPage()` that dispatches to them, are dead code** — confirmed by
grepping the whole repo: nothing outside `src/laundry-view.ts`'s own
function definitions calls `scanPage()`. Stage 10
(`plan.md`'s own Current state entry: *"Scanning a machine while already
identified now redirects (303) to the real home page instead of the
separate scan-page shape — the existing scan-page code itself is
untouched, per the user's explicit correction, only the already-logged-in
route's destination changed"*) replaced the branch that used to render
`scanPage()` with a plain `c.redirect("/", 303)`, by explicit user
request *not* to touch the scan-page functions themselves — so they were
left in place, unreferenced, rather than deleted. Building this plan
against the old (wrong) description would have edited functions no real
request ever reaches, landing no actual gate.

**The real, current shape of `GET /laundry/scan/:id`** (`src/app.ts`,
current lines ~242-261): machine lookup and 404, then — no identity:
render `scanIdentityPage` (with the ADR 0012-addendum `?room=` prefill);
identity present: a single `return c.redirect("/", 303);`, no
intermediate render at all. Every identified scan, regardless of the
machine's state, already funnels through this one line today.

**Concretely, with the actual insertion point:**

- `GET /laundry/scan/:id`'s existing identified branch gains one line,
  immediately before the existing `c.redirect("/", 303)`:
  `queue.recordScan(machineId, identity);`. No branch on machine/queue
  state is needed here — recording a scan is unconditional on reaching
  this route at all (whether this scan is actually useful depends on
  `claim()`'s own precondition check later, not on anything decided at
  scan time).
- `src/queue.ts`'s `claim()` itself gains the new precondition: it
  succeeds only if a scan record exists for this `(machineId,
  personName)` pair, recorded within the scan validity window (below).
  This is the one place the check lives — not duplicated in
  `src/app.ts`, so there's exactly one authorization rule to keep
  correct, the same reasoning `CLAUDE.md`'s test-harness rules already
  apply to every other queue rule.
- The home page's own "Claim (scan)" button (`src/views.ts`'s
  `actionButtons()`) **stays, unremoved** — it still posts to
  `/reservations/:id/claim`. What changes is that `claim()` itself now
  rejects the attempt (409, not a crash) if no valid scan record exists
  yet, with a message the home page renders through the existing
  `errorPage()` *action-result* path (see "Rejection message and the 3D
  room link" below) — not a redesign of the button into something new.
  A resident who already scanned (via the 3D room, or a sticker, or the
  no-phone phone-simulator — see below) and is now sitting on the home
  page with their reservation front-of-queue can still click "Claim
  (scan)" there and have it succeed, because the scan record already
  exists; the button was never the problem, the missing precondition
  check was.
- **The dead `scanPage`/`scanClaimConfirm`/`scanReservationForm`/
  `scanReadOnly` functions are left exactly as they are** — this plan
  doesn't resurrect them, delete them, or route anything through them.
  They're pre-existing dead code outside this plan's own scope; touching
  them isn't needed to make the gate work, and removing dead code the
  user didn't ask about isn't this plan's call to make.

This keeps `README.md`'s "a phone alone is enough" claim true (argument
2 above): a phone's camera scanning the sticker on the machine is the
entire mechanism, with no dependency on the 3D scene, WebGL, or a
desktop session. The 3D room is simply the venue this project built that
*displays* a real, scannable code — not a precondition of its own.

## Where the scan record lives

**A new table, `scans`, not a new in-memory structure like
`presence.ts`.** Reasoning, directly against `docs/adr/0014`'s own
precedent for the opposite call:

- `docs/adr/0014` keeps presence in-memory specifically because presence
  is continuous, per-frame state where losing it on a restart is
  harmless (a resident's character just reappears on their next report).
  A scan record is the opposite shape: a single, infrequent event whose
  loss would silently and permanently block a real claim (a scan five
  minutes before a server restart, followed by the claim attempt two
  minutes after it) — the same durability argument `plan.md`'s own
  "persists" requirement already makes for reservations themselves.
- Schema (via `drizzle-kit generate`, a new migration, never editing a
  committed one, per `CLAUDE.md`):
  ```
  scans: {
    id: integer primary key autoincrement,
    machineId: integer not null references machines.id,
    personName: text not null,
    scannedAt: integer not null,          // ms since epoch, via clock.now()
  }
  ```
- `recordScan(machineId, personName)` (new, exported from `src/queue.ts`,
  reading time only through `src/clock.ts` per `CLAUDE.md`'s own rule for
  this file): inserts a row. No uniqueness constraint — a resident can
  scan the same machine repeatedly (re-scanning after walking away and
  coming back is a normal, expected case, not an error).
- `hasValidScan(machineId, personName, now)` (new, exported): true iff a
  `scans` row for this exact pair exists with `scannedAt` within
  `SCAN_VALIDITY_MS` of `now`. `claim()` calls this as its new
  precondition.

## Scan validity window

0015's open question #5 flagged this correctly as unanswered. The
answer, reasoned from the existing claim-window mechanics already in
`queue.ts`:

**`SCAN_VALIDITY_MS` = `OFFER_CLAIM_WINDOW_MS` (10 minutes), not a new,
separately-tuned constant.** Reasoning: the realistic gap this needs to
cover is "scanned the code, then walked back upstairs to get a phone/
confirm on the home page, or simply paused before clicking Claim" — the
same order of magnitude the project's own 10-minute offer-claim window
already treats as "enough time to physically travel to a machine you
weren't already standing at" (`plan.md`'s own User story: "accept, and
they have 10 minutes to come down and scan"). Reusing this constant
instead of inventing a new one avoids a second, independently-tuned
timing value with no stated reasoning of its own — if the offer window
is ever retuned, the scan-validity window moves with it, which is the
same coupling already correct for a different but comparable
"how long until arrival is still plausible" judgment.

This directly answers 0015's "too short and a resident who steps away
between scanning and their actual turn gets locked out" concern: 10
minutes is generous enough that scanning, then waiting out a normal
claim window (3 minutes) or even most of an offer window, still leaves
the scan valid when claim is finally attempted. A resident who scans far
earlier than that (e.g., scans while walking past a machine well before
their own turn comes up) will need to re-scan when their turn actually
arrives — this is accepted as correct, not a bug: a 10+ minute-old scan
genuinely doesn't establish "currently present" any more usefully than no
scan at all.

## Interaction with offers

0015's open question: an accepted offer (`docs/adr/0005`) lands on a
*different* machine than whichever one was last scanned, with its own
10-minute claim window. **The gate applies identically — `hasValidScan`
is checked against the *offer's* machine, same as any other claim.** A
resident accepting an offer for machine 5 while they'd only ever scanned
machine 3 has no valid scan for machine 5 and must scan it before
claiming — this is correct, not an edge case to special-case around: the
whole point of the gate is "you're standing at the machine you're about
to claim," and an offer doesn't change which machine that has to be true
for. The 10-minute offer-claim window and the (now identical) 10-minute
scan-validity window run in parallel from different start events (offer
acceptance vs. scan time) — no interaction beyond both needing to be
satisfied before `claim()` succeeds.

## Recovery: fairness moves you to a different machine after scanning

0015's open question: if the fairness rule's `moveBackOnePlace` swaps a
resident onto consideration for a different machine's queue position
after they've already scanned machine 3. **This doesn't actually happen**
— confirmed by reading `moveBackOnePlace()` (`src/queue.ts`): it swaps
`joinedAt`/`status` between two reservations *already on the same
machine's queue*; it never moves a reservation to a different
`machineId`. A resident's scan always stays valid for the one machine
their reservation is actually on. The only mechanism that changes which
machine a resident is queued on at all is accepting an offer (handled
above) or cancelling and re-joining elsewhere (a new reservation, where
scanning the new machine is obviously required and unsurprising). 0015's
open question was based on a reasonable-sounding but, on inspection,
incorrect assumption about what `moveBackOnePlace` actually does — worth
recording here since 0015 treated this as an open risk rather than
checking it directly.

## No fork, by construction

Every current caller of `claim()`:

- **Production** (`src/app.ts`'s `actionRoute("/reservations/:id/claim",
  ...)`): reaches `recordScan()` via the real
  `GET /laundry/scan/:id` route, exactly as a real scan does.
- **`spec/*.test.ts`** (via `spec/support/queue-client.ts`'s `claim()`
  helper and `spec/support/offer-client.ts`): gains one new line before
  calling `claim`: a real HTTP hit to `GET /laundry/scan/:id` for the
  room/machine pair under test (the exact route production uses — same
  database row gets written, same `recordScan()` function runs). This is
  additive to every existing test, not a rewrite of what they assert —
  each file's own existing assertions about claim's *other* preconditions
  (ownership, front-of-queue, window timing) are unaffected, since this
  is one more precondition alongside them, not a replacement.
- **`sim/driver.ts`**: gains a new `Action` kind, `{ kind: "scan"; room:
  string; machineId: number }`, calling `h.queue.recordScan(...)`
  directly (same pattern as every other action kind already does for its
  own `queue.ts` function) — `fast-check`'s own generators
  (`spec/fairness-properties.test.ts`) need a scan action inserted before
  a claim action in any sequence that's supposed to succeed, exactly
  mirroring how a join must already precede a claim in any valid
  sequence that harness generates today.

No new env var, flag, or production-unreachable code path is introduced
anywhere — every caller reaches `claim()`'s new precondition through the
same real `recordScan()` function production itself calls, which is
exactly `CLAUDE.md`'s own existing rule (quoted in 0015 as a reason to
reject, now satisfied as a reason this plan is buildable).

## The phone-simulator's iframe

Confirmed by reading `src/laundry-view.ts`: `openMachineExamine()`'s
"Simulate a phone scan" button's iframe currently loads `src="/"` (the
real home page), **not** `/laundry/scan/:id`. Once claim is gated, a
resident using the phone-simulator from a machine they haven't
physically-equivalent-scanned would see the iframe's own home page
reject a claim attempt with the new "scan first" message — correct
behaviour, but it would make the simulator *look* broken (per
`plans/laundry-scan-phone-simulator.md`'s own stated purpose: "someone
evaluating the build without a real phone... claim, start, the works").

**Fix: change the simulator's iframe `src` from `/` to
`/laundry/scan/{machineId}`**, where `machineId` is the examine
overlay's own already-known machine id. For an already-identified
visitor (the normal case once this plan's `recordScan()` line is added —
see "Where the gate lives" above), this route now records the scan and
redirects to `/`, landing the iframe on exactly the same real home page
it shows today — the visible destination doesn't change, but the scan
this plan's gate checks for now actually gets recorded first, which is
the entire point of switching the iframe's `src` at all. (The dead
`scanClaimConfirm()`/`scanReservationForm()`/`scanReadOnly()` branch
this paragraph originally described never renders here either way — see
the correction above.) No change needed to the identity-prefill logic
already built — `/laundry/scan/:id` already handles both the identified
and unidentified case correctly.

## Rejection message and the 3D room link

0015's own "What was considered and preferred instead" section already
designed the discoverability fix correctly, and it's reused here
verbatim rather than redesigned: the message a resident sees when
`claim()` rejects for "no valid scan" is rendered through the existing
`errorPage()` path (same as every other `actionRoute` rejection), reading
"Scan the machine's code first — in the 3D laundry room, or with your
phone's camera on the real machine." with the existing
`<a href="/laundry">Go to the laundry</a>` nav link already being the
one, unambiguous thing this message needs to point at (it's the same nav
link every page already shows, not a new one invented for this message)
— satisfying the original request's own stated condition ("the laundry
room in the prompt needs to be clearly connected to the 3D entry in the
page, otherwise users might be confused").

## Build plan

### Stage 1 — schema and `queue.ts`

- `src/schema.ts`: new `scans` table (above). `drizzle-kit generate` for
  the migration; commit it; never hand-edit it afterward per `CLAUDE.md`.
- `src/queue.ts`: `SCAN_VALIDITY_MS` constant (= `OFFER_CLAIM_WINDOW_MS`),
  `recordScan(machineId, personName)`, `hasValidScan(machineId,
  personName, now)`. `claim()` gains the new precondition, returning a
  distinct message ("scan the machine's code first") so `src/app.ts`/
  `src/views.ts` can render the 3D-room-link version of the error
  specifically for this rejection reason, not a generic 409.
- **Verify:** a scratch-server test — join, attempt claim with no scan
  (expect the new rejection), `recordScan`, claim again (expect success);
  a scan older than `SCAN_VALIDITY_MS` (expect rejection); a scan for a
  *different* machine than the one being claimed (expect rejection).

### Stage 2 — wiring the real scan event

- `src/app.ts`'s `GET /laundry/scan/:id`: in the existing identified
  branch — currently just `return c.redirect("/", 303);` — add
  `queue.recordScan(machineId, identity);` immediately before that
  redirect. (The logged-out branch needs no change: it only ever shows
  `scanIdentityPage`, and the resident still has to complete identity and
  land back on this same route — via the existing `redirect` field — to
  reach the branch that actually records the scan, so there's no path
  that skips it.)
- `src/laundry-view.ts`: the phone-simulator's iframe `src` changes from
  `/` to `` `/laundry/scan/${machineId}` ``.
- **Verify:** over real HTTP — scan the real route, confirm a `scans` row
  now exists (query the scratch database directly, the same way other
  specs confirm real writes rather than trusting a 200); confirm the
  phone-simulator's iframe, opened from a specific machine's examine
  overlay, lands on that machine's own scan route and the same `scans`
  row gets written from inside the iframe.

### Stage 3 — the rejection message and nav link

- `src/views.ts`: the new rejection message's `errorPage()` call includes
  the existing "Go to the laundry" nav link text explicitly in the
  message body (not just relying on the page's own nav, so the
  connection is obvious even to someone who doesn't normally look at
  nav links) per "Rejection message and the 3D room link" above.
- **Verify:** a resident with no scan who clicks home-page "Claim (scan)"
  sees this exact message; the same resident, after scanning (confirmed
  via a real `GET /laundry/scan/:id` hit), succeeds on the next click, no
  code path change needed on the home page's own button.

### Stage 4 — spec and sim coverage

- `spec/support/queue-client.ts`/`offer-client.ts`: add a `scan(baseUrl,
  cookie, machineId)` helper (a real `GET /laundry/scan/:id` fetch); call
  it before `claim()` in every existing spec that currently calls claim
  directly — `spec/laundry-scan.test.ts`, `spec/laundry-handoff.test.ts`,
  `spec/queue-fairness.test.ts`, `spec/contention.test.ts`,
  `spec/queue-timing.test.ts` (the in-process `h.queue.claim()` calls
  there gain a preceding `h.queue.recordScan()`, mirroring the pattern).
- `sim/driver.ts`: new `"scan"` action kind; `spec/fairness-properties.test.ts`'s
  own action-sequence generator gains a scan action immediately before
  every generated claim action in a sequence meant to succeed (and,
  separately, a sequence that *omits* it to confirm the gate's own
  rejection is exercised by the property test too, not just the
  success path).
- **Verify:** full `pnpm check` green; specifically confirm no spec file
  silently started asserting a 409 it didn't before (a sign the new
  precondition broke something real, not just needing the new scan step
  added).

### Stage 5 — ADR and plan.md

- A new `docs/adr/0016-scan-gated-claim.md`, **superseding** `0015`
  explicitly (not editing 0015's own text) — recording the final
  decision, which of 0015's five arguments held up and which didn't (see
  "The decision history" above, condensed), and the five open-question
  answers (validity window, offers, recovery) this plan worked out.
- `plan.md`'s Current state gains an entry; feature #14 (claim vs. start)
  gets a note that claim now additionally requires a scan.

## What this explicitly does not do

- Does not change `moveBackOnePlace`, `settleMachine`, or any fairness/
  position-ordering logic — the gate is a precondition on `claim()`
  succeeding at all, not a change to who's next or when.
- Does not touch the three existing reservation paths (auto-assign, pick
  a machine, scan-to-reserve-fresh) — only the already-existing "arrived,
  claiming" action gains the precondition.
- Does not require a desktop 3D session — a real phone camera scanning a
  real sticker satisfies the gate with no dependency on `/laundry`'s own
  WASD/camera code ever running.
- Does not introduce any env var, flag, or code path that behaves
  differently in production vs. under test — every caller reaches the
  gate through the same `recordScan()`/`hasValidScan()` functions.

## Scope for right now

0015's sixth point (raised under a day before the final project
deadline) is a real scheduling constraint, not a design flaw in this
plan. This plan is written and ready to build, but building it now,
unverified, on the single most load-bearing authorization path in the
app, this close to a deadline, carries real risk if something in Stage 4
(the spec/sim retrofit, touching five existing spec files) doesn't land
cleanly on the first attempt. Whether to build this now or after the
deadline is the user's call, not a default either way — this plan is
written so that call can be made with the design already settled,
instead of under time pressure with open questions.
