# 0009: Turn alerts are in-page, not push notifications

## Status

Accepted.

## Context

`README.md` argues from calm technology (Weiser and Brown): once you've
reserved, the queue watches the room for you and only pulls you back at
two moments — one person ahead of you, and your turn. Today the page
updates live, but nothing marks those two moments: you only notice if you
happen to be looking.

## Options considered

1. **Web Push** (service worker, VAPID keys, a push library). Reaches a
   phone with the page closed, which is the strongest version of the calm
   technology claim. But on an iPhone it only works once the site is added
   to the home screen, it needs a permission prompt before it can do
   anything, and it adds a service worker and a dependency to an app that
   otherwise has neither.
2. **Email or SMS.** Needs an address or number per resident, which the
   app has deliberately never stored (ADR 0002/0004: a room number and
   nothing else).
3. **In-page alert.** When your own status reaches either moment, a dialog
   opens with one sentence and one button, and the tab title changes so a
   background tab shows it too. Needs nothing new and stores nothing.

## Decision

Option 3. Each alert fires once per transition: dismissing it is
remembered for that reservation and moment, so a reload or a live refresh
doesn't bring it back. No sound and no vibration, and nothing about other
people's changes.

## Consequences

- The two moments README promises are now visible on the page.
- They only reach you while the page is open, in a tab or on a phone
  screen that's awake. With the phone locked, you see the alert when you
  next look. README has to say this plainly; it is the gap between the
  calm technology claim and what the app does.
- Web Push stays the documented next step if the app ever needs to reach
  a closed page.