# 0005: Fairness escalation — move back one place, plus cross-machine offers

## Status

Accepted. This is crit 9's one required decision about how the app
behaves when several people use it at once (the final-project brief's
"several people at once" requirement).

## Context

Crit 8 shipped the blunt version of the fairness rule: miss your 3-minute
claim window (or the 5-minute window after claiming, before starting),
and your reservation is ejected outright — `missed`, gone, back of the
line if you want to try again.

`README.md`'s whole argument is that the point of this app is removing
the cost of being physically present to hold a place. It cites [David
Maister's waiting-psychology
research](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf)
(unoccupied, uncertain waiting is the worst kind) and [Disney's original
FastPass](https://en.wikipedia.org/wiki/Virtual_queue_systems_at_Disney_Parks)
(a scheduled window you can walk away from, come back to) as the
precedent for the claim window itself. Crit 8's own rule contradicts that
argument: it punishes exactly the behavior — stepping away — the app
exists to permit. A resident who steps out, gets held up, and misses
their window by a minute loses their place entirely, the same as someone
who never came back at all. That's not "the queue decides fairly"; it's
"the queue is unforgiving in exactly the way the README argues against."

Separately, `plan.md`'s User story describes a second multi-user
situation crit 8 never had to handle: sometimes a chance comes up earlier
than expected, either because the person ahead of you missed their turn,
or because a different machine of your type frees up with nobody queued
for it. The brief's options for this crit include "what happens when two
people change the same thing at once" and "what reaches other people
live" — this is both: a scarce resource opening up, and the question of
who finds out, and how.

## Decision

**Same-queue miss: move back one place, not ejected.** Miss your claim or
start window, and you're swapped with whoever's next in that machine's
queue — you keep your reservation, just one position further back. Both
people affected are told why, in the one place they already check their
own status (the pinned "your status" block): the person who moved back
gets a neutral, factual line ("Your claim window passed, so you moved
back one place"), not a scolding one; the person who moved up is told why
it happened, not just that it did. Neither notice disappears until
dismissed — a silent swap would be worse than crit 8's blunt rule, since
at least "ejected" was visible.

**Cross-machine: an "earlier machine" offer, not automatic.** When a
machine of one type goes fully idle with nobody queued for it, the
longest-waiting eligible person on a different machine of the same type —
skipping anyone already about to start on their own machine, since
switching would gain them nothing — gets offered it: accept within 2
minutes and 10 minutes to go claim it, or decline (or don't respond) and
it passes to the next eligible person while the original holder keeps
their place. Nobody is moved automatically; the choice to switch machines
is always the resident's, since only they know whether walking to a
different machine right now is actually worth it to them.

**Rejected alternative: crit 8's rule, kept as-is.** Ejecting outright on
a miss was considered and kept for all of crit 8 — it's simple, and it
does enforce *some* fairness (nobody can hold a machine hostage
indefinitely). It was rejected for crit 9 because it fails the app's own
stated argument: a rule that punishes stepping away contradicts a README
that exists to argue stepping away should be safe. The gentler rule costs
one place, not the whole queue, which still enforces a real cost for
missing a window (so claiming promptly still matters) without treating a
short delay the same as abandoning the queue entirely.

## Consequences

- The fairness rule is no longer a single cliff edge — missing a window
  now has a proportionate cost (one place) rather than a total one
  (ejection). This is `README.md`'s own argument actually enforced in the
  mechanism, not just stated in prose.
- Two new pieces of state exist that didn't before: a `notice` column
  (one outstanding notice per reservation, not a log) and an `offers`
  table. Both are read by the realtime tick (plans/crit-9.md Stage 1), so
  a move-back-one swap or a new offer reaches every open page within
  about a second, same as any other state change.
- A documented simplification: a declined or expired offer for a
  still-continuously-idle machine isn't re-offered to the same person,
  even if their own circumstances change while that machine stays idle.
  Tracking which "idle spell" an offer belongs to would fix this, but
  wasn't judged worth the added complexity — the cost is a person not
  being re-asked about an opening they already said no to, not a fairness
  problem.
- Worth revisiting if a future crit adds a second machine type (dryers):
  the eligibility algorithm already scopes by machine type, so this
  should need no change, but it hasn't been exercised against a real
  second type yet.
