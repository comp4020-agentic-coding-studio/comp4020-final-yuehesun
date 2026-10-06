# 0004: Identity format — room number only, as `roomXXX`

## Status

Accepted. Supersedes [0002](0002-identity.md).

## Context

ADR 0002 let identity be a self-declared name or room number, typed once
and remembered per browser. Building Stage 1 exposed the problem: a name
isn't unique. Two residents could both type "Alex", and the app has no way
to tell them apart — but claim/start/cancel are authorized by an exact
identity match, and the fairness rule's position-tracking depends on each
person being a genuinely distinct identity. A collision doesn't just
mislabel someone in the UI; it would let two different people share one
queue position, or let one accidentally act on the other's reservation.

A room number doesn't have this problem: in a dorm, a room houses one
resident (or a small fixed group treated as one queue identity), so it's
unique where a name isn't.

## Decision

Identity is a room number only, in the format `roomXXX` (`room` followed by
digits, e.g. `room304`) — case-insensitive on input, stored lowercase.
Names are no longer accepted. `POST /identity` rejects anything that
doesn't match with a 400.

## Consequences

- Fixes the uniqueness problem ADR 0002 didn't address: claim/start/cancel
  ownership and queue position now rest on an identity that's actually
  distinct per resident.
- The format itself is now an **enforced** claim (`README.md`), checked by
  `spec/identity-format.test.ts` and the `CLAUDE.md` rule.
- Still no verification that the room number is truthful — that reliance
  is unchanged from ADR 0002, just narrower now (a room number is at least
  falsifiable in a way a name isn't, since residents know whose room is
  whose).
- The uncollected-clothes nudge (plan.md) now unambiguously names a room to
  notify, which maps onto reality better than an arbitrary typed name.
