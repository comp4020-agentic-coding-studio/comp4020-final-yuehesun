# 0015: Requiring a 3D-room scan before claiming — considered and rejected

## Status

Rejected, then overruled. **This rejection did not hold** — see
[`plans/laundry-scan-gated-claim.md`](../../plans/laundry-scan-gated-claim.md)'s
own "The decision history" section for exactly which of the five
arguments below survived being challenged and which didn't. Kept
verbatim, unedited, as the real record of the first pass at this
question — `CLAUDE.md`'s process rule is to log a real fork, not just
what shipped, and that applies doubly once the fork gets reversed: the
losing position stays legible, not quietly rewritten to look like it was
never seriously held. The superseding decision belongs in a new ADR
(0016, once built), not in an edit to this one.

## Context

Raised after the 3D walkthrough and its real per-machine QR codes
(`docs/adr/0012`) were already live: the home page's own "Claim (scan)"
button lets a resident claim their front-of-queue reservation with one
click, no scan involved — "scan" in its label is a leftover from crit
8, when there was no real machine or QR code to scan at all (see
`README.md`'s original framing: claiming is simulated as an on-page tap
standing in for a real scan-to-pay motion). Now that a real, scannable
QR code exists per machine (`GET /machines/:id/qrcode.png`,
`GET /laundry/scan/:id`), the question raised was whether the home
page's click-to-claim should be gated behind actually having scanned
that code in the 3D room first — otherwise, the argument goes, the 3D
room's realism is undercut by a same-effect shortcut sitting right next
to it on the home page.

The proposal, as raised: a resident who presses "Claim" without having
scanned would see a prompt — "Please scan in the laundry room first" —
and the 3D room's nav entry would need to be unmistakably the thing
that prompt refers to, otherwise the message leaves someone not
understanding what to do next.

## Decision

**Not built.** The home page's click-to-claim stays exactly as
authorized as it is today — no new "have you scanned" precondition on
`claim`.

### Why

1. **It isn't filling a real gap — claim was never meant to require a
   scan.** `plan.md`'s own User story (written at crit 8, before any 3D
   room existed) already describes three parallel ways to reserve: let
   the app auto-assign, pick a machine on the page, or walk up and scan
   on site. Claiming (the 3-minute-window action once a reservation is
   front of its queue) was always the on-page motion standing in for
   "arriving and starting the real machine" — see `README.md`'s own
   account of why starting is simulated as a click. The 3D room's QR
   codes (`docs/adr/0012`) added a *second, more literal* way to reach
   that same click (`GET /laundry/scan/:id` redirects an identified
   visitor straight to the real claim action on the real home page); they
   were never meant to become the *only* way. Gating claim behind a scan
   would be retiring one of the three original reservation paths
   `plan.md` has described since crit 8, not closing a hole that opened
   later.

2. **The project's own "good" argument is explicit that a phone alone is
   enough.** `README.md`: *"All a user needs is a phone to queue, making
   doing laundry lighter."* A scan-gated claim would mean a resident
   needs a phone **and** a prior trip through a WebGL-rendering 3D scene
   (camera/microphone-adjacent permissions aside, three.js itself isn't
   guaranteed to run on every phone or browser `README.md`'s claim
   implicitly covers) before the queue's core action works at all. That
   directly narrows a claim this project has already published.

3. **The 3D room's own QR codes carry no real trust signal to gate
   on.** `docs/adr/0012`'s whole decision is that the QR code is
   "exactly as trustworthy as a sticker on a real machine" — unsigned,
   untimed, no state tied to the specific device or person that scanned
   it. Recording "this identity scanned machine M" and later checking it
   before allowing a claim wouldn't be verifying anything true about
   where the resident physically is; it would just be a second typed
   room number with extra steps, exactly the same unenforceable trust
   `docs/adr/0002`/`0004` already describe for identity itself. The
   proposal doesn't make the app any harder to fool — it only makes the
   honest path slower.

4. **It would fork queue-authorization behaviour between production and
   every test/simulation harness, which `CLAUDE.md` explicitly rules
   out.** `claim()` (`src/queue.ts`) is called directly, with no scan
   step, by nearly every `spec/*.test.ts` file and by `sim/`'s own driver
   (`docs/adr/0007`). Gating it behind "has this identity recently
   scanned this machine" would require either (a) teaching every spec
   and the simulator to fabricate a scan event first — a second, parallel
   way to reach the same real authorization check, which is exactly the
   "a copy can pass while the real rules fail" risk `CLAUDE.md`'s test
   harness rules exist to prevent — or (b) a test-only bypass flag on
   `claim()` itself, which is the literal shape `CLAUDE.md` names and
   forbids: *"No env var, route, setting, or default reachable in
   production selects anything other than [the documented behaviour]"*
   (written about the missed-window policy, but the same principle: a
   production code path that behaves differently under test is a code
   path nobody's test coverage actually exercises).

5. **The scan-gate itself would need new, non-trivial state — exactly
   the kind of thing `CLAUDE.md`'s "write the design down before code"
   rule exists for, not a quick addition.** A real implementation has to
   answer, before any code: where is "identity X scanned machine Y"
   recorded (a new table — scans are infrequent per reservation, unlike
   `presence.ts`'s continuous per-frame state, so it likely isn't an
   in-memory structure the way presence is); how long does a scan stay
   valid (indefinitely reopens "can I scan once and claim any time
   later," which is no gate at all; too short and a resident who steps
   away between scanning and their actual turn — which could be many
   minutes, per the existing claim-window/offer mechanics — gets locked
   out of their own already-fair turn); what happens to an offer
   (`docs/adr/0005`)'s own 10-minute claim window, which can land on a
   *different* machine than whichever one was last scanned; and how a
   resident recovers if they scanned machine 3 but the fairness rule has
   since moved them to machine 5. None of this is "wire an existing
   thing to a new button" — it's a new, small state machine with its own
   failure modes, the exact trigger `CLAUDE.md`'s planning rule names for
   requiring a written design before any code.

6. **Timing.** Raised with under a day left before the final project
   deadline, on the single most load-bearing authorization path in the
   app (`claim`, gating every reservation's actual fulfillment). Even
   setting aside 1-5 above, this is not a change to make under that time
   pressure — `CLAUDE.md`'s own rule that a repeatedly-failing check means
   stepping back, not pushing through, applies in spirit to a
   high-risk, low-reversibility change attempted this close to a
   deadline with no prior design pass.

## What was considered and preferred instead

The real, narrower problem underneath the request — that a resident
might not realize the 3D room exists, or that it's the "more real"
version of the same action — is a **discoverability** problem, not an
authorization gap. The home page's existing "Claim (scan)" button
(`src/views.ts`'s `actionButtons`) can carry a quiet, adjacent link to
`/laundry` ("or scan in the 3D laundry room →") with no change to
`claim()`'s own authorization, no new state, no test/simulation fork,
and no narrowing of the "a phone alone is enough" claim — a resident who
never touches the 3D room still claims exactly as they do today. This is
a one-line addition on the scale of the "Machines" → "Home" nav rename
(`plans/laundry-scan-phone-simulator.md`), not something that needs its
own plan file or ADR.

## Consequences

- `claim()`'s authorization is unchanged: front of the queue, your own
  identity, within the 3-minute window — exactly as `docs/adr/0005` and
  `src/queue.ts` already specify.
- The home page's click-to-claim remains a fully supported, first-class
  path, not a tolerated legacy shortcut — `plan.md`'s three original
  reservation paths stay three.
- If a future decision genuinely wants scan-gated claiming, it must be
  planned as a new feature in its own plan file (not folded into
  `plans/3d-walkthrough.md` or `plans/laundry-presence.md`), answering
  the open questions in point 5 above before any code, and must not
  introduce any claim-authorization behaviour reachable in production
  but not exercised by `spec/`'s and `sim/`'s existing direct calls into
  `queue.ts`.
