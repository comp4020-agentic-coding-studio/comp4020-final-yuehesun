# 0016: Claiming a reservation requires a real, recent scan — supersedes 0015

## Status

Accepted. Supersedes
[`docs/adr/0015-scan-gated-claim.md`](0015-scan-gated-claim.md), whose
own `Status` has been updated to point here rather than its text being
edited — the original "reject" reasoning stays on record exactly as
written, since a real fork (including one that gets reversed) is worth
keeping legible, not quietly rewritten.

## Context

Full background, every argument from both passes at this question, and
the exact build plan: [`plans/laundry-scan-gated-claim.md`](../../plans/laundry-scan-gated-claim.md).
Condensed here:

The home page's "Claim (scan)" button let a resident claim their
front-of-queue reservation with no scan of any kind — "scan" in the
label was a leftover from crit 8, when no real machine or QR code
existed to scan. Once the 3D walkthrough shipped real, scannable
per-machine QR codes ([`docs/adr/0012`](0012-3d-walkthrough.md)), a
separate session's first pass at this question (0015) concluded
"reject," reasoning that gating claim behind a scan would narrow the
project's own "a phone alone is enough" claim, that the QR code carries
no real trust signal worth gating on, that it would fork production/
test behaviour, and that it needs new, non-trivial state with open
questions.

The user overruled that rejection with three real counter-arguments —
full detail in `plans/laundry-scan-gated-claim.md`'s own "The decision
history" section and `process-notes.md`'s matching entry:

1. Claim, start being two separate taps was always strange without a
   real arrival check behind it — the 3D room is exactly what makes that
   check possible now.
2. Letting someone claim from their phone with no presence check is
   itself the unfair thing: they can sit on a machine without ever
   coming down, blocking whoever's actually next.
3. This isn't a change to the fairness/ordering rule — just a new
   precondition on one existing action.

On inspection, the counter-arguments held up: `claim()` genuinely never
verified any form of arrival, which is a real gap against this project's
own documented meaning of "claim" (plan.md's User story: "Claiming
means the machine is theirs because they've arrived"). 0015's strongest
argument (no real trust signal worth gating on) didn't survive — an
unverified scan event still does the same kind of soft-but-real work an
unverified room number already does for identity everywhere else in
this app. 0015's "would fork production/test behaviour" argument also
didn't survive: every existing spec and the simulator already call
`join()` before `claim()` to build up real preconditions, so a new
`recordScan()` function, called identically by production and every
test/sim caller, adds one more precondition without forking anything.

## Decision

**Built.** `claim()` (`src/queue.ts`) now requires a real, recent
(`SCAN_VALIDITY_MS` = `OFFER_CLAIM_WINDOW_MS`, 10 minutes) scan of the
*exact machine being claimed*, recorded by `recordScan()` and checked by
`hasValidScan()`. The one real place a scan gets recorded is `GET
/laundry/scan/:id` (`src/app.ts`) — the route a real phone's camera
lands on after scanning the machine's actual code, and the same route
the 3D room's QR codes and the phone-simulator's iframe both point at.
The home page's "Claim (scan)" button is unchanged and unremoved; it now
simply fails with a distinct message ("scan the machine's code first"),
rendered through a new `scanRequiredPage()` naming where to go
(`/laundry`), when no valid scan exists yet.

A new `scans` table (`drizzle/0008_tidy_firestar.sql`) records every
scan — a real, persisted table, not an in-memory structure like
`presence.ts`, since losing a scan record on restart would silently and
permanently block a real claim attempt.

Every existing caller of `claim()` — `spec/*.test.ts` (five files),
`spec/support/queue-client.ts`/`offer-client.ts`, and `sim/driver.ts`
(via a new `"scan"` Action kind, now generatable by
`spec/fairness-properties.test.ts`'s own random-sequence property test)
— was taught to scan first, through the same real
`recordScan()`/`GET /laundry/scan/:id` mechanism production itself uses.
No env var, flag, or code path behaves differently under test than in
production.

## Consequences

- Claiming now means what `plan.md`'s own User story has always said it
  means — "the machine is theirs because they've arrived" — enforced,
  not just documented.
- `README.md`'s "a phone alone is enough" claim stays true: the gate is
  satisfied by a real phone camera scanning a real code, with no
  dependency on the 3D scene, WebGL, or a desktop session ever running.
- The three original reservation paths (auto-assign, pick a machine,
  scan-to-reserve-fresh) are unaffected — only the already-existing
  "arrived, claiming" action gained a precondition.
- `moveBackOnePlace`/`settleMachine` and every other fairness/position-
  ordering rule are untouched — confirmed directly, not assumed:
  `moveBackOnePlace` never changes which machine a reservation is on, so
  a scan recorded against one machine never needs to carry across a
  fairness swap.
- An offer (`docs/adr/0005`) accepted onto a *different* machine than
  whichever was last scanned correctly has no valid scan yet for that
  new machine — the resident must scan it before claiming, same as any
  other claim.
- `docs/adr/0015` stays in the repo, its rejection reasoning intact and
  unedited, with its `Status` field pointing here.

## What this does not do

- Does not add a cryptographic or otherwise unforgeable proof of
  physical presence — `docs/adr/0012`'s own trust model (the QR code is
  "exactly as trustworthy as a sticker on a real machine") is unchanged.
  The gate requires a real action (scanning something), not a
  verified one.
- Does not change any queue-ordering, fairness, or offer-eligibility
  rule.
