# Crit 9 reflection

**What was the breakthrough that moved the work forward?**

Crit 9's job was real-time sync. The actual breakthrough was using the deployed app myself and hitting friction no amount of planning surfaced: clicking through to a separate reservation page felt pointlessly indirect, and the claim-window text sat there dead instead of actually ticking down the way I'd want it to if I were really standing in a laundry room checking my phone ([`4cae99e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/4cae99e), [`b04d236`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/b04d236)). Even the words the app used — "Starts," a bare position number — turned out to say something different from what I actually meant once I read them as a real user would, not as a developer checking a feature off a list ([`c283889`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/c283889)). As the brief says, an agent produces the median answer, not the real design; only I, living with the actual thing, could have felt that those specific choices were wrong.

**What did this work change about who I want to be as a software developer?**

Two things. First: a clearly-written `CLAUDE.md` rule doesn't guarantee an agent actually holds to it — the same port-8080 mistake happened more than once in one session even after I'd pointed it out, and only writing the fix straight into the harness, not trusting "it'll be more careful," actually closed it ([`71f3426`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/71f3426)). 

Second, and bigger: `plan.md`'s whole point is letting a new conversation pick up cold, but I've now seen twice that an agent can quietly settle on its own word for something — crit 8's README framed "fair, and seen to be fair" as one virtue among several, when what I actually wanted was to save people the time of standing there, not fairness for its own sake — and if nobody catches that drift, both sides end up building on a term neither of us really agreed on. This happened once before on a different assignment. This time I caught it myself and pushed the README back to the real goal before it calcified into every later file ([`754949a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/754949a)). 

I want to be a developer who treats syncing with an agent as active, ongoing work across every session — not something `plan.md` does for me automatically.
