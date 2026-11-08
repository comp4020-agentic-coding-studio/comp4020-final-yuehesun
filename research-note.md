# A passing test is a claim, not proof

When an agent writes both the code and its tests, a green run is reassuring. But all it shows is that the code satisfies the tests' assertions. Whether those assertions describe what was wanted is a separate question, and the agent can't settle it alone, because the same misreading of a task can shape both the code and the tests that approve it. My position is that the human in agentic development doesn't need to perform every check, but must own what counts as a successful check.

## Where the agent's tests come from

A unit test has inputs and an oracle, the assertion of what the output should be. The oracle is where intent lives. Konstantinou, Degiovanni and Papadakis (2024) had LLMs write oracles for 24 Java projects, including buggy versions, and found the models mostly asserted what the code actually did rather than what it was meant to do. A test written that way passes on a bug, because it was written by reading the bug.

Knight and Leveson (1986) help explain why keeping code and tests in separate files doesn't fix this. In their study, 27 versions of one program, written independently from the same specification and run on a million tests, failed together far more often than independence predicted. They studied human programmers, but the point carries over: independence depends on where the expected behaviour comes from, not on how many separate artefacts exist. An agent writing code and tests from one interpretation has one source, not two.

Wang, Pradel and Liu (2025) found that weak validation tests had inflated SWE-bench resolution rates by 6.2 percentage points. And where tests block progress, agents can change the test instead of the code. ImpossibleBench (Zhong, Raghunathan and Carlini, 2025) deliberately makes tests contradict the specification, so any pass is a shortcut, and models passed them by editing tests or overloading operators. These are constructed traps, not everyday conditions, but Kent Beck reports agents deleting tests to make them "pass" in ordinary work too (Orosz, 2025).

## What this looked like in my project

In my final project, there are many times the agent's checks or explanations said a bug was fixed or understood when it wasn't (detailed in `PROCESS.md`). In one, a character in the 3D room stood still while the agent's checks said it was working as intended. Rather than ask for another explanation, I had it swap in a simple placeholder with no skeleton: if the placeholder moved and the real model didn't, the fault had to be in the rigged model. It moved. That pointed to the code copying the model, which shared one skeleton across every clone, so the bones never followed a position value that had been correct all along. My check wasn't cleverer than the agent's. It started from a different assumption: independence in Knight and Leveson's sense. Cases from one person prove little, and I remember the doubts that paid off better than those that didn't, but they match the studies.

## The counter-case: agents that verify

The strongest objection comes from OpenAI's Codex team, which reports building a product of about a million lines with no hand-written code, moving nearly all review to agent-to-agent, and wiring browser DevTools into the agent so it can reproduce bugs and validate UI fixes itself (Lopopolo, 2026). So how much human checking is left?

This is real progress, and it moves repetitive checking off human time. But the team had to build that legibility, which shows the default: an agent sees the state it can read, not what a user sees. Even with those tools, it chooses what to look at, and the cheap channel tends to win. In my 3D case the agent checked coordinates, I suspect because they are far quicker to read than rendered frames. The bug lived in the gap between the state and the screen, and a person could see it at a glance. The same post admits that as output grew, the bottleneck became human QA capacity, and it is a vendor describing its own tool on an internal beta.

## What good practice looks like

Agent-written tests still help: Konstantinou et al. found that LLM oracles caught more faults than the traditional generator EvoSuite. The line is about permissions: the agent can run the acceptance tests and change the implementation until they pass, but it cannot change the criteria without human approval. And some criteria can't be written down in advance at all. Whether standing in the room actually feels like a relief, and whether the claim windows are long enough to be fair without inviting idling, is for whoever uses the room to judge. An agent checks the state it can read. A person checks whether the system meets a need, and sees it the way its users will. The first can be handed over; the second can't. A green run doesn't make that decision.

## References

- Knight, J. C., & Leveson, N. G. (1986). An experimental evaluation of the assumption of independence in multiversion programming. *IEEE Transactions on Software Engineering*, 12(1), 96–109. https://doi.org/10.1109/TSE.1986.6312924
- Konstantinou, M., Degiovanni, R., & Papadakis, M. (2024). Do LLMs generate test oracles that capture the actual or the expected program behaviour? arXiv:2410.21136. https://arxiv.org/abs/2410.21136
- Lopopolo, R. (2026, February 11). Harness engineering: Leveraging Codex in an agent-first world. OpenAI. https://openai.com/index/harness-engineering/
- Orosz, G. (2025). TDD, AI agents and coding with Kent Beck. *The Pragmatic Engineer*. https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent
- Wang, Y., Pradel, M., & Liu, Z. (2025). Are "solved issues" in SWE-bench really solved correctly? An empirical study. arXiv:2503.15223. https://arxiv.org/abs/2503.15223
- Zhong, Z., Raghunathan, A., & Carlini, N. (2025). ImpossibleBench: Measuring LLMs' propensity of exploiting test cases. arXiv:2510.20270. https://arxiv.org/abs/2510.20270