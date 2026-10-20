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
means the numbers on `/fairness` come from exactly the code the tests
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