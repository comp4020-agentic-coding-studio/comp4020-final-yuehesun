# UI references for the crit 9 visual design pass (Stage 6)

Collected ahead of the redesign, per the user's request. Each entry says
what was actually verified vs. taken on the user's own description (some
sources — the UMN housing page, the Instagram post — couldn't be fetched
directly; see notes).

## Laundry/appliance status displays

**openHAB community washing machine widget**
(https://community.openhab.org/t/washing-machine-status-widget/116621) —
fetched and verified directly.
- Three states: off (grey icon, no animation), running (spinning drum
  icon + elapsed-time label), finished (the drum icon itself changes
  shape — a "partially filled circle" — not just a color change).
- Colour carries *type*, not status: light blue = washer, orange = dryer,
  consistently across the icon and its spinner.
- Shows elapsed time while running, not remaining — a deliberate choice
  the thread's own follow-up comments pushed back on (users adapting it
  for smart appliances wanted remaining time instead).

**CSC GO (the real app CSC ServiceWorks laundry rooms use)** — verified
via official app-store/marketing pages
(https://mwm.ai/apps/csc-go/1552572916,
https://www.getcscgo.com/, https://marketingpro.cscsw.com/csc-go-app/);
the user's own UMN housing page link 403'd and couldn't be fetched
directly, so nothing from that specific page is asserted here.
- Scan a QR code or NFC tag on the machine to open its page directly —
  this app's `/machines/:id/card`-style flow already does the software
  side of this (scanning in real life isn't implemented, same as crit
  8's "click to simulate a scan").
- A laundry-room overview screen shows real-time availability across all
  machines before you commit to one.
- Finish notifications are a core advertised feature.

**LaundryView / student-reported campus laundry apps** (user-supplied
summary, not independently re-verified against a primary source) —
colour-coded states: white/idle, red/in-use, pale-yellow/done-but-
uncollected, grey/broken. MIT's version reportedly removed the done-but-
uncollected state after users found it confusing, and flagged that icons
alone (without text) risk being misread — both read as direct precedent
for this app's existing "colour never carries meaning alone, always
paired with a text label" rule (plans/crit-8.md).

## Queueing / virtual-queue interfaces (user-supplied summary)

- A good queue screen needs three things: your position, an estimated
  wait, and a clear alert when it's your turn.
- Appointedd's queue page shows position, a ticket number, a join→wait→
  your-turn timeline, and both a "defer my turn" and a "leave the queue"
  button — "defer" is close to this app's own move-back-one escalation.
- vQueue notifies at "almost your turn," "called," and "missed," with a
  grace period to reclaim a missed slot — maps directly onto this app's
  claim window.
- Qwaiting's big-screen display recommends high-contrast colour, a
  distinct colour for the number currently being called, and a different
  background for "waiting" vs. "missed" rows.

## Visual style reference (user-supplied, not independently re-verified)

An Instagram post (private/unreachable by the agent directly) described
by the user as: a pale cyan colour scheme, white rounded cards, a row of
step dots across the top (filled for completed steps, hollow for
upcoming ones), one large status heading with a short supporting line of
text below it, and a single primary button per screen.
