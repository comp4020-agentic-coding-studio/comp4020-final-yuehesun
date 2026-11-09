# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines, built around calm technology: the app watches the queue so you
don't have to, and only calls you back when it matters. See
[`README.md`](README.md) for the "good" argument and
[`plan.md`](plan.md#user-story) for the user story. It also has a 3D
walkthrough of the laundry room with real, scannable QR codes.

I kept the stack small to fit one 256MB machine: Hono, SQLite and htmx. A
framework like Next.js would have been heavier and harder to use for
real-time. The cost is a bigger Docker build for the SQLite driver
([`ff403af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/ff403af),
[`docs/adr/0003`](docs/adr/0003-tech-stack.md)).

# Process overview

The first step was settling on a topic and a design plan. The agent first
suggested three generic ideas, all rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab)).
I decided to start from a pain point in my own life, the time wasted
queueing for the laundry room dorm. I worked out the real scenario myself and explained
it step by step, and the plan start to match what I expected
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`docs/adr/0001-app-concept.md`). As the work went on, the division between human and agent became clear: agent can implement and argue for existing decisions, but what problem to solve, and
what the app should finally become, stay mine to decide.

During the build I tried several ways of managing the agent. One is the
workflow in `CLAUDE.md`: the overall plan is split into small stages, and
each stage starts with planning and can only end after I've tested it by
hand. That testing once kept showing me old text after the agent's fixes,
because one of its test servers was still on my dev port serving old code. Therefore I made that a rule in `CLAUDE.md` ([`71f3426`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/71f3426)).

Another way of managing it is unattended runs. After trying one in the tutorial riff, I tried writing a `prompt.md` for crit 10's extension that could keep the agent
working for two hours. I wrote every decision down first — identity, the
harness, in-page alerts, no separate board — into ADRs, and used an
"Unattended runs" section in `CLAUDE.md` to start the run, with Claude
verifying its own work with specs and screenshots
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
It produced a home page that actually looked considered
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)),
cheaper than my usual back-and-forth.

After this experience, I used the unattended approach again to build the simulation page, an important early attempt at
simulating real use. Crit 9 replaced "miss your window, get ejected" with
"move back one place." The reasoning is recorded in `docs/adr/0005`, but
that was only a theoretical argument. I wanted to test how it would work in
actual use, but I couldn't connect the system to real washing machines, so
I came up with using seeded data to simulate real usage at scale: 100
residents over a whole day. That's what `/simulation` is — an animation
for watching the results of three different queueing policies at real scale
([`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
Running the full batch hung my machine twice. The agent blamed its own
background tasks. I didn't take its word for it: I ran the script in another
terminal with no agent involved, and it crashed the same way. This ruled out
the agent's background process and turned my attention to the script itself.
The real cause was the script never
yielding control across its 150 seeds, so it kept hogging the machine's resources. Once that was fixed, the simulation
worked
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).
Its first resident model was also wrong: each resident's lateness was fixed
once, so a slow resident missed every chance forever. That only showed up once
it ran, so I added a rule to write this kind of design down before coding
([`c2abbcd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/c2abbcd)).
But at this stage the simulation still stayed at the level of data, and I'd
always felt the project never connected to a real use case.

Not long after, a tutor reviewing the deployed app raised a question:
showing simulation results alone might not be enough to convince a hall
manager to actually adopt the system. The tutor suggested building a 3D
walkthrough of the laundry room, where a user scans a real QR code on a
virtual washing machine and goes straight to their own home page. I had
never thought of it from that angle. I found it really interesting and
started trying to build it right away. But a cool idea is rarely easy to bring to
life, and problems in the details kept coming up. When building the 3D room,
I found the character standing still while the agent's checks called it
working as intended. I didn't accept the agent's first explanation, and had
it swap in a simpler, bone-free placeholder instead — if that moved and the
real one didn't, the bug was specific to the rigged model. It moved, so the
fault was in the code that copied the model, not the position logic
([`8e33e09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8e33e09)).
A clean-looking check was never proof; re-testing the symptom caught an
incomplete fix each time. Also during this work, `pnpm check` twice wrote fake
reservations into my real dev database, so the specs now refuse to run against
it
([`8d05e54`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8d05e54)).

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
break the original design. The code showed that `claim()` never verified
arrival, and tests only needed one more precondition
([`docs/adr/0016`](docs/adr/0016-scan-gated-claim-accepted.md)). The feature
was finally built.
