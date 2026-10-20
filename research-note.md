# Research note: good agentic development practice

## Position

Good agentic coding practice is not a question of how much a developer
writes down before an agent starts — it is a question of *where* human
judgement is spent. The two positions that dominate current discourse,
vibe coding (review nothing, trust the output) and spec-driven
development (write a comprehensive specification, then let the agent
execute against it), are both wrong for the same underlying reason: they
fix the amount of oversight in advance instead of placing it where a
correction is cheapest and a mistake is most expensive. The right
discipline is incremental, checkpoint-based control calibrated to
irreversibility, not volume of prose.

## Vibe coding: too little, applied uniformly

"Vibe coding," Karpathy's term for accepting AI output purely because it
feels right, was always a bet that review could be skipped. Field
evidence says the bet fails under its own terms. A grey-literature review
of practitioner accounts ([Vibe Coding in Practice](https://arxiv.org/pdf/2510.00328))
finds a consistent speed–quality trade-off: developers report fast,
flow-state progress, but also skipped testing and code that collapses
outside the cases it was demoed on. Osmani's critique names the failure
mode directly — "house of cards code" ([Vibe coding is not the same as
AI-assisted engineering](https://medium.com/@addyosmani/vibe-coding-is-not-the-same-as-ai-assisted-engineering-3f81088d5b98)):
it works until it doesn't, and nothing in the workflow would have caught
the difference earlier. The problem isn't that no spec existed; it's that
no checkpoint existed anywhere in the loop.

## Spec-driven development: too much, applied uniformly

The dominant industry answer swings the other way: write the
specification first, in full, and only then let the agent generate code
against it ([Spec-Driven Development for Agentic Software Engineering](https://arxiv.org/pdf/2609.00252)).
This fixes vibe coding's missing checkpoint everywhere at once, regardless
of whether a given change needs it. Kent Beck's objection is the
sharpest counter: the approach assumes nothing learned during
implementation should ever change the specification, which is false for
almost all real work. Practice bears this out — one comparison found
spec-first work took roughly ten times longer than iterative prompting
for the same feature with no quality gain ("Waterfall in Disguise"), and
a formal analysis ([The Spec Growth Engine](https://arxiv.org/pdf/2606.27045))
names the structural cause: silent spec–code drift, where nothing in the
method surfaces the gap once spec and code diverge, until it's expensive
to repair. Comprehensive upfront specification buys back vibe coding's
missing oversight at the cost of rigidity the work doesn't uniformly
need.

## What the evidence from capable practitioners actually shows

Both failure modes share a premise: that oversight is a single dial, set
once, for the whole task. A field study of experienced developers
contradicts this directly ([Professional Software Developers Don't Vibe,
They Control](https://arxiv.org/html/2512.14012v2), N=13 observed, N=99
surveyed): they neither skip review nor front-load complete
specifications, but intervene at specific, narrow points — before a
schema change, before a dependency is added, before a public interface is
touched — and otherwise let the agent run. This matches Parasuraman and
Riley's framework for human–automation teams: the goal is *calibrated*
trust, not maximal trust or maximal scrutiny, since over-trust (misuse)
and under-trust (disuse) are both costly, and the right amount of
attention depends on an action's reversibility, not a blanket policy set
in advance. A benchmark-driven analysis of agent autonomy ([The End of
Software Engineering](https://arxiv.org/html/2606.05608v1)) reaches the
same prescription from the opposite direction — isolated-task benchmarks
look strong, sustained autonomous runs do not — recommending
"human-in-the-loop, agent-in-the-driver's-seat": agents own execution,
humans own judgement at the points that matter.

## Calibration has a second axis: matching method to defect type

Placement answers *where* to check; it doesn't answer *how*. A
concurrency race hiding in a twenty-line function reads as correct to a
reviewer every time — reading more carefully doesn't help. **Deterministic
simulation testing (DST)**, the technique behind FoundationDB and
TigerBeetle, routes a component's clock and randomness through a
controlled seam and drives the real code through a seeded PRNG, so a
whole run is a reproducible function of one integer. Building this seam
into an agent-written queue-fairness component and running randomized
sequences through it found a real bug — two same-millisecond operations
silently cancelling a fairness guarantee — that review had already passed
as correct. Calibrated trust isn't only about which actions get a
checkpoint, but whether the checkpoint's *method* can see the defect
class that kind of code tends to hide: a schema change needs a human
reading it; a concurrent state machine needs volume and reproducibility a
human reading code cannot supply.

## The resulting position

Good agentic practice is checkpoint placement, not checkpoint quantity.
A workflow should identify which actions are hard to reverse or costly
to get wrong — schema changes, deleted data, published interfaces,
irreversible deploys — and gate exactly those on human review, while
leaving everything else to run. Vibe coding under-gates everything;
spec-driven development over-gates everything by trying to anticipate
every gate before the work starts. Neither failure is about the literal
amount of writing involved — it is about deciding oversight's location
in advance of knowing where the risk actually is, instead of in response
to it. Placement alone is incomplete, though: a checkpoint also has to
use a verification method capable of catching the defect class the code
at that point tends to produce. Concurrency and state-machine logic in
particular hide behind code that reads correctly, so calibrated review
there means reaching for techniques like DST and property-based testing,
not just reading more carefully.
