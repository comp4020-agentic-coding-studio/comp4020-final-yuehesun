# Process notes

Working log of real forks — points where I didn't take the agent's word, or
made a call it couldn't make for me. `PROCESS.md` picks the most important
one(s) of these to write up properly before shipping.

## Identity: room number only, not a name

**What happened:** Stage 1 shipped with identity as a self-declared name or
room number (ADR 0002), picked earlier in the crit. After seeing it
running, I realised a name isn't unique — two residents could type the
same one, and claim/start/cancel ownership plus the fairness rule's
position-tracking both depend on identity actually telling people apart.

**The obvious alternative:** leave it as-is (name or room number, agent's
and my own earlier call) and treat name collisions as an edge case to
maybe handle later.

**What we did instead:** identity is now a room number only, in the format
`roomXXX`. Names are rejected outright.

**Why it helped:** this isn't a hypothetical — a name collision would let
two different people share one queue position, or let one accidentally act
on another's reservation, which breaks the fairness argument the whole app
is built on. A room number is unique per resident where a name isn't.

**Backed by:**
- ADR 0002 superseded by ADR 0004 (`docs/adr/0004-identity-format.md`)
- `CLAUDE.md`'s identity rule updated
- `spec/identity-format.test.ts` enforces the format; `POST /identity`
  actually validates it in code (not just documented)
- Commits (this repo:
  `comp4020-agentic-coding-studio/comp4020-final-yuehesun`, not yet pushed):
  [`277c163`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/277c163) (ADR),
  [`996b3a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/996b3a4) (CLAUDE.md),
  [`948cc4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/948cc4a) (README),
  [`4456a3a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4456a3a) (app code),
  [`849202c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/849202c) (spec)

## Messaging: optional, not banned

**What happened:** I'd written README's "what we chose not to build" as
"No chat, messages... This isn't 'not yet' — it's the point," and
CLAUDE.md's rule as an outright ban. After the site was live, I was told
that overstated the actual position: the goal was always that talking is
*optional* — the queue should be enough on its own — not that messaging is
forbidden from ever existing.

**The obvious alternative:** leave it, since nothing about the app's
current behaviour was technically wrong — no messaging is built either
way.

**What we did instead:** reworded README (moved it into the roadmap
bullet, not the exclusions list; fixed the matching judged claim) and
CLAUDE.md's rule (no feature may *require* a person-to-person channel,
rather than no such feature may exist) to say what was actually meant.

**Why it helped:** the three-part harness is supposed to agree with the
author's real argument, not just with itself — a rule the agent invented
and then enforced against its own invention isn't the same as the
student's own position being enforced.

**Backed by:**
- [`21b90b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/21b90b3) (README)
- [`b81fa8b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b81fa8b) (CLAUDE.md)

## Agent's own verification servers clobbering my dev server

**What happened:** I kept running `pnpm dev` myself to check the agent's
UI wording fixes, and kept seeing the old text no matter how hard I
refreshed — then `pnpm dev` itself failed outright with "address already
in use." Turned out the agent had been starting its own throwaway servers
on the same port 8080 my dev server uses, to curl-test its changes
without bothering me for a browser check each time. One of those leftover
servers didn't actually die when the agent thought it had killed it, kept
squatting on the port, and kept serving the app from before its latest
code change — so what I was looking at wasn't stale browser cache or a
mistake on my end, it was a different, older process answering the same
port.

**The obvious alternative:** let the agent just "be more careful" next
time and move on — it already found and explained the exact mechanism
once asked.

**What I decided instead:** a mistake the agent has already repeated more
than once in one session isn't fixed by it trying harder next time —
"try harder" doesn't survive a `/clear`. I told it to put a real rule in
`CLAUDE.md`: never touch port 8080 for its own verification, and actually
check the port is free after cleanup instead of trusting a `kill`
command's exit code.

**Why it helped:** a rule the agent has to re-derive from scratch every
session is worth less than one written into the harness once — this is
exactly the kind of recurring failure `CLAUDE.md` is supposed to catch,
not a one-off I should have to keep catching by hand.

**Backed by:**
- `CLAUDE.md`'s Workflow section (pending: not yet committed — lands with
  this crit's next commit)

## Dropping the reservation detail page

**What happened:** crit 8's plan called for a separate reservation detail
page (`GET /reservations/:id`) on purpose. But actually using
the app in crit 9, I found it was a pointless extra click: the home page
already showed the claim/start/cancel buttons for my reservation, so
"Manage your reservation →" just led to a second page with the same
buttons on it.

**The obvious alternative:** leave it as crit 8 built it — nothing about
the page was broken.

**What I decided instead:** cut the page. The buttons already on the home
page are the only way to use them now.

**Why it helped:** `README.md` argues the queue should stay out of your
way and only interrupt you when it actually needs to — a button already
on the page you land on shouldn't need a second page just to press it.
Cutting it also broke something: the "Reserve" button's redirect pointed
at that page, so removing it caused a real 404 the first time I clicked
Reserve for real. Fixed by keeping the route but pointing it at the home
page instead of deleting it outright.

**The real lesson:** this page looked fine on paper in crit 8's plan.
Only using the actual app surfaced that it was dead weight — and only
clicking the actual button surfaced the 404 the removal caused. Planning
ahead of time catches design mistakes; it doesn't catch everything. Some
things only show up once a working version exists to click on.

**Backed by:**
- [`4cae99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4cae99e) (page removed, "end the wash" added)
- [`b04d236`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b04d236) (the redirect bug the removal caused, fixed)
- `plans/crit-9.md`'s Stage 1.5

## Identity stays unverified, even though the logs can't tell two people with one room number apart

**What happened:** reviewing the app against crit 10's brief, I was told
the identity model has a hole the crit is built to expose: anyone can type
another resident's room number, act as them, and the logs show both people
as the same room. The suggested fix was binding a room number to the first
browser that claims it, with a short pairing code for a second device.

**The obvious alternative:** add the binding — it closes the hole and
makes the logs unambiguous.

**What I decided instead:** keep the room number as a plain, unverified
identifier, as ADR 0002/0004 already say. Crit 10 asks that what each
person may change is checked on the server and the decision is written
down with why; the server already checks ownership by room number, and
the trade-off is already written down.

**Why:** binding would make every two-browser test, including the crit's
own, slower to set up, for a threat that barely exists in one building
where residents know each other. The cost of the hole is real but small;
the cost of the fix lands on every single use.

**Backed by:** ADR 0002/0004 (unchanged); `plans/crit-10.md` Extension,
decision 1 (pending: plan commit).

## One harness instead of two features

**What happened:** I was offered two separate ideas for making the queue's
rules checkable: property-based tests that run thousands of random action
sequences against the rules, and a fairness simulator that compares crit
8's rule, crit 9's rule and plain first-come-first-served over a simulated
Saturday.

**The obvious alternative:** build them as two features — a test suite
and a separate simulator.

**What I decided instead:** they need the same thing underneath — the
real queue code, a clock the test controls, and generated situations — so
they are one harness used twice: the tests check the rules never break,
the simulation compares rules.

**Why:** two pieces of machinery would mean two places that could drift
from the real queue code, and twice the build cost. One harness also
means the numbers on `/simulation` come from exactly the code the tests
check.

**Backed by:** `docs/adr/0007-verification-harness.md`;
`CLAUDE.md` test harness rules (pending: Stage 9).

## The home page is the board

**What happened:** I was offered a separate `/board` page for a screen in
the laundry room, styled like an airport departure board, and a feature
that predicts wait time as a range.

**The obvious alternative:** build both.

**What I decided instead:** neither. The home page already lists every
machine, its state and who's next — it is the board. The effort goes into
redesigning that page properly. The prediction isn't needed: the queue
already shows a fixed time once the person ahead has started.

**Why:** a second page showing the same queue is a feature with no reason
to exist beyond the one already there, and the brief marks those down. The
crit 9 design pass came out plain; fixing the page everyone actually uses
is worth more.

**Backed by:** `plans/crit-10.md` Extension, decision 5, and Stage 12
(pending).

## Turn alerts on the page, not push notifications

**What happened:** README promises the queue pulls you back at two
moments — one person ahead, and your turn — but nothing on the page marks
either. Push notifications were suggested as the full version.

**The obvious alternative:** Web Push, so the alert reaches a locked phone.

**What I decided instead:** an in-page dialog plus a tab-title change.

**Why:** push needs a service worker, a permission prompt, and on an
iPhone the site added to the home screen first — heavy for this app, and
it can't be tested quickly in two browser profiles. The in-page alert
makes README's two moments real now. The gap that's left (a locked phone
sees it later) gets written into README honestly.

**Backed by:** `docs/adr/0009-turn-alerts.md` (pending: Stage 11).

## One unattended run for the extension, with my decisions fixed first

**What happened:** crit 9's design pass came out plain even though I gave
the agent references. Looking back, it only ever had a text description of
the reference, never looked at its own result, and had no design plan, so
it produced the generic version. I'd also seen how the crit agents' pod
runs work: one `prompt.md`, one long unattended run.

**The obvious alternative:** my usual workflow — the agent builds one
stage, stops, I check, repeat — with the same loose UI instructions as
crit 9.

**What I decided instead:** one unattended run of about two hours from a
`prompt.md` I wrote, after committing the plan, ADRs 0007–0009 and an
"Unattended runs" section in `CLAUDE.md`. Every decision that was mine to
make is fixed in the prompt and the ADRs before the run (no identity
verification, one harness, in-page alerts, no separate board). The UI
stage forces what crit 9 lacked: real reference images it has to open and
describe, a design plan committed before any CSS, and scored screenshot
review rounds at both widths with before/after screenshots.

**Why:** the UI failure was a process failure, not a model one — the
agent had no way to see what it built. A detailed prompt with a
verification loop it can run alone fixes that, and fixing my own decisions
in writing first means the run builds my choices instead of making them.
What it gets wrong is the next thing to check.

**Backed by:** `CLAUDE.md` "Unattended runs" and "Test harness rules"
(pending: plan commit); `prompt.md` (pending: plan commit; deleted by the
run's last commit); `HANDOFF.md` and `research/design-review.md` (pending:
the run).

## Planning before code is a harness rule now, not just a stage-start habit

**What happened:** building the fairness simulation's behaviour model
(Stage 13), the agent wrote the day-by-day resident logic straight away.
The first version gave each resident a single fixed lateness value,
rolled once and reused every time they got a chance to claim. Under the
move-back-one rule, a resident whose one fixed number happened to exceed
the claim window missed every future chance in exactly the same way,
forever — producing an endless front-two swap and absurd numbers (500+
swaps from about 60 loads of laundry) that only showed up once the
simulation actually ran, not from reading the code.

**The obvious alternative:** let the agent keep going the way it was —
write code, run it, notice something's off, fix it, re-run — since
`CLAUDE.md`'s existing rule already says to refine a stage's plan before
starting it.

**What I decided instead:** that existing rule wasn't specific enough to
stop this. "Refine the plan" didn't tell the agent *when* a piece of work
inside a stage needs its design written down first versus when it's fine
to just write the code — so it defaulted to writing code for something
that needed a design decision made on paper first. I had it add a
specific rule: before writing code for anything with a new algorithm or
behaviour model, timing/concurrency logic, randomness, or a non-trivial
test/harness, write the actual design choice and the failure mode it
avoids into the plan first — not just "is this complex," which is too
easy for the agent judging its own work to wave through.

**Why it helped:** the bug here wasn't a typo — it was a design flaw
(conflating "does this person ever act" with "how late are they this
specific time") that's obvious once stated in a sentence, but invisible
staring at the loop that implements it. A plan forces that sentence to
get written, and read back, before the code exists to hide behind.

**Backed by:** `CLAUDE.md` Workflow section's new bullet (pending: next
commit); `plans/crit-10.md`'s Stage 13 detail, written after the bug was
found and fixed, naming the design choice directly.

## Keeping the behaviour simulation, once I knew what it actually was

**What happened:** after the simulation hung the machine twice, I
questioned whether it was worth keeping at all — ADR 0005 already argues
in words why "move back one place" is fairer than ejecting, so a pile of
simulated numbers chasing the same conclusion looked like exactly the
kind of feature-for-its-own-sake the final-project brief marks down
("features with no reason to exist"). My actual objection wasn't to
simulation as an idea; it was to adding evidence a decision didn't need,
dressed up as if it did.

**The obvious alternative:** drop it. The agent's own earlier read agreed
— it told me the brief doesn't ask for this, the quantitative case was
redundant with the ADR's qualitative one, and kept it only as "your own
small experiment," not load-bearing for anything graded.

**What I decided instead:** have the agent research what this technique
actually is in the field before deciding, rather than either of us
guessing. It came back with a name — deterministic simulation testing
(DST), the technique behind FoundationDB and TigerBeetle: a controlled
clock and seeded randomness make a whole run reproducible from one
number, and the real code runs inside the simulation instead of a copy of
its rules. That reframed what I was actually arguing about: not "is this
a redundant feature" but "is this a legitimate testing practice I used on
my own project" — and it is, with a real find from the same family of
technique already on record (the property tests this same harness backs,
`spec/fairness-properties.test.ts`, caught an actual concurrency bug in
`moveBackOnePlace` back in Stage 9, before this simulation or this
decision existed). I kept it, written up as testing practice in
`docs/adr/0010-simulation-as-testing.md`, named `/simulation` rather than
`/fairness` since the practice itself, not the policy comparison it
happens to produce, is the point — not as evidence for README's fairness
argument, which was already settled in ADR 0005 and doesn't need
re-proving.

**Why it helped:** the thing that actually made this decision correctly
wasn't either of our first instincts — mine (dropping it as scope creep)
or the agent's (deferring to me without checking whether the field has a
name for what I'd built). It was looking up whether a real engineering
discipline already existed for what I was doing, before judging it by
guesswork. A result from that research is going in `research-note.md`
too, since "is simulating heavy, randomized use of code an AI agent wrote
a legitimate verification practice" is exactly the kind of question that
note is supposed to take a position on.

**Backed by:** `docs/adr/0010-fairness-simulation-as-testing.md`
(pending: next commit); `sim/results.json` (committed, this session);
`research-note.md`'s DST section (pending: next commit).

## Turning a vague outside note into a concrete feature, without reopening identity

**What happened:** a course staff member reviewing the deployed app said
the bot-filled simulation on `/simulation` didn't convince him this was
something a real hall manager would actually adopt — his suggestion was
to picture pitching it to one, and build whatever would make that pitch
land. His own image of the fix was "scan a machine's code, get taken to
a log-in page" — taken literally, that's a second identity mechanism,
which would reopen ADR 0004 (room number only, no accounts) for no good
reason.

**The obvious alternative:** build the literal image he gave — a scan
flow that lands on its own login step — since it's an easy brief to
follow exactly as worded, and the feedback came from someone grading the
project.

**What I decided instead:** read past the literal wording to what he was
actually pointing at — a flow where scanning lands somewhere, that
somewhere already knows who you are, and lets you act immediately — and
confirmed the existing room-number cookie already does exactly that; the
only real gap was a physical, spatial entry point into it. The result is
the 3D walkthrough: a first-person room at `/laundry` with a real,
server-rendered QR code per machine, landing on the exact same
identity/claim flow the home page already uses, not a parallel one.

**Why it helped:** outside feedback is real signal, but it's a reaction
to the current build, not a spec to copy verbatim — this app had already
settled, with its own reasoning, that identity stays a plain room number
(ADR 0002/0004). Taking "log-in page" literally would have meant undoing
that decision to satisfy one reviewer's phrasing instead of his actual
point. The feature that resulted makes the same underlying case —
"you've arrived, the system already knows you, act now" — real enough to
walk through and scan with an actual phone, which is the thing that was
actually missing.

**Backed by:** `docs/adr/0012-3d-walkthrough.md`; `plans/3d-walkthrough.md`'s
Background section, which records the literal feedback and the
confirmed reading of it side by side.

## Requiring a real regression test for the backwards-machine bug, not just a one-line fix

**What happened:** I noticed several washing machines in the 3D room had
their door facing the wall instead of the room — visible in a screenshot
I took myself. I reported the bug and, in the same message, told the
agent to think about how to design an automated test that would prevent
this class of problem from recurring, not just fix the one instance.

**The obvious alternative:** accept a quick patch to the one wrong
rotation constant and move on — the room already looked right again
after the fix, and nothing in the brief requires a test for every visual
constant in a 3D scene.

**What I decided instead:** required a real, running regression test
before considering the bug closed. The agent's own investigation found
that an earlier stage's fix (a sign-flip workaround, "frontSign") had
patched the symptom (a status light looking right) without ever checking
the thing underneath it (the model's own rotation) — exactly the kind of
problem a screenshot check alone won't reliably catch twice. Insisting on
a test, not just a diff, forced the fix to also extract the room's layout
math into a plain function a test could call directly, rather than
leaving it buried inside the browser-only scene script.

**Why it helped:** a screenshot looks right until the next wall or
constant is added, then someone has to notice the same way I just did —
by eye, after the fact. A test that checks "does each machine's rotation
actually point into its own room, not just whichever direction looked
fine in one screenshot" catches a future version of the same mistake
automatically, including ones a screenshot wouldn't obviously reveal from
a different camera angle.

**Backed by:** `spec/laundry-layout.test.ts` (commit `7f8ec33`); the same
commit's `src/laundry-layout.ts` extraction; `plans/3d-walkthrough.md`
Stage 9.5's root-cause writeup.

## Not accepting "that's just the normal camera" and asking for the actual binding to be checked

**What happened:** reporting the character-stuck symptom again, the agent's
first answer was that this was expected third-person camera behaviour (the
character stays centered on screen while the room moves around it) — not
a bug. I'd taken a screenshot showing a red object that moved with the
camera while the character itself stayed put relative to the room, and I
didn't accept that explanation; I told the agent to actually check what
object that red block was and whether something was bound incorrectly.

**The obvious alternative:** accept "it's a known, normal camera design"
and move on — the agent had already demonstrated (with real logged
position/camera values) that the character's coordinates do change when
walking, which is consistent with that explanation.

**What I decided instead:** pushed for the actual binding logic to be
checked, since the screenshot evidence (a detached-looking red object)
didn't fully square with "working as intended."

**Why it helped:** the deeper check found a real, previously-unknown bug —
a race between the character model's own async load and the basket prop's
visibility state, where the basket could be marked "should be visible"
before the mesh carrying it existed, silently losing that state forever
(unless some later, unrelated event happened to reapply it). The "it's
just the camera" explanation was true for the position question but had
nothing to do with the basket, and would have left a real, reproducible
bug uninvestigated if taken as a full answer.

**Backed by:** commit with the `setBasketVisible`/`setBasketKind`
re-application fix (pending: next commit); `plans/3d-walkthrough.md`
Stage 9.6's root-cause writeup.

## Refusing to accept "no bug found" a second time, and asking for the model itself to be swapped

**What happened:** the character-stuck symptom (first raised in Stage
9.3, re-investigated once already in Stage 9.6 without being resolved)
came up a third time. The agent's position/state checks kept coming back
clean — `characterRoot.position` updated correctly, the model's own
bounding box tracked it — and on that basis it reported the design was
working as intended (a normal third-person camera effect). I didn't
accept that a second time: I could see with my own eyes, in my own
browser, that the character wasn't moving, and I told the agent to
replace the character model with the simplest possible shape (a plain
head-and-limbs primitive, no rig) so we could see directly whether the
problem was the model itself.

**The obvious alternative:** accept the agent's repeated "the numbers are
correct, this is just how the camera looks" explanation. Every
automated check it had run agreed with that conclusion.

**What I decided instead:** insisted on an actual swap of the model,
done live in my own browser rather than another round of scratch-server
screenshots, and kept pushing back (including through a detour where the
agent misdiagnosed an unrelated leftover process as "your browser and my
tools are in different network environments," which wasn't it either)
until it isolated the real mechanism.

**Why it helped:** the primitive moved correctly on screen the instant it
replaced the rig, which proved the bug was specific to the rigged model,
not the position/camera code every earlier check had already cleared.
That narrowed the search enough to find the actual cause — the generic
model-cloning code silently shared one skeleton across every copy of the
character, so the character's bones never moved even though its
position variable always did. No amount of re-checking position state
would ever have found this; it took seeing the actual rendered result
contradict the numbers, and insisting that contradiction be explained
rather than argued away.

**Backed by:** commit `8e33e09`; `plans/3d-walkthrough.md`'s Stage 9.3
root-cause writeup.

## Rejecting a camera fix that looked complete, and asking for a full re-check rather than another tuning pass

**What happened:** after reporting the 3D room's zoom-in view snapping
toward a near-top-down angle, the agent's first fix scaled the camera's
vertical pitch offset by the zoom distance and reported the bug fixed,
with real before/after numbers to back it up. I tried it and the exact
same symptom was still there — zooming in still forced a top-down angle,
and dragging to look around barely moved the camera at all once zoomed
in close. I told the agent to stop tuning the same formula again and
properly check the whole camera logic for a deeper conflict between how
it was built and what zooming in/out was asking it to do.

**The obvious alternative:** accept that the fix "mostly worked" and ask
for a second round of number-tweaking on the same formula — the agent
had already shown a real before/after calculation proving the specific
thing it changed (the pitch-driven term) now scaled correctly with zoom
distance.

**What I decided instead:** pushed back that the reported symptom was
unchanged in my own use, and asked for the camera's design to be
re-examined as a whole, not patched again in the same place.

**Why it helped:** the deeper check found that the first fix had only
corrected half the real problem. A separate, fixed vertical offset
(`CAM_HEIGHT`, independent of zoom distance entirely) was still being
added on top of the part that got fixed, and that fixed offset alone was
enough to force a steep angle once the camera sat close — present even
with no deliberate pitch input at all, and using up most of pitch's own
range the moment it was. The actual fix replaced the whole camera
position formula with a proper orbital construction (the camera on a
sphere around the look target, the same shape a standard orbit camera
uses), rather than another scaled constant bolted onto the existing one.
Treating "the number change you can see is correct" as proof the bug was
fixed, instead of re-testing the reported symptom itself, is exactly what
let the first, incomplete fix go out as "done."

**Backed by:** commit `935bad5`; `plan.md`'s Current state entry on the
same (documents both the incomplete first attempt and the real fix).

## Overruling the agent's rejection of a scan-gated claim

**What happened:** asked whether claiming a machine on the home page
should require having actually scanned the machine's real QR code first
— the home page button still just says "Claim (scan)" and lets you
click it with no scan at all, which struck me as the wrong side of what
the 3D room's whole purpose was supposed to be. A parallel session's
own pass at this exact question had already concluded "reject" with five
numbered arguments, and the agent initially repeated that same
conclusion back to me (it isn't filling a real gap, it would narrow "a
phone alone is enough," the QR code carries no real trust signal to gate
on, it would fork test/production behaviour, and it needs new state with
open questions).

**The obvious alternative:** accept the rejection at face value — it was
well-argued, consistent with the project's own documented "good"
argument, and backed by a close reading of the code.

**What I decided instead:** pushed back on three specific points: (1)
claim/start being two separate taps was always strange without a real
arrival check behind it — the 3D room is exactly what makes that check
possible now; (2) letting someone claim from their phone with no
presence check is itself the unfair thing, since they can then sit on
the machine without ever coming down, blocking whoever's actually next;
(3) this isn't a change to the fairness/ordering rule itself, just a new
precondition on one existing action. I asked for a real plan — not just
agreement — that specifically worked out whether the test/simulation
fork problem could be solved another way, instead of treating it as a
dead end.

**Why it helped:** on inspection, the "no real trust signal" argument
didn't hold up — the gate doesn't need to cryptographically prove
presence to do real work, the same way an unverified room number still
does real work for identity elsewhere in this app. And the "test fork"
problem turned out to have a real answer: every existing spec and the
simulator already call `join()` before `claim()` to build up real
preconditions, so a new `recordScan()` function, called the same way by
production and by every test/sim caller, adds one more precondition
without forking any behaviour. The push-back also surfaced that one of
the rejection's own "open questions" (what happens if the fairness rule
moves someone to a different machine after they've scanned) was based on
a wrong assumption about `moveBackOnePlace` — it never changes which
machine a reservation is on, so that risk doesn't actually exist.
Treating the first rejection as final would have left a real gap in the
app's own claimed fairness unaddressed, on the strength of an argument
that didn't survive being checked against the actual code.

**Backed by:** `docs/adr/0015-scan-gated-claim.md` (the original
rejection, left unedited, status updated to record the overrule);
`plans/laundry-scan-gated-claim.md` (the full design, not yet built —
pending: a future stage).