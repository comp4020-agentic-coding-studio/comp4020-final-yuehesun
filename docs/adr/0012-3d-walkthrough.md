# 0012: Scanning a machine's QR code trusts the scanner, same as a room number does

## Status

Accepted.

## Context

The 3D walkthrough (`plans/3d-walkthrough.md`) puts a real, scannable QR
code on each machine, linking to a page that can claim or reserve that
machine. Before building it, one real decision had to be made: should
that link be protected somehow (a token, an expiry, something tying it to
the current queue state), or is a plain link to the machine enough?

## Decision

**No protection.** The QR code is just a link to the machine; scanning it
works for anyone, the same way typing any room number into the identity
form already works for anyone. Confirmed with the user: this matches how
the app already treats identity (room numbers are never verified), so the
QR code shouldn't be held to a stricter standard than the rest of the app.

## Consequences

- Scanning a machine's code is exactly as trustworthy as standing in the
  room and reading a sticker off it — someone would need to actually see
  the code to use it.
- No extra logic (tokens, expiry, state checks) was built for this, which
  keeps the feature small.
