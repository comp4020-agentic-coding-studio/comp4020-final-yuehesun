# Laundry Queue

<!-- DRAFT — crit 8, first pass. -->

## What this is

A shared queue for a laundry room's washers and dryers. My dorm has about 10
machines for 100+ people — on weekends there's always a wait. This app lets
you see the line, hold your place, and know when it's your turn, without
having to sit in the laundry room or message anyone.

## What "good" means for this app

This app is good if it does one thing: it lets people who don't know each
other share a scarce resource fairly, without needing to talk.

- **Fair, and seen to be fair.** Everyone looking at the queue sees the same
  line, in the same order. No one's turn depends on who they know or who
  shouts loudest — the queue decides, not the people in it.
- **Talking is optional, not required.** You shouldn't need to message
  anyone, ask around, or make an account just to find out when it's your
  turn. The queue carries the coordination that used to take a conversation.
- **Honest about real-time limits.** "Your turn" only matters if you find out
  in time to act on it. If a notification can't reach someone fast enough,
  that's a real limit worth admitting here, not hiding.
- **Keeps only what the queue needs.** It remembers your place in line and
  whether a machine is free — not who you are, what you wash, or how often
  you do laundry. No profile, no history beyond the current line.
- **Stays one laundry room's app.** It's built for this room and its
  machines, not a general booking tool for any shared resource. Growing into
  that would be a different app with a different idea of "good."

This isn't a new idea — it's close to [situated software](http://shirky.com/essays/situated-software/),
software built for one group's real situation instead of generic scale, and
to [small, single-tenant software](https://benhoyt.com/writings/the-small-web-is-beautiful/)
being easier to get right than something built to grow. But the standard
above comes from the laundry room itself, not from the reading.

## What's enforced vs. judged

- **Enforced** (see `spec/`): one person holds a machine at a time; the queue
  only moves forward; no accounts, profiles, or messages exist anywhere in
  the app.
- **Judged**: whether the fairness rule actually feels fair to residents, and
  whether the "your turn" notification arrives soon enough to be useful.

## Sources consulted

- Clay Shirky, [Situated Software](http://shirky.com/essays/situated-software/) (2004)
- Ben Hoyt, [The small web is beautiful](https://benhoyt.com/writings/the-small-web-is-beautiful/)
