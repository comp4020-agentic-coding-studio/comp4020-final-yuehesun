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

## Addendum: carrying the 3D room's own room number as a scan convenience

A real two-device scan (the 3D room on a desktop, a phone's camera doing
the scanning) landed the phone on the same blank room-number form as a
stranger finding a sticker cold — correct per the decision above, but
worse UX than it needs to be: the person in the 3D room already typed
their room number once, to get into `/laundry` at all, and had to type
it a second time on the phone. Fixed by carrying that already-known room
number from the desktop session into the QR payload as a `?room=`
query parameter, read by `/laundry/scan/:id` and used only to **prefill**
the phone's identity form — never to skip it. The phone's own visitor
still has to press "Continue" themselves; nothing claims, reserves, or
sets a cookie on their device without that explicit action.

This doesn't reopen the decision above: the room number was already
visible in the 3D room (the floating label over that person's own
character, per `plans/laundry-presence.md`) and on the home page board
to begin with, so putting it in the QR payload exposes nothing a
bystander glancing at the screen couldn't already read off it directly.
The trust boundary stays exactly where it was — anyone who can see the
code can use the page it points to, prefilled or not.
