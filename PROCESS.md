# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from.
Crit 8 shipped a working, persistent app with one machine type; crit 9
added real-time sync; crit 10 added logging, then an extension making
the fairness rules checkable at real scale with seeded scenarios, not
just argued in words. A later addition, prompted by course feedback,
added a first-person 3D walkthrough with real, scannable per-machine QR
codes.

# Process overview

**What the agent is for, what I'm for.** Asked what to build, the agent
first suggested three generic ideas and a co-op-game direction, all
rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab))
for not coming from a real problem. The laundry queue came from my own
dorm's actual weekend wait; the agent's plans only matched what I meant
once I worked the situation out myself and gave it back step by step
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`docs/adr/0001-app-concept.md`). The same crit settled how the project
would be planned: `plan.md` holds the whole-project vision, grown but
never rewritten, each crit's scope in its own `plans/crit-N.md` — a
split that let crit 10's much larger plan grow past 500 lines without
swallowing the vision. This set the pattern throughout: the agent builds
and defends a decision once made, but what to build, and whether an
explanation holds up, stayed mine to decide.

**One unattended run, learned from the course's own riff.** A tutorial
riff session had every student try running an agent unattended, with a
prompt template to start from. For crit 10's extension I tried it
myself: wrote every decision down first — identity, the harness,
in-page alerts, no separate board — into ADRs and an "Unattended runs"
section in `CLAUDE.md`, then let the agent run one `prompt.md`
unsupervised for about two hours, verifying its own work with specs and
screenshots instead of asking me
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
It produced a home page that actually looked considered
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)),
cheaper than my usual back-and-forth.

**Why the simulation exists, and a first lesson in not trusting an
explanation.** Crit 9's "move back one place" rule only had a
words-only argument. To see it at real scale, I had the agent simulate
a full day for a hundred residents under each of three rules, recording
the numbers and a replay on `/simulation`. Its first resident model
gave each person one fixed lateness value, so anyone who missed a
window once would miss every future one identically — why `CLAUDE.md`
now requires a timing design's failure mode written down before any
code
([`c2abbcd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/c2abbcd)).
The full batch later hung my machine, twice. The agent blamed its own
background-task handling; I reran it in a second terminal, no agent
involved — same crash, ruling that out: the script never yielded
control between its 150 seeds
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).

**Turning a tutor's suggestion into a feature I'd already wanted.** I'd
always felt the project never connected to a real use case, but hadn't
thought of 3D as the fix. A tutor reviewing the deployed app said the
simulated numbers didn't convince him a hall manager would adopt this —
his suggestion was a 3D room where scanning a machine's real code takes
you somewhere that already knows you. A real inspiration; I started on
it right away. His literal phrasing ("a log-in page") would have meant
a second identity system, reopening ADR 0004's settled room-number-only
decision — I built the effect he meant, reusing the existing cookie
([`docs/adr/0012-3d-walkthrough.md`](docs/adr/0012-3d-walkthrough.md)).
The room later gained a way to see other residents' characters walking
around it — a small multiplayer-style addition answering the project's
multi-user and real-time requirements a second way
([`docs/adr/0014-laundry-presence.md`](docs/adr/0014-laundry-presence.md)).

**Not accepting the agent's first explanation, twice more.** Building
the 3D room, I found the character standing still, but the agent's
checks kept saying its position updated correctly and called it working
as intended. I didn't believe that, so I had it swap in a simpler,
bone-free placeholder: if that moved and the real one didn't, the bug
was specific to the rigged model. It moved — narrowing it to the real
cause: the model-copying code shared one skeleton across every copy, so
the bones never tracked a position variable that had been correct all
along
([`8e33e09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8e33e09)).
A later camera bug followed the same shape — a "fix" whose symptom
proved unchanged, resolved only once I insisted on a full re-check, not
another tuning pass
([`935bad5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/935bad5)).
A clean-looking check isn't proof; three times now, only re-testing the
symptom itself caught an incomplete fix.

**An old idea, delayed, and what building it took.** Letting the next
person move a previous resident's uncollected laundry to a numbered
shelf came from a real annoyance of my own — but it only got built
after crit 10, and I'd imagined it as simple. Building it surfaced real
detail: the "carry it, then place it" motion in the 3D room had no
matching two-step state on the server —
the database recorded the handoff as finished the instant it was picked
up, so the server kept overwriting whatever the scene still showed
mid-carry. Fixing it meant a real in-transit state in between, plus
deciding how the basket/shelf work and when the owner is notified
([`docs/adr/0013-laundry-handoff-authorization.md`](docs/adr/0013-laundry-handoff-authorization.md)).
A good idea on paper still needed building to find what it missed.

**Overruling a well-argued rejection, once the code didn't hold up.**
The home page's "Claim" button claimed a machine with no scan involved
— a leftover from before any real QR code existed. A separate pass at
"should claiming require a scan" concluded no: it would narrow the
project's "a phone alone is enough" claim, a QR code proves no real
presence, and tests would behave differently from production. I pushed
back: claiming was always meant as "I've arrived," not an unchecked
click; not checking presence is itself the unfair part, since someone
could claim from bed without coming down; and this isn't a change to
the fairness rule, just a new precondition on one action. All three
held up against the actual code: `claim()` never verified arrival; an
unverified scan does the same work an unverified room number already
does for identity; and every spec already calls `join()` before
`claim()`, so teaching them to scan first added one precondition
without forking anything.
[`docs/adr/0016`](docs/adr/0016-scan-gated-claim-accepted.md) has the
full argument (and [`0015`](docs/adr/0015-scan-gated-claim.md), the
original rejection, left as written).

Automated checks (`pnpm check`) confirm the app builds and invariants
hold. They can't judge whether a decision honors the project's own
argument, or a rejection's premises are true — that judgment happened
by hand, logged in `process-notes.md`, the most load-bearing moments
promoted here.
