# 0001: App concept — the laundry room queue

## Status

Accepted

## Context

The final project is one app, built across three crits (8, 9, 10) in one repo — so this choice has to hold for the whole project, not just this week.

## Decision

Build the laundry room queue.

Claude first suggested three directions: a one-off workshop tool, a party game for friends, and a "home-cooked" shared space for a known group. All rejected — reasonable, but generic, and none came from a real problem I'd actually had.

A fourth idea, a co-op detective search game played out on one shared illustration, was also considered and dropped. It was fun, but most of the work would go into writing game content and puzzles, not into the multi-user/real-time/persistence problems the brief is actually about.

My idea: For crit 7 asked us to improve an existing ANU system, I started thinking about small everyday annoyances instead — problems I'd actually lived through. That led to two real candidates:

- **Laundry room queue** — my student residence has ~10 machines shared by 100+ people. On weekends I'd sit in the laundry room because leaving meant risking losing my turn.
- **Card swap hall** — in a mostly single-player game I play, trading duplicate cards with other players means visiting their world in person, so most people just shout requests on social media instead.

Both are the same underlying idea: strangers who need to cooperate over a shared resource, without wanting to chat or friend each other to do it. The app's job is to let shared state carry the coordination, so talking stays optional.

Between the two, card swap was rejected: it needs a lot of upfront explanation of a niche game mechanic before anyone understands the problem, and it doesn't leave much to dig into beyond "build a matching system, done." Laundry queue won because it's something anyone immediately understands, it's grounded in something I actually lived through, and it has real depth to explore.

## Consequences

This scenario sets the direction for deeper exploration of the app: the queue's fairness rule, what happens on a no-show, how real-time the "it's your turn" moment needs to be, what counts as a "person" with no accounts involved, and staying scoped to one laundry room instead of genericizing into a booking product.
