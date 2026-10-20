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
handling. I didn't buy it, and had it run the exact same simulation in a
second, completely agent-free terminal — it crashed exactly the same way,
which ruled that theory out and pointed at the real cause instead (full
technical account in `PROCESS.md`)
([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913)).

**What did this work change about who I want to be as a software developer?**

I want to put more real effort into the brief I write before a long
unattended run, and treat that upfront writing as the actual engineering
work, not administrative overhead before the "real" building starts. The
quality gap between a loosely-prompted pass and a fully-specified one was
too large this crit to read as a coincidence.

I also want to keep my own judgment in the loop when something crashes
and an explanation arrives fast. "Not a code problem" sounded complete,
but it was a guess that hadn't been tested against the simplest possible
alternative — running the same thing with no agent involved cost almost
nothing and settled the question for real.

And reviewing my own project's history for this document, I couldn't
recall several crit 8/9 decisions until I re-read the ADRs and
`process-notes.md` and reconstructed them from what was written at the
time, not just the outcome. That's the actual point of keeping this
harness going: not that a marker reads it, but that I can still read it
back once my own memory hasn't.
