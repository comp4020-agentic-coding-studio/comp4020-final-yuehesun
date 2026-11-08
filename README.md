# Laundry Queue

## What this is

A shared queue for a laundry room's washers and dryers. Student residences often share several washing machines between 100+ people — on weekends there's always a wait. Leave to study or eat, and someone else takes the machine you were counting on.
This app cuts down waiting time and the communicating cost of using a shared facility. The system registers information and coordinates the
queue status of multiple users, resolving conflicts like a user being
late or not collecting their clothes, and helps you find a newly freed machine. All a user needs is a phone to queue, making doing laundry lighter and dorm management easier.

## What good means here

Weiser and Brown's [idea of calm
technology](https://calmtech.com/papers/coming-age-calm-technology) is
the model this app is built on: good technology sits at the edge of
attention and only calls you to the center when something genuinely
needs you. That's the queue's job once you've reserved — watching the
room so you don't have to, and pulling you back in at exactly two
moments (one person ahead of you; your turn), never before.

What makes it safe to act on that silence is knowing your place holds
while you're gone. [David Maister's classic
paper](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf)
found an uncertain wait is worse than a long one with a known end —
standing in a laundry room with nothing to do, not knowing which machine
or when, is close to the worst shape of waiting there is. [Disney's
original
FastPass](https://en.wikipedia.org/wiki/Virtual_queue_systems_at_Disney_Parks)
solved this on a bigger stage: instead of a physical line, a guest got
back a scheduled time window and was free to go ride something else
until it came — the precedent this app's claim window comes from
directly. Miss that window and you move back one place, swapped with
whoever's next, not ejected — the cost of stepping away stays small,
which is what actually makes stepping away safe.

This app's design assumes a real signal from a real machine. Without
real washing machines to connect, that part is hard to see working. To
show more directly what the system looks like in real use, two kinds of
simulation stand in: seeded, randomized data showing the queue holding
up under heavy, repeated use (`/simulation`), and a 3D room where real
identities move and act in the same shared space at once (`/laundry`).

## What I chose not to build

No accounts, no names, no chat. Calm technology's whole point is letting
the room recede to the edge of your attention; a feature that asks you
to check messages or keep a profile pulls you back to the center for no
reason the laundry itself gives. A room number is the one thing the
queue needs to tell people apart — nothing else is asked for, and
nothing else is kept.

## What's enforced, what's judged

`spec/` checks what's mechanical: a machine never has two active claims
at once; a queue position only moves forward except when someone misses
their claim window, moving back one place instead of losing it; identity
has to be a bare room number, anything else rejected; a room holds at
most two active reservations per machine type. Whether standing in the
room actually feels relieved, and whether the windows are long enough to
be fair without inviting idling, is for whoever uses the room to judge.

## Sources consulted

- David Maister, [The Psychology of Waiting Lines](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf) (1985)
- [Virtual queue systems at Disney Parks](https://en.wikipedia.org/wiki/Virtual_queue_systems_at_Disney_Parks) — FastPass, 1999
- Mark Weiser & John Seely Brown, [The Coming Age of Calm Technology](https://calmtech.com/papers/coming-age-calm-technology) (1996)
