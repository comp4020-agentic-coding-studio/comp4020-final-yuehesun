# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from.
Crit 8 shipped a working, persistent app with one machine type; crit 9
added real-time sync; crit 10 added logging, then an extension making
the fairness rules checkable at real scale with seeded scenarios, not
just argued in words. A later addition, prompted by course feedback,
added a 3D walkthrough with real, scannable per-machine QR codes.

# Process overview

The first step was settling on a topic and a design plan. The agent first
suggested three generic ideas and a co-op-game direction, all rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab)).
In the end I started from a pain point in my own life, the time wasted
queueing for the laundry room in my residence, and chose the laundry queue
as my topic. At first the agent couldn't write a plan I was happy with
either. Only once I had worked out the real scenario myself and explained
it step by step did the plan start to match what I expected
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`docs/adr/0001-app-concept.md`). As the work went on, the division of labour
between me and the agent became clear: decisions already made can be left
to the agent to implement and argue for, but what problem to solve, and
what the app should finally become, stay mine to decide.

During the build I tried several ways of managing the agent. One is the
workflow in `CLAUDE.md`: the overall plan is split into small stages, and
each stage starts with planning and can only end after I've tested it by
hand. Another is unattended runs. After trying one in the tutorial riff, I
wrote a `prompt.md` for crit 10's extension that could keep the agent
working for two hours. I wrote every decision down first — identity, the
harness, in-page alerts, no separate board — into ADRs, and used an
"Unattended runs" section in `CLAUDE.md` to start the run, with Claude
verifying its own work with specs and screenshots
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
It produced a home page that actually looked considered
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)),
cheaper than my usual back-and-forth.

After that run I built the simulation page, an important early attempt at
simulating real use. Crit 9 replaced "miss your window, get ejected" with
"move back one place." The reasoning is recorded in `docs/adr/0005`, but
that was only a theoretical argument. I wanted to test how it would work in
actual use, but I couldn't connect the system to real washing machines, so
I came up with using seeded data to simulate real usage at scale: 100
residents over a whole day. That's what `/simulation` is — an animation
for watching the results of three different queueing policies at real scale
([`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
Running the simulation's full batch hung my machine, twice. The agent first
blamed its own handling of background tasks. I didn't simply take its word
for it: I opened another terminal and ran the simulation script on its own,
with no agent involved. The same crash happened. That ruled out the agent's
background process and turned my attention to the script itself. The cause
turned out to be that the script, while running 150 seeds, never yielded
control, so it kept hold of the machine's resources. After debugging through
manual testing, I finally got the simulation working
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).
But at this stage the simulation still stayed at the level of data, and I'd
always felt the project never connected to a real use case.

Not long after, a tutor reviewing the deployed app raised a question:
showing simulation results alone might not be enough to convince a hall
manager to actually adopt the system. The tutor suggested building a 3D
walkthrough of the laundry room, where a user scans a real QR code on a
virtual washing machine and goes straight to their own home page. I had
never thought of it from that angle. I found it really interesting and
started building it right away. But a cool idea is rarely easy to bring to
life, and problems in the details kept coming up. When building the 3D room,
I found the character standing still while the agent's checks called it
working as intended. I didn't accept the agent's first explanation, and had
it swap in a simpler, bone-free placeholder instead — if that moved and the
real one didn't, the bug was specific to the rigged model. It moved,
narrowing the cause to the model-copying code sharing one skeleton across
every clone, so the bones never tracked a position variable that had been
correct all along
([`8e33e09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8e33e09)).
A later camera bug was somewhat similar — a "fix" whose symptom proved
unchanged the moment I tried it, resolved only once I insisted on a full
re-check, not another tuning pass
([`935bad5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/935bad5)).
A clean-looking check was never proof; re-testing the symptom caught an
incomplete fix each time.

After several days of attempts, I finally got the 3D walkthrough laundry
room deployed online
([`060c6f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/060c6f7)).
The room later gained a way to see other residents' characters walking
around it too — a small multiplayer-style addition answering the project's
multi-user and real-time requirements a second way
([`docs/adr/0014-laundry-presence.md`](docs/adr/0014-laundry-presence.md)).

Having modelled the laundry room's physical layout also gave another feature
something to build on: letting the next person move a previous resident's
uncollected laundry to a drop-off area. This was another pain point I had
run into myself and wanted to solve, and I'd imagined it as simple. But when
I started building the full "pick up, carry, place" action in the 3D scene,
I found the server had no in-between state to match it. The database
recorded the whole handoff as complete the moment the laundry was picked up,
so while the 3D scene still showed the laundry being carried, the server's
data kept overwriting the scene's state. To make this interaction really
work, an in-transit state had to be added between picking up and placing. I
also had to settle who may carry the laundry, how placing it on the shelf is
completed, and when the original owner is told
([`docs/adr/0013-laundry-handoff-authorization.md`](docs/adr/0013-laundry-handoff-authorization.md)).
A good idea on paper still needed building to find what it missed. There is
still a long way between understanding what users need and actually building
an interaction that works.

Another real fork overruled a rejection that read as well-argued. The home
page's "Claim" button let anyone claim with no scan involved — a shortcut
chosen early on, when there was no real QR code yet. But now that the 3D
laundry room existed, I wanted to reproduce as closely as possible how a
machine is claimed in real life. Yet when I asked the agent to assess
"should claiming require a scan," it concluded no: it would narrow "a phone
alone is enough," and tests would behave differently from production
([`0015`](docs/adr/0015-scan-gated-claim.md)). I pushed back: without
requiring a scan to prove you're there, someone could claim a machine while
lying in their room without ever actually starting a wash, wasting the time
of everyone behind them. That is exactly the unfair behaviour the system was
meant to prevent. I also checked further whether this change would really
break the original design, and the actual code showed that `claim()` never
verified arrival, an unverified scan does the same work an unverified room
number does for identity, and every spec already calls `join()` before
`claim()`, so teaching them to scan first added one precondition without
forking anything
([`docs/adr/0016`](docs/adr/0016-scan-gated-claim-accepted.md)). The feature
was finally built.

The process above shows that automated checks (`pnpm check`) confirm the
app builds and invariants hold. They can't judge
whether a decision honors the project's own argument, or a rejection's
premises are true — that judgment happened by hand, logged in
`process-notes.md`, the most load-bearing moments promoted here.
