# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the starter is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## Commits

- Commit incrementally, and tell me after each commit — no batching.

## Workflow

- **Plan first.** At the start of each Crit/Assignment, the user gives a
  rough idea first, then the agent generates `plan.md`: a full outline plus
  a first-draft plan for every stage. Stage boundaries are the agent's own
  call — split where the work naturally breaks and the size feels right —
  and can be adjusted later. There is one `plan.md` file for the whole
  project, continuously iterated from there — never rewritten from scratch.
- The top of `plan.md` must always have: instructions to read the relevant
  brief and spec, the project background (what we're building and the
  user's vision), and the current state — so `@plan` alone lets a new
  conversation quickly understand the situation.
- Before starting a stage, refine that stage's own plan section against the
  real situation (not the whole outline).
- Verify each stage by hand: write the code, stop, show the user something
  they can check themselves, and wait for feedback. If something's wrong,
  don't edit yet — analyse the code and the user's description until you find
  the actual fault, present the diagnosis, and wait for the user to agree
  before editing. Then edit, verify again, and repeat until the user is
  satisfied.
- Finishing a stage means updating its state in `plan.md` and folding that
  update into the stage's last code commit — report it like any commit — then
  waiting for the user to `/clear`. That commit is what guarantees progress
  survives the `/clear`.
- A new conversation starts with `@plan`: read the brief/spec, the
  background, and the real codebase, and confirm the claimed state is
  actually done. If the state says "in progress," skip replanning and resume
  the unfinished work described there. If the stage is done, refine the next
  stage's plan and wait for approval before writing code.
- Small bug fixes don't need a `plan.md` change — only new features or new
  stages do. If a fix grows into something that changes the overall design,
  don't make that a special process — just note it in the plan or the state
  once it lands, so the next session knows.
- Run `pnpm check` and make it green before showing the user anything.

## Process

- Read the `PROCESS.md` template in this repo and the [Assessment
  page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/).
  Watch for a real fork during the work: a point where the obvious
  approach — to the build, or to how we work together — carried a mistake
  or risk, and we did something else instead for a reason. Log it in
  `process-notes.md` and tell me. Say what backs it (a rule in `CLAUDE.md`,
  a check in `spec/`, or a committed deletion). If that isn't committed
  yet, mark it pending: say exactly what is missing and which stage adds it.
- Don't log chat-only corrections, renames, tool workarounds, progress
  notes, or mechanical cleanup with no real alternative considered.
- Log only my own decisions: a point where I didn't take the agent's word,
  overruled its answer, or made a call it couldn't make for me. Don't log
  technical trouble the agent hit and fixed by itself.
- Write every entry from my point of view, in plain language: what I was
  told, what I decided instead, and why. No internals or library names
  unless my reasoning needs them.
- For each entry, record: what happened, the obvious alternative, what we
  did instead, why it helped (evidence, or what's missing), and the commit
  hash — real, from `git log`/`git show`, or `pending: Stage N` if nothing's
  committed yet. Never invent a hash.
- Before shipping: remind me to write `PROCESS.md` — pick only the most
  important moment from `process-notes.md` and write it up as a coherent,
  clearly reasoned narrative of the whole build, from the assignment brief
  to the harness we built. A crit week needs 150–300 words; an assignment
  needs 400–600.
- Also remind me to write `reflections/` from the whole `process-notes.md`,
  kept moments or not.
