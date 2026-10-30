# QR-code-to-claim interaction patterns on the real web

How real systems let someone scan a physical code and immediately perform an
identified action, with no login step — and what that implies for adapting
our existing `roomXXX` cookie flow to an on-site scan.

## Restaurant table ordering (closest real-world analogue)

- **Core pattern**: the QR code encodes the table's identity directly in the
  URL. Scanning opens the menu in the phone's own browser; no app download,
  no account. The "sign-in" *is* the act of scanning the table.
  ([UpMenu](https://www.upmenu.com/software-for-restaurants/table-ordering/),
  [iamenu.ai](https://www.iamenu.ai/en/blog/pedidos-qr-mesa-self-ordering-restaurante))
- **Session identity without login — "table session"**: orders from every
  phone that scanned the same table's code are linked to one shared session,
  the same way our reservations are linked to one `roomXXX`. Two phones
  scanning one table produce one shared tab, not two to reconcile later.
  (Some systems instead give each diner their own cart; both patterns exist.)
- **Two naming schemes**, directly analogous to a decision we'd face:
  - *one code per table* — the kitchen knows which table without asking
    (→ our analogue: one QR per machine, pre-printed, machine ID baked in).
  - *one code for the whole room*, asking the guest to additionally type
    their table number — simpler printing, one extra step for the guest
    (→ our analogue: one generic "scan to open the queue" code, machine
    picked afterward — strictly worse for us since the whole point is
    "scan *this* machine").
  Our existing design already implies the first scheme (`README.md`'s user
  story: "scan a machine's code on site — which opens that machine's
  reservation directly").
- **Security failure mode documented in the wild**: a malicious sticker
  swapped over a real table's QR code needs no system access at all — the
  platform has no way to detect that the code scanned no longer matches the
  table printed on it, since the fraudulent code is a perfectly valid code
  that just points elsewhere. The FBI has public guidance telling people to
  check the resolved URL before trusting a scanned link.
  ([NBC New York coverage](https://www.nbcnewyork.com/news/local/crime-and-courts/parking-scan-scam-suspect-posted-qr-codes-meters-steal-credit-card-info/6554537/))
  **Relevant to us**: a QR taped to machine 3 that actually links to machine
  3's claim route is exactly this same trust model — nothing more, nothing
  less secure than what restaurants already ship at scale. Worth naming in
  the demo narrative (the app can't detect a swapped sticker) rather than
  treating it as a gap unique to our design.
- **A hardened variant exists** (one GitHub PR example): don't trust the QR
  alone to create a session — require typing a short code additionally
  displayed on-site before the claim action is allowed, closing the
  "sticker swap from across the room, no physical presence required" gap.
  This is a real design option for us: the QR opens the claim page, but the
  server could still require the person be looking at a short code shown
  only on that physical machine's screen/label at the moment of scanning —
  though this adds a second physical artifact to maintain, and for a
  resident-trust-based system (ADR 0002's whole argument: "the app relies on
  the same thing a real dorm does: people mostly don't bother lying to their
  own neighbours") this is probably over-engineering relative to the actual
  threat model of a laundry room.
  ([GitHub PR #44, aryanp685/new](https://github.com/aryanp685/new/pull/44))

## E-scooter/bike-share unlock

- **Standard flow**: scan the vehicle's QR → app sends unlock request to the
  server → server authenticates and pushes an unlock command to the vehicle
  (via BLE proxy or direct LTE) → vehicle unlocks, ride timer starts.
  ([techinterview.org system-design summary](https://www.techinterview.org/post/3233475395/mobile-system-design-bike-share-scooter-rental/))
- This pattern assumes a pre-existing authenticated app account (payment is
  already on file) — **not directly applicable** to us, since our whole
  design intentionally has no accounts. The part that *does* transfer: the
  "scan → identify the physical object → server-side authorize → change its
  state" shape is the same shape our `claim` action already has; we're just
  skipping the "pre-authenticated app" layer because `roomXXX` plays that
  role already (a bare cookie, not a payment-backed account).
- **Security lesson from a real pentest**: one researcher found no rate
  limiting on login, turning a single known identity into a guessable
  session, and could remotely unlock a scooter with nobody scanning anything
  — a reminder that *whatever* identifies the claimant server-side has to be
  checked server-side on every action, not just at scan time. We already do
  this (`loadOwned`/`loadOwnedOffer` check on every request) — nothing new
  needed here, just confirms our existing authorization model is the right
  shape to keep.
  ([henriemategui.com writeup](https://henriemategui.com/post/remotely-unlocking-electric-scooters))

## Parking-meter QR payment

- **Session tied to a real-world identifier instead of an account**:
  several commercial systems (Parkify, GetMyParking) ask for the **license
  plate number** at scan time rather than requiring login — payment
  completes in under 30 seconds with nothing stored beyond that plate number
  for the session. This is structurally identical to what we already do
  with `roomXXX`: a self-declared, unverified real-world identifier used
  once per session, no account.
  ([Parkify](https://national-parking.com/parkify/features/scan-to-pay/))
- One system keeps the session alive after scanning via **three different
  token mechanisms** (30-day cookie, Apple Wallet pass, emailed/texted
  link) — more persistence options than we need, but it confirms "a cookie
  tied to a scanned session, no login" is an established, trusted-enough
  pattern for a paid, security-sensitive use case (parking enforcement).
  This is reassuring context for our much lower-stakes case (claiming a
  washing machine).
- **Scam pattern, same shape as the restaurant one**: fake stickers placed
  over real meters, redirecting to a fraudulent payment page; NYC's actual
  guidance is that its real meters don't use QR at all, specifically because
  of this risk.
  ([scanlikely.com](https://scanlikely.com/parking-meter-qr-code-scam))

## What this means for adapting our existing `roomXXX` flow

Our existing identity model (ADR 0002 → ADR 0004) already matches the shape
every one of these real systems converged on independently: **a
self-declared, unverified, real-world identifier, remembered for the
session, no account** — restaurants use the table, scooters use a paid
account token, parking uses a license plate, we use a room number. None of
the researched systems needed to invent a *new* identity mechanism to
support QR-triggered actions; they all reused whatever identity concept the
product already had.

Concretely, for the on-site scan flow:

1. **Each machine gets its own QR code**, encoding a URL like
   `/machines/:id/claim` (or similar) — not a generic "open the app" link.
   This matches the "one code per table" pattern and is what our own
   `README.md` user story already describes ("scan a machine's code on
   site").
2. **If the scanning browser already has a `person` cookie** (the resident
   already typed `roomXXX` once, on their phone, before walking down) — the
   scan goes straight to that machine's claim/reservation view, no extra
   step. This is the "shared session, no re-entry" pattern restaurants and
   parking both use.
3. **If there's no cookie yet** (first visit on that phone, or cookies
   cleared) — land on the *existing* room-number entry page (not a new
   "login page" — Bill's suggested wording, but the thing that actually
   satisfies it without violating ADR 0004 is our pre-existing identity
   form), then continue to the claim action afterward. This is exactly the
   restaurant pattern's "simpler printing, one extra guest step" variant,
   but only on a cold device, not every time.
4. **No new failure modes beyond what the existing app already handles**:
   "two people scan the same already-claimed machine" is already handled by
   `queue.ts`'s existing ownership/queue logic (whoever's not at the front
   of that machine's queue gets redirected to view-only status, same as the
   existing "scan a machine that's already reserved" case in `README.md`'s
   user story) — the QR path doesn't need new concurrency handling, it's a
   new *entry point* into logic that already exists.
5. **The sticker-swap risk is real but matches the restaurant industry's
   own accepted risk level** — worth one sentence in the eventual ADR, not a
   new security feature, consistent with ADR 0002's existing "judged, not
   enforced" stance on identity trust.
