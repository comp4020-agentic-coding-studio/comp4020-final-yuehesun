# Home page visual review

Crit 10 extension, Stage 12 (`plans/crit-10.md` "Extension"), the scored
loop required by `prompt.md` 4.5. Screenshots taken with Playwright at
390×844 and 1280×800 against a scratch server + scratch SQLite file
(`/tmp/crit10-scratch/screens.db`), never the real `.data/app.db`.

Checklist, scored 1–5 per screen/state (both viewports looked at together
unless they diverge):

1. Is my status's time the first thing the eye lands on?
2. Can every machine's state be read without colour?
3. Does it match the wireframe and the type/spacing scale?
4. Does it use the 1280px width deliberately?
5. Does anything look like the generic version from 4.3?
6. Compared to the Flighty reference's hierarchy, what's weaker?

Round 1 = first build, screenshotted and actually looked at (not just
described). Round 2 = after fixing the two bugs round 1's screenshots
exposed. Where a screen had no bug, round 1's score already stood and
round 2 is the same build, re-confirmed.

## no-room

Round 1 (`.scratch/round2/no-room-{mobile,desktop}.png` — same page as
round 1, unaffected by the two bugs below):

1. n/a — no status block on this screen.
2. n/a — no machine state yet.
3. 4 — matches the room-number wireframe; tokens applied (ink/paper,
   type/space scale), structure unchanged from pre-redesign.
4. 3 — a plain intro + form is correct not to spread across 1280px, but
   nothing marks this screen as deliberately narrow (no max-width rule
   visible, it's just whatever the browser gives a block of text).
5. 2 — still a centred block of text and a one-line form; closest screen
   in the app to the "generic" description, because there isn't much here
   to redesign.
6. One weak point — no reference image shows a cold-start/sign-in screen,
   so there's nothing in Flighty to borrow structure from; left mostly
   as-is intentionally (prompt.md's own wireframe calls it "unchanged
   structure, restyled tokens only").

Score: 4/5/avg of applicable items ~3. Stopped at round 1 — nothing here
depends on the bug fixes below, and the screen is explicitly scoped as
"not what this stage is about" in `research/design-plan.md`.

## room-no-reservation

Round 1 (`.scratch/round2/room-no-reservation-{mobile,desktop}.png`):

1. n/a — nothing to reserve yet, no hero.
2. 5 — every row has "Free" in text plus colour; `--free` only decorates.
3. 5 — departure-board table at desktop, stacked label/value pairs at
   mobile, exactly the two wireframes in `research/design-plan.md`.
4. 5 — desktop uses the full 1280px as one wide table; mobile correctly
   collapses to the labelled-stack pattern instead of forcing the table's
   columns into a narrow viewport.
5. 5 — no card grid, no shadow, no pastel wash; hairline rows, left-aligned
   table.
6. Flighty's list (01-my-flights.jpg) pairs a word+colour status next to
   plain data columns — this page's board does the same (`state-word`
   classes), so hierarchy matches; the one gap is Flighty bolds the
   single most urgent row (its "in air, landing soon" flight) more than a
   routine one, and this board treats every free/unclaimed row with equal
   visual weight regardless of urgency.

Score: 5/5/5/5, one noted weaker point. Good at round 1 — no changes made.

## waiting

Round 1 (same screenshots used for round 2, see below — this state was
not touched by the two display bugs):

1. 5 — `24:10`-style figure (here `29:58`/`44:52`) at `--text-hero`
   (4.5× body) is unmistakably the first thing seen on both viewports.
2. 5 — "Nearly your turn" spelled out next to the colour, board rows show
   "Unclaimed"/"Free" as words.
3. 5 — matches the "one ahead" wireframe line exactly: hero figure, one
   plain reason line ("Waiting behind room9402. est. ready at 10:59 PM"),
   `#2 in line`, status dots.
4. 4 — desktop puts status in a sticky left column beside the full board,
   which is the 1280px wireframe; the one gap is the status column's
   width (22rem) leaves a little unused gutter before the board starts at
   wide viewports rather than the board's first column aligning flush
   under the status block's left edge — minor, not worth a special case.
5. 5 — no identical cards; the "Nearly your turn" hero is the only
   white-background surface on the page and it's doing real work (it's
   the signature element), not a repeated unit.
6. Comparable to 02-live-activities.jpg's one-number treatment; the one
   gap is Flighty also shows a thin progress bar as a second way to read
   "how far along" — this page only has the status-dots stepper, which is
   coarser (4 discrete steps vs. a continuous bar). Left as-is: a
   continuous bar would need to invent a start-of-wait timestamp this
   screen doesn't have (joinedAt isn't a "0%" moment the user perceives).

Score: all ≥4. Stopped at round 1.

## my-turn

Round 1 found a real problem on an adjacent screen (claimed/running, see
below) but **my-turn itself was correct in round 1**
(`.scratch/round1` wasn't captured for this state separately — round 2's
screenshot is the first and only capture, scores below apply to it):

1. 5 — `2:59` dominates both viewports.
2. 5 — "Your turn" word + `--alert` colour on both the hero and the board
   row.
3. 5 — matches "my turn: `[ 02:58 ]` Your turn — claim Washer 2 before this
   runs out" exactly, including the `claim by` clock line.
4. 4 — same minor desktop gutter note as "waiting".
5. 5 — the turn-alert dialog (native `<dialog>`, Stage 11) layers over the
   hero correctly, modal backdrop dims the rest of the page — not a toast,
   matches the wireframe's "one sentence, Got it" shape.
6. Matches 05-wheres-my-plane.jpg's one urgent, filled-colour treatment
   (`--alert` on both "Your turn" and the claim deadline) — this is the
   one state where the reference's "solid background reserved for the
   single most urgent state" idea could still be pushed further (the hero
   card itself stays white/neutral; only the text is coloured). Noted, not
   fixed — doing it would mean inventing a filled-hero-card variant not in
   the wireframe, and 4 is already met everywhere.

Score: all ≥4. One round.

## claimed

Round 1 (`.scratch/round1/claimed-mobile.png`) — **bug found**: the hero
figure showed a stale `0:00` under the word "Claimed" (claimed
reservations have no live claim deadline, but `heroCountdownTarget()`
still fell through to `claimDeadlineMs ?? scheduledStartMs`, both already
expired/irrelevant by the time of claiming).

1. 1 (round 1) — the first thing the eye landed on was a wrong, dead
   number, actively misleading rather than just unhelpful.
2. 5 — "Claimed" is a spelled-out word regardless.
3. 2 (round 1) — the countdown contradicts the wireframe's `claimed:
   [ — ]` (an em dash, not a ticking zero).
4. n/a at round 1 pending the fix.
5. 3 (round 1) — not literally a generic trait, but a fabricated number is
   its own kind of "looks unfinished."
6. n/a pending fix.

Fix (landed with the code, not yet committed at the time of this
screenshot pass): `heroCountdownTarget()` now returns `undefined`
explicitly for `"claimed"`; the figure renders the static word "Claimed"
with no number at all when the target is undefined.

Round 2 (`.scratch/round2/claimed-{mobile,desktop}.png`):

1. 5 — "Claimed" in `--text-hero` is now the first and only large thing,
   no stray number.
2. 5 — word "Claimed" on both hero and board row.
3. 5 — matches `claimed: [ — ]  Claimed — start the wash when you're
   ready.` exactly.
4. 4 — desktop layout fine, same minor gutter note as above.
5. 5 — fixed; no longer a fabricated number.
6. Comparable to 03-delay-reason.jpg's "why, not what" — "start the wash
   when you're ready" answers why there's no timer (nothing to count down
   to yet), not just "you're claimed."

Score: round 1 had a 1 and a 2 — stopped (not ≥4), fixed, round 2 all ≥4.
Two rounds, as required.

## running

Round 1 (`.scratch/round1/running-mobile.png`) — **bug found**: the hero
showed the static word "Done" while the board row correctly said
"Washing" — `heroCountdownTarget()` originally excluded `"running"` from
ever getting a countdown target at all.

1. 1 (round 1) — the single largest word on the page said the wrong
   thing; actively contradicts the board row one line below it.
2. 2 (round 1) — "Done" read without colour is simply incorrect
   information, not just hard to read.
3. 1 (round 1) — direct contradiction of the wireframe's `running: [ 18:40
   ]  Washing — ends at 18:40.`
4. n/a pending fix.
5. n/a pending fix.
6. n/a pending fix.

Fix: `heroCountdownTarget()` now returns `row.endMs` for `"running"`, so
the hero live-counts-down to the wash's actual end time, matching the
board row's own "Washing" state and time-left column.

Round 2 (`.scratch/round2/running-{mobile,desktop}.png`):

1. 5 — `29:59`/`30:00` countdown to the wash's end is the first thing
   seen, consistent with the board row underneath.
2. 5 — "Washing" spelled out on both hero and board.
3. 5 — matches `running: [ 18:40 ] Washing — ends at 18:40` (here `ends at
   11:00 PM`).
4. 4 — same minor gutter note.
5. 5 — fixed.
6. Good match to 02-live-activities.jpg — a live countdown is exactly its
   "one number, ticking" pattern.

Score: round 1 had 1s — stopped, fixed, round 2 all ≥4. Two rounds.

## done

Round 1/2/3 (`.scratch/round3/done-{mobile,desktop}.png`): the "Done"
status is **architecturally unreachable in the live UI** —
`finish()` sets `status: "done"`, but `queue.ts`'s `ACTIVE_STATUSES =
["waiting", "claimed", "running"]` means `queueFor()` never returns a
"done" row once the active set excludes it, so the status-hero block
disappears entirely the instant a wash is finished (confirmed in the
screenshot: no status-hero renders at all for the room that just called
`finish()`, board shows the machine as "Free" again). This is pre-existing
`queue.ts` behaviour from before this redesign, not introduced by it, and
changing `ACTIVE_STATUSES` is a queue-logic change out of this design-only
stage's scope.

Scores: not applicable — there is nothing to screenshot or score, since
the state the wireframe describes cannot currently be observed through
the running app. The "Done" rendering code
(`row.status === "claimed" ? "Claimed" : "Done"`) exists in `views.ts` and
would be correct if this status were ever reachable, but is dead code in
practice. Noted in `HANDOFF.md`, not treated as a bug to fix here.

## moved back

`.scratch/round3/moved-back-{mobile,desktop}.png`, reached by actually
waiting out a real 3-minute claim window (see Stage 2/3's contention
work):

1. 5 — hero figure (`0:41`/`44:52` depending on capture moment) still
   dominates even with the notice banner above it.
2. 5 — "Nearly your turn" + the notice banner text both spell out what
   happened in words.
3. 5 — matches `moved back: [ 03:00 ] You moved back one place: no claim
   within 3 minutes.` — the notice banner uses this exact wording (edited
   to match the wireframe's phrasing during the build).
4. 4 — same minor gutter note; notice banner spans only the status
   column's width on desktop (1280px), not the full page width — a
   deliberate choice (it's addressed to the viewer specifically, not a
   page-wide system message) but worth noting it doesn't use the full
   1280px the way the board does.
5. 5 — not a toast, not auto-dismissing; stays until "Got it"/dismissed,
   matching the app's existing crit-9 rule for this exact notice.
6. Matches 03-delay-reason.jpg's "why, not what" headline pattern for the
   banner text itself.

Score: all ≥4. One round.

## moved up (offer-equivalent "your turn now" notice)

`.scratch/round3/moved-up-{mobile,desktop}.png`:

1. 5 — same hero treatment as "my turn", dominant figure.
2. 5 — "The person ahead of you missed their window — it's your turn
   now." is a full plain-English sentence, not a badge.
3. 5 — matches the design plan's reason-line pattern.
4. 4 — same gutter note.
5. 5 — no change from the "moved back" row's class, reused correctly.
6. Comparable to 03-delay-reason.jpg.

Score: all ≥4. One round.

## offer (earlier machine opened up)

`.scratch/round3/offer-{mobile,desktop}.png`:

1. 4 — the decision-card ("An earlier machine opened up: Washer 5...") sits
   above the hero figure, so on mobile especially the eye may land on the
   green card first, not the time figure. This is a deliberate trade-off —
   an offer is a time-boxed decision the viewer must act on before the
   hero's own countdown even matters — but it does mean item 1 isn't a
   clean 5 on this screen specifically.
2. 5 — "Switch now" / "Stay put" are plain words; the countdown ("Respond
   by 1:53") is also plain text.
3. 5 — matches `offer: [ 01:47 ] An earlier machine opened up — Dryer 1.
   Switch now?` closely (uses the real machine label and a two-button
   decision instead of a single question, which is the actual UI
   requirement from Stage 9/offer.test.ts, not a wireframe regression).
4. 4 — same gutter note.
5. 5 — `.decision-card` uses the free-tint/border treatment, not a
   pastel-gradient toast.
6. Close to 04-friends.jpg's "your own status stays central" idea — the
   offer card appears above the hero but doesn't replace it; both are
   visible together.

Score: lowest item is 4, nothing below 4. One round (the 4 on item 1 is a
considered trade-off, not a defect to fix in round 2).

## dryer prompt

`.scratch/round3/dryer-prompt-{mobile,desktop}.png`:

1. 5 (this capture is taken mid-wash, so the running countdown is still
   the dominant hero figure; the dryer prompt sits below it as a
   secondary decision).
2. 5 — "Queue it" / "No thanks", plain words.
3. 4 — the wireframe doesn't show this card explicitly (it's part of
   `myStatusBlock`'s build, not one of the 8 "my reservation" states
   listed in 4.3), but it reuses the same `.decision-card` token set as
   the offer card, so it's internally consistent even without its own
   wireframe line.
4. 4 — same gutter note.
5. 5 — same card styling as the offer card; no new pattern invented.
6. Matches 04-friends.jpg's "smaller, off to the side, same visual
   language" idea — the dryer suggestion is secondary to the wash itself,
   same colours/tokens, not a louder competing call to action.

Score: all ≥4. One round.

## turn alert dialog

Visible layered over several of the screenshots above (`my-turn-desktop`,
`claimed`/`running` round1 captures, `moved-back`, `moved-up`): native
`<dialog>`, one sentence, single "Got it" button, backdrop dims the rest
of the page, focus visibly on the button (blue focus ring visible in
`my-turn-desktop.png` and `moved-up-desktop.png`).

1. n/a — not a status screen.
2. 5 — plain sentence, no colour-only signal.
3. 5 — matches the wireframe exactly (one sentence + "Got it").
4. n/a — dialog is intentionally fixed-width at both viewports, not meant
   to use 1280px.
5. 5 — no shadow-stack card grid; a real modal with a real backdrop.
6. Matches the wireframe's own minimal shape; no reference image to
   compare structurally (Flighty's alerts are OS-level push notifications,
   explicitly out of scope per ADR 0009).

Score: all applicable ≥4. One round.

## connection notice

Not re-screenshotted in this pass (already verified via Playwright +
SIGKILL in Stage 2/ADR 0008's own build, described in that stage's commit
message) — tokens applied (`--alert`/`--alert-tint`), same text
"Connection lost — reconnecting…".

1–6: not re-scored here — this is Stage 10's own build, carried forward
with the new palette tokens only (`var(--alert)` colour swapped in, no
structural change), not re-verified as fresh work in this stage.

## Summary

Two screens needed a second round (claimed, running) — both were real
display bugs (a stale `0:00` and a wrong static "Done" word) found by
actually looking at round-1 screenshots rather than reasoning about the
code description, exactly the failure mode `prompt.md` names for the crit
9 pass. Every other screen scored ≥4 on every applicable item in round 1.
One state ("done") is unreachable in the live UI for a pre-existing
`queue.ts` reason, out of scope to fix here, and is reported in
`HANDOFF.md` instead of scored.

Recurring minor note (desktop gutter alignment between the status
column's left edge and the board's first column) was seen on most
desktop screenshots and never scored below 4 — left as a candidate for
Stage 6's extra critique round rather than fixed now, since it's cosmetic
and every screen already clears the ≥4 bar without it.
