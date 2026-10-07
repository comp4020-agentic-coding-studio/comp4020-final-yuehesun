# Crit 8 reflection

**What was the breakthrough that moved the work forward?**

For a while, working out the app concept with the agent felt bumpy. Its
own first suggestions — three generic directions for a "multi-user,
real-time, persistent" app — were reasonable but obviously uninteresting,
because none of them came from a real problem ([ADR 0001](../docs/adr/0001-app-concept.md)). Even once I had
a vague idea of my own, a laundry-room queue from a dorm I'd actually
lived in, talking it through with the agent didn't click right away. The
breakthrough came when I stopped describing the idea in the abstract and
instead worked out, in my own head, exactly what the system looked like —
then narrated it back as a concrete story: a specific resident, checking
their phone, reserving a specific machine, waiting their turn, missing it,
someone else getting an offer instead. Once I could walk through a real
use of the app step by step, the agent's plans started matching what I
actually meant, and the work went from stuck to fast (see
[plan.md's "User story"](../plan.md#user-story)).

**What did this work change about who I want to be as a software developer?**

It sharpened something I'd have agreed with in theory but hadn't really
felt: an agent can build what I specify, but it can't replace the work of
specifying. The idea, the judgment calls, the real-world detail — that has
to come from me, worked out clearly enough to narrate, before any tool can
help with it. I want to be a developer who does that thinking up front,
rather than one who hands an underspecified idea to a tool and hopes
something good comes back.
