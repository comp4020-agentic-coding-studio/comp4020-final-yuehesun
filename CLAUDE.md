# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the starter is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## Language

- Chat with me in Chinese. Everything that lands in the repo — code,
  comments, commit messages, docs, ADRs, `research-note.md`, everything —
  is written in English, for an English-speaking reader.
- Everything written in first person in the repo — `PROCESS.md`,
  `README.md`, `process-notes.md`, reflections, commit messages — is
  written in mine. I'm the one who decided what to build and what to fix;
  the agent narrating its own actions in "I" (with me as "the student" or
  "the user") doesn't belong there, even in a passage describing something
  the agent itself did wrong. Write it as something I observed and
  decided, not something the agent is confessing.

## Commits

- Commit incrementally, and tell me after each commit — no batching.

## Workflow

- **Plan first.** At the start of each Crit/Assignment, the user gives a
  rough idea first, then the agent generates `plan.md`: a full outline plus
  a first-draft plan for every stage. Stage boundaries are the agent's own
  call — split where the work naturally breaks and the size feels right —
  and can be adjusted later.
- The top of `plan.md` must always have: instructions to read the relevant
  brief and spec, the project background (what we're building and the
  user's vision), and the current state — so `@plan` alone lets a new
  conversation quickly understand the situation. `plan.md` holds the
  whole-project vision and is never rewritten, only grown; each crit also
  gets its own plan file under `plans/` (e.g. `plans/crit-8.md`) with that
  crit's stage-by-stage detail, linking back to `plan.md` for background
  instead of repeating it.
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
- When starting a server for your own verification (not the user's
  `pnpm dev`), never use port 8080 — that's reserved for the user's dev
  server. Use a distinct port instead. The moment that verification is
  done — pass or fail, before moving to the next thing — kill it and
  confirm the port is actually free (`ss -tlnp` or equivalent) rather
  than trusting a `kill` command's exit code alone. Don't defer this
  "until later" or "after this batch of checks": a server left running
  from one verification is exactly what collides with the user's own
  `pnpm dev`, or with the next verification server, later in the same
  session — a stray process left listening is what the user ends up
  testing against, silently, with no error telling either of you it's
  stale.

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
  important moment(s) from `process-notes.md` and write it up as a coherent,
  clearly reasoned narrative of the whole build, from the brief to the
  harness we built. This repo is the final project (one repo across crits
  8/9/10, graded as a whole), so the final-project brief's numbers apply,
  not a standalone crit week's: `PROCESS.md` is 900–1100 words and gets
  **rewritten in full** at each crit so it always describes the project as
  it stands — not appended to — and must also justify the stack/workflow
  choice and its trade-offs. `README.md` is 400–600 words.
- Also remind me to write `reflections/` from the whole `process-notes.md`,
  kept moments or not.

## App rules (Laundry Queue)

The enforceable rules behind `README.md`'s "good" argument. `spec/` checks
whatever here is checkable; `PROCESS.md` says when something's judged
instead.

- Talking is optional, never required: no feature may make chat, a direct
  message, a comment, or any other person-to-person channel necessary to
  know your status or claim your turn. The queue alone must always be
  enough. (Not a ban on messaging existing — a ban on it being load-bearing.)
- No accounts or login, and no names. Identity is a room number only, as
  `roomXXX` (e.g. `room304`), remembered per browser — nothing verifies
  it's true, and nothing more is stored about a person. Anything that
  doesn't match the format is rejected (see
  `docs/adr/0004-identity-format.md`).
- The documented fairness rule is the only thing that decides turn order.
  No feature may change someone's position except through it.
- A room holds at most 2 active (waiting/claimed/running) reservations per
  machine type at once. Enough to wash darks and lights separately; not
  enough to tie up every washer.
- No feature exists purely to grow usage (invites, sharing prompts,
  re-engagement notifications).
- Every "enforced" line in `README.md` needs a matching `spec/` check
  before it counts as shipped.
- Schema changes go through `drizzle-kit generate`; the migration files it
  writes are committed, and `migrate()` runs at server boot. Never run
  `drizzle-kit push`, and never apply migrations via Fly's
  `release_command` — see `docs/adr/0003-tech-stack.md` for why.
- Never delete or regenerate an already-generated migration file to fix a
  schema mistake (e.g. a type error in `schema.ts` found right after
  `db:generate`), even if it was never committed. Any local dev database
  (`.data/`, or one started for your own verification) may have already
  run it — deleting the file and re-generating a new one with a different
  name means that database's migration-tracking table no longer matches
  any file on disk, and the next boot tries to re-run a `CREATE TABLE` for
  a table that already exists, crashing outright with no clear signal why
  to whoever hits it next. Fix the schema file, then run `db:generate`
  again to produce a *new, additional* migration that corrects it — the
  same way you'd fix any other already-applied migration — and delete
  `.data/` yourself (it's gitignored, never real data) if a local database
  is left in a state that won't reconcile.
