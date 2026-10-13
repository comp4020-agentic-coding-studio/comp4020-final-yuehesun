# Laundry Queue

<!-- DRAFT — crit 9 pass. -->

## What this is

A shared queue for a laundry room's washers and dryers. Student residences often share several washing machines between 100+ people — on weekends there's always a wait. Leave to study or eat, and someone else takes the machine you were counting on.
This app cuts down waiting time and the communicating cost of using a shared facility. The system registers information and coordinates the
queue status of multiple users, resolving conflicts like a user being
late or not collecting their clothes, and helps you find a newly freed machine. All a user needs is a phone to queue, making doing laundry lighter and dorm management easier.

## What good means here

The real cost is that leaving costs you your
turn, so you don't leave. [David Maister's classic paper on
waiting](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf)
opens with the finding behind this: occupied time feels shorter than
unoccupied time, and an uncertain wait is worse than a long one with a
known end. Standing in a laundry room with nothing to do, not knowing
which machine or when, is close to the worst shape of waiting Maister
describes. [Disney's original
FastPass](https://en.wikipedia.org/wiki/Virtual_queue_systems_at_Disney_Parks)
solved exactly this on a bigger stage: instead of a physical line, a
guest got back a scheduled time window and was free to go ride something
else until it came. That's the precedent this app's claim window comes
from directly — reserve, then leave, and come back for a slot, not a
line.

What makes it safe to actually leave is Weiser and Brown's [idea of calm
technology](https://calmtech.com/papers/coming-age-calm-technology): good
technology sits at the edge of attention and only calls you to the
center when something genuinely needs you. That's the queue's job once
you've reserved — watching the room so you don't have to, and pulling
you back in at exactly two moments (one person ahead of you; your turn),
never before.

## What I chose not to build

No accounts, no names, no chat. Calm technology's whole point is letting
the room recede to the edge of your attention; a feature that asks you
to check messages or keep a profile pulls you back to the center for no
reason the laundry itself gives. A room number is the one thing the
queue needs to tell people apart — nothing else is asked for, and
nothing else is kept.

## Several people at once

*(Written once crit 9's real-time sync and fairness escalation are built
and verified — this section will describe exactly what reaches every
open page within a second, what happens when a claim window is missed,
and how an early opening is offered, the way the mechanism actually
behaves, not how it's meant to.)*

## What's enforced, what's judged

`spec/` checks what can be checked mechanically: a machine never has two
active claims at once; a queue position only moves forward except
through the documented miss-your-window rule; identity has to be a bare
room number, anything else rejected; a room holds at most two active
reservations per machine type at a time. Whether standing in the room
with nothing to do is actually the thing residents feel relieved of, and
whether the claim window is long enough to be fair without being long
enough to sit idle, aren't things a test can check — that's for whoever
actually uses the room to judge.

## Sources consulted

- David Maister, [The Psychology of Waiting Lines](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf) (1985)
- [Virtual queue systems at Disney Parks](https://en.wikipedia.org/wiki/Virtual_queue_systems_at_Disney_Parks) — FastPass, 1999
- Mark Weiser & John Seely Brown, [The Coming Age of Calm Technology](https://calmtech.com/papers/coming-age-calm-technology) (1996)
