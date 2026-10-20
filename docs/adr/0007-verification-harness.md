# 0007: One harness for checking the queue's rules and comparing them

## Status

Accepted — implementation pending (`plans/crit-10.md` Stages 9 and 13).

## Context

The queue's timing rules are the core of `README.md`'s fairness argument:
a 3-minute claim window, a 5-minute start window, move back one place when
either is missed (ADR 0005), 2 minutes to answer an offer, 10 to reach an
offered machine, and a dryer whose window waits for its wash. Until now
every one of them has been checked by hand, by waiting out a real window,
because `spec/` only talks to the running app over HTTP and nothing can
make its time pass faster. README therefore lists them as judged, not
enforced.

ADR 0005 also argues, in words only, that moving back one place is fairer
than crit 8's "ejected outright". Nothing measures that.

Two questions, then: do the rules always hold, and is the chosen rule
actually better than the alternatives? They need the same machinery: run
the real queue code through many situations with time under the test's
control.

## Options considered

1. **Keep waiting out real windows by hand.** Free, but each check takes
   minutes, covers one path, and leaves the rules judged.
2. **A test-only HTTP route that moves the server's clock.** Works with the
   existing HTTP-only spec, but it is a route that changes everyone's queue
   timing. Even behind an env flag it risks reaching production, and it
   still runs slowly, one request at a time.
3. **Inject the clock and run `queue.ts` in-process** on a fresh in-memory
   database. Production reads `Date.now()` through one function, so it is
   unchanged; tests and the simulator swap that function for a virtual
   clock.
4. **A separate simulator that re-implements the rules.** Fast and simple,
   but a second copy of the rules can agree with itself while the real
   ones are wrong.

## Decision

Option 3, used twice:

- **Property-based tests** (`spec/fairness-properties.test.ts`,
  `fast-check`): random sequences of joins, claims, starts, cancels,
  finishes, offer replies, dryer requests and time passing, with these
  invariants checked after every step:
  1. a machine has at most one claimed-or-running reservation, and it is
     the front of that machine's queue;
  2. positions on each machine are exactly 1..n, with no gaps or repeats;
  3. two reservations on the same machine only change order through a
     move-back-one swap of the front two, and that swap only happens after
     the front's window has really run out;
  4. no room ever holds more than `MAX_ACTIVE_PER_TYPE` active reservations
     of one machine type;
  5. a dryer reservation's claim window never starts before its wash is
     done;
  6. a machine has at most one pending offer, and so does a reservation;
  7. no reservation disappears: each one is still active or has reached a
     final status.
  Plus direct tests for each timing rule on the virtual clock.
- **Fairness simulation** (`scripts/simulate.ts`, `pnpm sim`): a seeded
  Saturday in a 100-resident building, the same events run under three
  missed-window policies (wait forever, eject, move back one), results in
  `sim/results.json`, shown at `/fairness`.

Both live on one harness in `sim/`: seeded PRNG, forward-only virtual
clock, and a driver that calls the real `queue.ts` functions. The
missed-window policy can be switched only inside that harness.

## Consequences

- The timing rules move from judged to enforced: README's "What's
  enforced" can name `spec/fairness-properties.test.ts` for each.
- Random sequences find orderings nobody would write by hand, and a
  shrunk counterexample shows the shortest sequence that breaks a rule.
  Because they are random, they are also harder to satisfy by writing code
  that only passes the cases a test author thought of.
- ADR 0005's argument gets numbers. The numbers are only as good as the
  behaviour model (how late people are, how often they don't show), which
  is assumed, not measured; `/fairness` says so.
- `queue.ts` gains a dependency on `src/clock.ts`, and `src/db.ts` gains
  a way to open an in-memory database. Both are small, and production
  behaviour is identical.
- The policy switch is a risk if it ever became reachable from the running
  app. `CLAUDE.md`'s test harness rules forbid that.
- `fast-check` is a new devDependency; the running app gains none.