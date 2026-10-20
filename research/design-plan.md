# Home page design plan

Crit 10 extension, Stage 12 (`plans/crit-10.md` "Extension"). Written
before any CSS changes, per `prompt.md` Stage 4.3. Reference images are
`research/flighty/*.jpg` (downloaded, gitignored — see
`research/flighty/SOURCES.md`); what to borrow vs. not is already decided
in `research/flighty/mapping.md`. This file adds the concrete plan: what
the five images actually show, our own palette/type/spacing tokens, ASCII
wireframes, and a deliberate self-review against the generic version of
this page.

## What I see in the reference

Looked at all five downloaded images directly before writing this.

**01-my-flights.jpg** (the flight list)
1. Hierarchy is strictly by information value, not by box: flight number
   and route sit in small/medium type, but "Landing in 3h 30m" is in the
   boldest, most saturated colour on the row — the one fact that answers
   "do I need to act," not the flight's identity.
2. The connecting-flight warning ("55m at JFK — Tight") is a single
   inline phrase in a status colour, not a separate card or banner. A risk
   gets a word and a colour, nothing more.
3. Three list rows share one hairline-separated column structure (airline
   icon, flight number, status word+colour, times) — no two rows look
   different from each other even though they're in different states (in
   air vs. upcoming); only the data inside each column changes.

**02-live-activities.jpg** (lock-screen status)
1. One screen, one number: "1h 20m until gate arrival" is the only large
   text on the whole lock-screen activity. Everything else (flight number,
   confirmation code, airport codes) is small and secondary.
2. A thin progress bar is the only decoration, and it's not decorative —
   it's the one other way (besides the number) of answering "how far
   along is this."
3. Status words ("On Time", "5m Early") are colour-coded but also always
   spelled out next to the colour, never a bare dot or icon alone.

**03-delay-reason.jpg** (the "why" card)
1. The headline answers "why," not "what": "Flights to JFK Grounded," not
   "Your flight is delayed." The cause is the content, not an
   afterthought below a status badge.
2. Severity is a tag ("#2 CAUSE OF DELAYS") set apart from the main
   message, in a bordered pill — a classification, kept visually distinct
   from the live, specific fact under it.
3. The explanation is one sentence of plain prose ("No flights can take
   off for the next 42m due to thunderstorms"), not a table or a list of
   fields.

**04-friends.jpg** (other people's status)
1. Other people's state is shown through the same visual language as your
   own (same card, same status colours) just smaller and off to the side
   — not a different, lesser-effort treatment.
2. Avatars double as a legend: once you know whose face is which, you
   don't need to re-read a name on every row.
3. Even in a screen that's explicitly about *other* people, your own
   flight stays visually central (the large avatar in the middle of the
   map) — the screen never actually asks you to look away from your own
   status.

**05-wheres-my-plane.jpg** (the upstream cause)
1. The dependency causing your delay (the inbound aircraft) gets its own
   mini-identity (tail number, age, nickname) before the delay number
   ever appears — the cause is established as a real, specific thing, not
   an abstract "35m late."
2. "RUNNING LATE" is a filled, high-contrast red pill — the one moment
   across all five images where a status gets a solid background instead
   of a tint, reserved for the single most urgent state.
3. The map underneath (storm cells) is never the main fact — it's
   present but visually behind the two text/numeric findings in front of
   it, there to support the claim, not to be the headline.

## Palette

Six named colours, each with one role. Checked against our own page
background (`--paper`) using the WCAG relative-luminance formula by hand;
ratios noted below. `--rule` is a hairline only, never text, so it isn't
contrast-checked against itself.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#1c1a17` | Body text, headings |
| `--paper` | `#f6f3ec` | Page background (warm, not the old pale cyan) |
| `--rule` | `#ded7c8` | Hairlines between board rows/columns |
| `--free` | `#1f6f5c` | "Free" machine, "my turn" positive confirmation after claiming |
| `--info` | `#2b5f8a` | Claimed / running (machine busy, in progress) |
| `--alert` | `#b5402a` | Your turn / unclaimed / moved back / claim countdown |

Contrast against `--paper` (`#f6f3ec`, relative luminance ≈ 0.898),
computed with the standard WCAG relative-luminance/contrast formulas
(checked with a small script, not eyeballed):

- `--ink` (`#1c1a17`): **15.67:1**
- `--free` (`#1f6f5c`): **5.44:1**
- `--info` (`#2b5f8a`): **6.10:1**
- `--alert` (`#b5402a`): **5.08:1**

All four exceed the 4.5:1 text minimum, so every state colour is usable
as text, not just as a tinted background behind black ink (the existing
`badge-*` classes' own rule, kept).

Every state — machine and reservation — gets one of these colours **and**
a word, never colour alone (the existing accessibility rule, carried
forward):

| State | Colour | Label |
|---|---|---|
| Machine: free | `--free` | "Free" |
| Machine: unclaimed (free but queued) | `--alert` | "Unclaimed" |
| Machine: running | `--info` | "Running" |
| Reservation: waiting | `--ink` (muted) | "Waiting" |
| Reservation: one person ahead | `--ink` (muted) | "Nearly your turn" |
| Reservation: your turn (front, waiting) | `--alert` | "Your turn" |
| Reservation: claimed | `--info` | "Claimed" |
| Reservation: running | `--info` | "Washing" |
| Reservation: done | `--ink` (muted) | "Done" |
| Reservation: moved back | `--alert` | "Moved back" |
| Reservation: offer (earlier machine) | `--free` | "Offer" |

## Type

One family: the existing system-ui stack (`system-ui, -apple-system,
"Segoe UI", sans-serif`) — kept rather than adding a second typeface or a
webfont fetch for a laundry queue. The departure-board feel instead comes
from `font-variant-numeric: tabular-nums` on every time/number figure (no
digit ever shifts width as it ticks), not from a different face.

Type scale (4 steps, roughly a 1.25–1.33 ratio, plus the one deliberate
outlier):

| Token | Size | Used for |
|---|---|---|
| `--text-xs` | 0.75rem (12px) | Chip labels, column headers |
| `--text-sm` | 0.875rem (14px) | Secondary text, board row meta |
| `--text-base` | 1rem (16px) | Body text |
| `--text-lg` | 1.25rem (20px) | Machine label, section heading |
| `--text-xl` | 2rem (32px) | Page `<h1>` |
| `--text-hero` | 4.5rem (72px) | My status's own remaining-time figure |

`--text-hero` is **4.5× `--text-base`** — the single largest thing on the
page by a wide margin, matching 02-live-activities.jpg's one-number
lock-screen treatment.

## Spacing

One scale, used consistently instead of ad-hoc margins:

| Token | Value | Used for |
|---|---|---|
| `--space-1` | 4px | Icon-to-text gap, badge internal padding |
| `--space-2` | 8px | Compact chip padding, inline gaps |
| `--space-3` | 12px | Board row vertical padding |
| `--space-4` | 16px | Section internal padding |
| `--space-5` | 24px | Gap between sections (status block → board) |
| `--space-6` | 32px | Page top/bottom margin on mobile |
| `--space-7` | 48px | Page side gutter and section gap on desktop (1280px) |

## Wireframes (ASCII)

**Room-number screen** (unchanged structure, restyled tokens only — not
the page this stage is about):

```
┌─────────────────────────────┐
│ Laundry Queue                │
│                               │
│ [intro paragraph, --text-base]│
│                               │
│ Enter your room number...     │
│ [input: room304____] [Continue]│
└─────────────────────────────┘
```

**The board at 390px** (one column, status block stacked above):

```
┌───────────────────────┐
│ Laundry Queue    [Switch]│
│ ⚠ connection notice (if any) │
├───────────────────────┤
│ YOUR STATUS            │
│                         │
│   12:47 ← --text-hero   │
│   left to claim         │
│   Washer 2 · your turn  │
│   [Claim (scan)]        │
├───────────────────────┤
│ WASHERS                 │
│ ──────────────────────  │
│ W1  Running   rm210 18:40│
│ W2  Your turn you   now  │
│ W3  Free      —      —  │
│ ...                      │
│ DRYERS                   │
│ ──────────────────────   │
│ D1  Free      —      —   │
│ D2  Running   rm301 19:05│
└───────────────────────┘
```

**The board at 1280px** (status beside the board, departure-board table
using the width — not one narrow centred column):

```
┌─────────────────────────────────────────────────────────────┐
│ Laundry Queue                                      [Switch]  │
├───────────────┬─────────────────────────────────────────────┤
│ YOUR STATUS    │ MACHINE   STATE      NEXT ROOM   TIME LEFT  │
│                │ ───────── ────────── ──────────  ────────── │
│   12:47        │ Washer 1  Running    room210      18:40     │
│   left to claim│ Washer 2  Your turn  you           now      │
│   Washer 2     │ Washer 3  Free       —             —        │
│   your turn    │ Washer 4  Unclaimed  room118       —        │
│   [Claim(scan)]│ ...                                          │
│                │ Dryer 1   Free       —             —        │
│                │ Dryer 2   Running    room301      19:05     │
└───────────────┴─────────────────────────────────────────────┘
```

**My reservation, every state** (same signature block, varying content —
one plain-line reason always present, matching 03-delay-reason.jpg's "why,
not what"):

```
waiting:      [ 24:10 ]  Waiting — 2 ahead of you on Washer 3.
one ahead:    [ 14:02 ]  Nearly your turn — room118 is washing now.
my turn:      [ 02:58 ]  Your turn — claim Washer 2 before this runs out.
claimed:      [  —   ]   Claimed — start the wash when you're ready.
running:      [ 18:40 ]  Washing — ends at 18:40.
done:         [  —   ]   Done — thanks for using Washer 2.
moved back:   [ 03:00 ]  You moved back one place: no claim within 3 minutes.
offer:        [ 01:47 ]  An earlier machine opened up — Dryer 1. Switch now?
```

**The turn alert** (native `<dialog>`, already built in Stage 11 — tokens
applied, not re-architected):

```
┌───────────────────────────────┐
│  Your turn — claim Washer 2    │
│  before the window runs out.   │
│                                 │
│                    [ Got it ]  │
└───────────────────────────────┘
```

**The reconnect notice** (already built in Stage 10 — tokens applied):

```
┌───────────────────────────────┐
│ ⚠ Connection lost — reconnecting…│
└───────────────────────────────┘
```

## Self-review

**What the generic version of this page would look like:** a pale
background; a stack of identical white rounded cards, each with the same
drop shadow, for every machine; a centred single column even on a wide
screen, with empty margins either side; status shown mostly through badge
colour, with the actual words small and secondary; the queue position
shown as the most prominent number on the page instead of time remaining;
decorative icons that don't track machine type; motion (fades, slides) on
every state change whether the viewer asked for it or not.

Going through the plan above line by line against that list:

- **Pale background →** changed. `--paper` is a warm off-white, not the
  old pale cyan, and it's a deliberate colour choice with a name and a
  role, not "whatever's light."
- **Identical white rounded cards with one shadow →** changed. The board
  is a table (hairline rows via `--rule`, columns, no per-row shadow or
  card radius) — Flighty's own departure-board structure, not a card
  grid. (`machine-free`/`machine-running`/`machine-unclaimed` colour
  classes stay as an additional per-row accent, not the structural unit.)
- **Centred single column on a wide screen →** changed. 1280px uses the
  width: status sits beside the board as a column, not above a narrower
  centred block with wasted margins.
- **Status shown mostly through badge colour →** not generic to begin
  with (the existing app already pairs colour with a word everywhere),
  kept and extended: every new state in the table above has both.
- **Queue position as the most prominent number →** changed. The
  remaining-time figure (`--text-hero`, 4.5× body text) is now the
  biggest thing on the page; "#N in line" stays, but secondary.
- **Decorative icons that don't track type →** not generic to begin with
  (the washer/dryer icons already differ by colour and shape from crit
  9), kept as-is.
- **Motion nobody asked for →** not planned either way; `4.4`'s build
  step adds `prefers-reduced-motion` respect explicitly as a build
  requirement, and no new animation is introduced by this redesign beyond
  the existing per-second countdown text (not a CSS transition).

Net changes from this review: warm paper background (was pale cyan),
departure-board table instead of a card grid for machine listing, the
1280px layout actually uses its width, and the remaining-time figure
becomes the page's dominant element.
