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

- **Grounded in what you actually do, not what you say.** Machine status
  comes from scanning it, not from someone remembering to log it — the app
  believes actions, not reports.
- **Fair, and seen to be fair.** Everyone looking at the queue sees the same
  line, in the same order. No one's turn depends on who they know or who
  shouts loudest — the queue decides, not the people in it.
- **Advancing early is offered, never forced.** If an earlier machine opens
  up, you're asked — declining costs you nothing, and you keep your place.
- **Talking is optional, not required.** You shouldn't need to message
  anyone, ask around, or make an account just to find out when it's your
  turn. The queue carries the coordination that used to take a conversation.
- **Honest about real-time limits.** "Your turn" only matters if you find out
  in time to act on it. If a notification can't reach someone fast enough,
  that's a real limit worth admitting here, not hiding.
- **Honest about uncertainty, not just speed.** A time shown before it's
  confirmed is marked as an estimate, not presented as fact, and you're
  told when it changes.
- **Keeps only what the queue needs.** Just enough to tell you apart (the
  room number you type in) and your place in line — not what you wash or
  how often you do laundry. No profile, no history beyond the current line.
- **Stays one laundry room's app.** It's built for this room and its
  machines, not a general booking tool for any shared resource. Growing into
  that would be a different app with a different idea of "good."

This isn't a new idea — it's close to [situated software](http://shirky.com/essays/situated-software/),
software built for one group's real situation instead of generic scale, and
to [small, single-tenant software](https://benhoyt.com/writings/the-small-web-is-beautiful/)
being easier to get right than something built to grow. But the standard
above comes from the laundry room itself, not from the reading.

## What we chose not to build

- **No chat, messages, friending, or comments, anywhere.** The queue is the
  only channel between people. This isn't "not yet" — it's the point.
- **No accounts or login, and no names either.** Identity is your room
  number only, as `roomXXX` (e.g. `room304`) — not a name, since two
  residents could type the same name and the queue depends on telling
  people apart reliably.
- **No generalizing into a booking product for any shared resource.** This
  is one laundry room's app, on purpose.
- Plenty of real features from the fuller design (a second machine type,
  the app picking your machine for you, offers when an earlier machine
  frees up, handling clothes left behind) aren't built yet — those are
  roadmap, not exclusions. The full list is in `plan.md`.

## What's enforced vs. judged

- **Enforced** (see `spec/`): a machine never has two active claims at
  once; a queue position only moves forward, except through the documented
  miss-your-window rule; identity must be a room number in `roomXXX` format
  — anything else is rejected.
- **Judged**: no messaging/chat exists anywhere in the app — checked by
  reading the code against `CLAUDE.md`'s rule, not by an automated test,
  since you can't prove a feature's absence by testing a finite set of
  guessed routes; whether the fairness rule actually feels fair to
  residents; whether the "it's your turn" moment arrives soon enough to be
  useful.

## Sources consulted

- Clay Shirky, [Situated Software](http://shirky.com/essays/situated-software/) (2004)
- Ben Hoyt, [The small web is beautiful](https://benhoyt.com/writings/the-small-web-is-beautiful/)
