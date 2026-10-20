# Flighty — design reference for the home page redesign

Flighty is a live flight tracker; it won the 2023 Apple Design Award in
the Interaction category. It is a reference for *structure*, not looks:
the same problem as ours (waiting for a shared resource whose state
changes, and wanting to know when to move), solved with a design taken
from airport departure boards.

## Read

- Apple Design Awards 2023, Interaction winners (Flighty's entry):
  https://developer.apple.com/design/awards/2023/
- "Flighty: data visualization done right" — design analysis (states,
  departure-board layout, colour-coded status):
  https://blakecrosley.com/de/guides/design/flighty (German) /
  https://blakecrosley.com/es/guides/design/flighty (Spanish)
- App Store listing: https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008

## Images to download (not committed — `research/flighty/*.jpg` is gitignored)

These are App Store marketing screenshots: each shows real app UI inside a
promotional frame. Look at the UI inside the phone, not the frame.

```sh
cd research/flighty
curl -fsSL -o 01-my-flights.jpg      "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/19/a1/c0/19a1c0c5-7aad-7d97-50a6-2a6e583ddadf/Title_2.png/600x1300bb.jpg"
curl -fsSL -o 02-live-activities.jpg "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/89/4f/ea/894feaaf-cf38-e842-31a6-6949ce9365ef/Live_Activities.png/600x1300bb.jpg"
curl -fsSL -o 03-delay-reason.jpg    "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/e6/9a/67/e69a67ad-3ab6-1168-f736-6777aac693b2/ATC_Notices.png/600x1300bb.jpg"
curl -fsSL -o 04-friends.jpg         "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/2a/a8/be/2aa8be20-f24e-7654-37d9-86785e09dfa5/Flighty_Friends.png/600x1300bb.jpg"
curl -fsSL -o 05-wheres-my-plane.jpg "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/35/eb/4c/35eb4c72-c0ea-b820-0c93-53d1c4cd5efb/Where_U0027s_My_Plane.png/600x1300bb.jpg"
```

For a sharper copy, try `1290x2796bb.jpg` in place of `600x1300bb.jpg`.

| File | What to look at |
|---|---|
| 01-my-flights | the list: one row per flight, route, times, a small coloured status with words |
| 02-live-activities | the lock-screen status: one big time, a progress bar, almost nothing else |
| 03-delay-reason | a card that says *why* something changed, in one plain line |
| 04-friends | other people's status shown compactly beside your own |
| 05-wheres-my-plane | an upstream dependency (the inbound plane) shown as the reason for a wait |