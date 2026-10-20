# Crit 10 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough was treating the unattended `prompt.md` run as a tiny
piece of engineering in its own right, not just "let it run longer." I'd
tried giving the agent reference images before, for crit 9's visual pass,
and still got something generic — it only ever worked from a text
description of the images, never looked at what it actually built, and
had no plan before writing CSS. For crit 10 I wrote every decision down
first — identity, the harness, in-page alerts, no separate board — into
ADRs and a `prompt.md` brief, then let the agent run unattended for about
two hours, verifying itself with specs and screenshots instead of asking
me anything. It cost about $48 and the result finally looked considered,
not generic — the difference wasn't effort, it was that the thinking
happened before the run instead of during it
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)).
That reframed how I think about a prompt: not an instruction, a small
spec I have to get right once, because nobody is there to patch it
mid-flight.

The other real breakthrough was uglier. Running a 100-resident simulation
to check the fairness rules at scale, the whole machine locked up hard
enough that I had to use `claude --continue` to get back into a usable
session, twice. The agent's first theory was its own background-task
handling — plausible, since both crashes happened while it had something
running in the background. I didn't buy it: a tool spawning a background
job shouldn't be able to redline the CPU and spin the fans up like that,
and the timing felt like a cover story for something in the simulation
itself. I had it test the theory properly rather than accept the
explanation — open a second, completely agent-free terminal and run the
exact same simulation by hand. It crashed exactly the same way, with no
agent anywhere near it. That ruled out my suspicion as cleanly as it
ruled out the agent's own first guess, and pointed at the real cause: the
whole 50-seed batch (126,000 simulated minutes) ran inside one
synchronous loop with no point where the process could ever hand control
back to the system, which is a much worse thing to do inside a VM than on
bare metal. The fix was small once found — yield every simulated hour —
but finding it meant not accepting the first plausible-sounding
explanation from either side
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).

**What did this work change about who I want to be as a software developer?**

I want to put more real effort into the brief I write before a long
unattended run, and treat that upfront writing as the actual engineering
work, not administrative overhead before the "real" building starts. The
quality gap between a loosely-prompted pass and a fully-specified one was
too large this crit to read as a coincidence.

I also want to keep my own judgment in the loop when something crashes
and an explanation arrives fast. "Not a code problem" from the agent
sounded complete, but it was actually a guess that hadn't been tested
against the simplest possible alternative. Running the same thing with no
agent involved at all cost almost nothing and settled the question for
real instead of settling for whichever explanation sounded more
convenient at the time.
