# Flighty → Laundry Queue: what to borrow, what not to

## Borrow

| Flighty | Laundry Queue |
|---|---|
| Departure board: one row per flight — flight, destination, gate, time, status | One row per machine: machine, state, next room, time left |
| Status is colour **and** a word (on time / delayed / cancelled) | Every machine and reservation state has a word as well as a colour (our existing rule: colour never alone) |
| A trip shows a different screen at each stage (check in, boarding, in the air, landed) | My reservation has its own layout for each state: waiting, one ahead, my turn, claimed, running, done, moved back, offer |
| The time you care about is the biggest thing on the screen ("Boards in 12 min") | "Your turn in ~12 min" / "3:00 left to claim" is the largest text on the page |
| Delay reason in one plain line | "You moved back one place: you didn't claim within 3 minutes" — the reason, not just the result |
| Inbound plane shown as the cause of your delay | "Waiting on room 210's wash (ends 14:20)" — the reservation ahead is the cause |
| Calm: dense data, almost no decoration | The page stays quiet until something needs me (README's calm technology argument) |

## Don't borrow

- Dark mode as the default look, 3D maps, globe imagery — Flighty's
  product identity, nothing to do with a laundry room.
- Paywall, social sharing, stats and history — README excludes profiles,
  history and anything that exists to grow usage.
- Lock screen widgets and push — out of scope (ADR 0009).