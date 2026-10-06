# 0002: Identity — self-declared name or room number

## Status

Accepted

## Context

The app needs to tell people apart ("multi-user") with no accounts, login,
or chat — identity should be just enough for the queue to work, nothing
more (see `README.md`, ADR 0001).

Two options were considered: a fully anonymous id tied to the browser,
reset if cookies are cleared or the device changes; or a self-declared name
or room number, typed once and remembered per browser, with nothing
verifying it's real.

Fully anonymous identity has a real cost here: the fairness rule relies on
a person's queue position persisting even when it's inconvenient for them
(miss your window, lose your spot) — a fully anonymous id can be thrown
away and recreated for free, which would let someone dodge a forfeited
spot just by clearing cookies. It would also make the "finished but not
collected" nudge (telling the owner their clothes are still in the
machine) meaningless, since there'd be no one to tell.

## Decision

Identity is a self-declared name or room number, typed once and remembered
per browser. No account, no password, and nothing checks it's true.

## Consequences

- The fairness rule can't be trivially evaded by clearing cookies and
  rejoining as a "new" person — there's a cost (typing it in again) even
  if not a hard guarantee.
- The uncollected-clothes nudge has someone to actually notify.
- This is trivially spoofable — anyone can type any name or room number.
  The app relies on the same thing a real dorm does: people mostly don't
  bother lying to their own neighbours. That reliance is a **judged**
  claim, not an enforced one (see `README.md`).
- The only "personal" data stored is a self-typed string, tied to a
  browser — no account, no cross-device identity, no verification.
