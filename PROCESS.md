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

Asked what to build, the agent first suggested three generic ideas and
a co-op-game direction, all rejected
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
and defends a decision once made, but what to build stayed mine to
decide.

A tutorial riff session had every student try running an agent
unattended, with a prompt template to start from. For crit 10's
extension I tried it myself: wrote every decision down first —
identity, the harness, in-page alerts, no separate board — into ADRs
and an "Unattended runs" section in `CLAUDE.md`, then let the agent run
one `prompt.md` unsupervised for two hours, verifying its own work with
specs and screenshots instead of asking me
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
It produced a home page that actually looked considered
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)),
cheaper than my usual back-and-forth.

That extension is where the fairness rule stopped being a words-only
argument. Crit 9 replaced "miss your window, get ejected" with "move
back one place," but the only case for it was prose in
`docs/adr/0005`. I wanted to see the rule at the scale it's meant for:
a hundred residents, a full day, under each of three competing rules,
driven by the real queue code. That's what `/simulation` is — not a
separate feature, a way to watch the same
decision at real scale. It's also what made the next step obvious: once
the rule was numbers and a replay instead of only an argument, the
natural question was whether a resident could be shown the *room* that
number represents, not just a chart — the thread that leads straight
into the 3D walkthrough below.

A tutor reviewing the deployed app said the simulated numbers didn't
convince him a hall manager would adopt this — his suggestion was a 3D
room where scanning a machine's real code takes you somewhere that
already knows you. I'd always felt the project never connected to a
real use case, but hadn't thought of 3D as the fix myself; his note was
a real inspiration, and I started right away. His literal phrasing ("a
log-in page") would have meant a second identity system, reopening ADR
0004's settled room-number-only decision — I built the effect he meant,
reusing the existing cookie
([`docs/adr/0012-3d-walkthrough.md`](docs/adr/0012-3d-walkthrough.md)).
The room later gained a way to see other residents' characters walking
around it too — a small multiplayer-style addition answering the
project's multi-user and real-time requirements a second way
([`docs/adr/0014-laundry-presence.md`](docs/adr/0014-laundry-presence.md)).

Three separate times, I didn't accept the agent's first explanation,
and each time that refusal found the real cause. Running the
simulation's full batch hung my machine, twice; the agent blamed its
own background-task handling, so I reran the script in a second
terminal with no agent involved — same crash, ruling that out: the
script never yielded control back between its 150 seeds
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).
Building the 3D room, I found the character standing still while the
agent's checks called it working as intended; I had it swap in a
simpler, bone-free placeholder instead — if that moved and the real
one didn't, the bug was specific to the rigged model. It moved,
narrowing the cause to the model-copying code sharing one skeleton
across every clone, so the bones never tracked a position variable
that had been correct all along
([`8e33e09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8e33e09)).
A later camera bug followed the same shape — a "fix" whose symptom
proved unchanged the moment I tried it, resolved only once I insisted
on a full re-check, not another tuning pass
([`935bad5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/935bad5)).
A clean-looking check was never proof; re-testing the symptom caught
an incomplete fix each time.

Letting the next person move a previous resident's uncollected laundry
to a numbered shelf came from a real annoyance of my own — but it only
got built after crit 10, and I'd imagined it as simple. The "carry it,
then place it" motion in the 3D room had no matching two-step state on
the server: the database recorded the handoff as finished the instant
it was picked up, so the server kept overwriting whatever the scene
still showed mid-carry. Fixing it meant an in-transit state in between,
plus deciding how the basket/shelf work and when the owner is notified
([`docs/adr/0013-laundry-handoff-authorization.md`](docs/adr/0013-laundry-handoff-authorization.md)).
A good idea on paper still needed building to find what it missed.

The last real fork overruled a rejection that read as well-argued. The
home page's "Claim" button let anyone claim with no scan involved — a
leftover from before any real QR code existed. A separate pass at
"should claiming require a scan" concluded no: it would narrow "a phone
alone is enough," a QR code proves no real presence, and tests would
behave differently from production. I pushed back: claiming was always
meant as "I've arrived," not an unchecked click; not checking presence
is itself the unfair part, since someone could claim from bed without
coming down; and this isn't a change to the fairness rule, just a new
precondition on one action. All three held up against the actual
code — `claim()` never verified arrival, an
unverified scan does the same work an unverified room number does for
identity, and every spec already calls `join()` before `claim()`, so
teaching them to scan first added one precondition without forking
anything. Full argument in
[`docs/adr/0016`](docs/adr/0016-scan-gated-claim-accepted.md) (and
[`0015`](docs/adr/0015-scan-gated-claim.md), the original rejection,
left exactly as written).

Automated checks (`pnpm check`) confirm the app builds and invariants
hold. They can't judge whether a decision honors the project's own
argument, or a rejection's premises are true — that judgment happened
by hand, logged in `process-notes.md`, the most load-bearing moments
promoted here.
