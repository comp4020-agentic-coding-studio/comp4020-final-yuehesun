import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Machine, Offer, Reservation } from "./schema.ts";
import { DRYING_TYPES } from "./drying-types.ts";
import { WASHING_TYPES } from "./washing-types.ts";
import type { DryerOption, QueueRow } from "./queue.ts";

// Crit 9 Stage 3: one row for a pending offer the viewer could accept or
// decline, joined up for display — not a QueueRow, since a pending offer
// lives on the candidate's own reservation/machine, not the idle one.
export interface OfferRow {
  offer: Offer;
  reservation: Reservation;
  machine: Machine;
}

// `html` template results can resolve async (if an interpolated value does),
// so every view function's return type needs to allow for that.
type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// --- page shell --------------------------------------------------------

// Palette: dataviz skill's reference palette (docs/adr/0003's "small,
// plain CSS" — no framework, just custom properties). Status colours are
// never used as text-on-fill (poor contrast for `warning`); they're
// accents (icon, border, badge dot) beside a text label, per plans/crit-8.md's
// accessibility rule — colour never carries meaning alone.
const STYLES = `
  :root {
    --surface: #ffffff;
    --page: #e3f4f7;
    --ink: #0b0b0b;
    --ink-muted: #52514e;
    --ink-faint: #898781;
    --border: rgba(11,11,11,0.1);
    --good: #0ca30c;
    --good-tint: #e9f7e9;
    --warning: #c98500;
    --warning-tint: #fff4de;
    --info: #2a78d6;
    --info-tint: #e8f1fb;
    --mine: #4a3aa7;
    --mine-tint: #efecfa;
    --dryer: #b5461f;
    --card-radius: 1.25rem;
  }
  * { box-sizing: border-box; }
  /* visually hidden but still read by a screen reader — used by the
     status-dot sequence, where the dots' colour/fill is a visual shortcut,
     not the only way the current step is conveyed (plans/crit-8.md: colour
     or shape is never the only cue) */
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 48rem; margin: 0 auto; padding: 1rem 1rem 3rem;
    background: var(--page); color: var(--ink);
  }
  h1 { font-size: 2.25rem; font-weight: 800; margin: 0.75rem 0 1.25rem; letter-spacing: -0.02em; }
  h1 a { color: inherit; text-decoration: none; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  a { color: var(--info); }
  /* the pale-cyan page background sits close to --info's hue, so the nav
     — which lives directly on that background, not on a white card —
     needs a darker, higher-contrast shade to actually stand out */
  .topnav { display: flex; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  .topnav a { color: #0f4c81; text-decoration: none; font-weight: 600; }

  /* buttons: the live action is loud, Cancel stays quiet (plans/crit-8.md) */
  button, .btn {
    font: inherit; border-radius: 0.5rem; padding: 0.55rem 1rem;
    border: 1px solid var(--border); cursor: pointer;
    display: inline-block; text-decoration: none;
  }
  .btn-primary { background: var(--warning); border-color: var(--warning); color: #241a00; font-weight: 700; }
  .btn-mine { background: var(--mine); border-color: var(--mine); color: white; font-weight: 700; }
  .btn-quiet { background: transparent; color: var(--ink-muted); font-size: 0.875rem; padding: 0.3rem 0.6rem; }
  button:focus-visible, a:focus-visible, input:focus-visible {
    outline: 3px solid var(--mine); outline-offset: 2px;
  }
  form { display: inline-block; margin: 0.25rem 0.4rem 0 0; }
  input[type="text"] { font: inherit; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid var(--border); }

  /* status badge: icon + text label always together, colour is never the only cue */
  .badge {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.8rem; font-weight: 600; padding: 0.15rem 0.55rem;
    border-radius: 999px; white-space: nowrap;
  }
  .badge-good { background: var(--good-tint); color: #0a5c0a; }
  .badge-info { background: var(--info-tint); color: #184f95; }
  .badge-warning { background: var(--warning-tint); color: #7a5300; }
  .badge-neutral { background: #eeede9; color: var(--ink-muted); }

  /* round numbered queue-position badge, deli-ticket style — used only
     inside a machine card's own numbered list, where the <ol> itself is
     the context for what the number means */
  .position {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.6rem; height: 1.6rem; border-radius: 50%;
    background: #eeede9; color: var(--ink); font-weight: 700; font-size: 0.8rem;
    flex: none;
  }
  .mine .position { background: var(--mine); color: white; }

  /* "#N in line" pill — the same badge pulled out on its own (only used
     in the pinned "your status" block, where every row is already yours)
     needs the words, not just a lone number, so it's one bordered pill
     instead of a bare circle sitting next to separate text. Always the
     "mine" colour, since everything in that block is the viewer's own. */
  .position-line {
    display: inline-flex; align-items: center; gap: 0.3rem;
    background: var(--mine); color: white; font-weight: 700; font-size: 0.8rem;
    border-radius: 999px; padding: 0.2rem 0.65rem;
  }

  /* time chip: clock time + relative time together; fixed = solid, estimate = dashed */
  .chip {
    display: inline-flex; flex-direction: column; align-items: flex-start;
    border-radius: 0.6rem; padding: 0.3rem 0.6rem; margin: 0.15rem 0.3rem 0.15rem 0;
    border: 1px solid var(--border); background: var(--surface);
  }
  .chip-fixed { border-style: solid; background: #f1f1ee; }
  .chip-estimate { border-style: dashed; color: var(--ink-muted); }
  .chip-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.02em; color: var(--ink-faint); }
  .chip-time { font-weight: 700; font-size: 1.05rem; line-height: 1.2; }
  .chip-relative { font-size: 0.78rem; color: var(--ink-muted); }
  .chip-compact { flex-direction: row; gap: 0.3rem; align-items: baseline; padding: 0.1rem 0.5rem; }
  .chip-compact .chip-label { font-size: 0.68rem; }
  .chip-compact .chip-time { font-size: 0.85rem; }

  /* pinned "my status" block: answers "am I up yet?" without hunting a grid */
  .my-status {
    background: var(--mine-tint); border: 1px solid var(--mine);
    border-radius: var(--card-radius); padding: 0.9rem 1rem; margin-bottom: 1.25rem;
  }
  .my-status h2 { color: var(--mine); }
  .my-status-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }

  /* status-dot sequence: one reservation's own waiting -> claimed ->
     running -> done lifecycle, which is genuinely linear (unlike queue
     *position*, which moves back one place on a missed window — that
     stays the existing "#N in line" text, never this). A filled dot with
     a check mark means done; the current step is filled but hollow-ringed
     to stand out; upcoming steps are a plain hollow ring. Colour/fill is
     a shortcut, not the only signal — each dot also has visually-hidden
     text a screen reader announces (plans/crit-8.md's accessibility rule). */
  .status-dots { display: flex; align-items: center; margin: 0.5rem 0; }
  .status-dots .dot {
    width: 1.1rem; height: 1.1rem; border-radius: 50%; flex: none;
    border: 2px solid var(--mine); display: flex; align-items: center; justify-content: center;
    font-size: 0.65rem; font-weight: 700; color: var(--mine); background: var(--surface);
  }
  .status-dots .dot-line { flex: 1; height: 2px; background: var(--border); min-width: 0.75rem; }
  .status-dots .dot-done { background: var(--mine); color: white; }
  .status-dots .dot-done + .dot-line { background: var(--mine); }
  .status-dots .dot-current { outline: 3px solid var(--mine-tint); }

  /* machine cards: single column on phone, grid on a wide screen (no JS) */
  .machines {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 1rem;
  }
  .machine {
    border: 1px solid var(--border); border-radius: var(--card-radius); padding: 1rem;
    background: var(--surface); border-left-width: 6px;
    box-shadow: 0 1px 3px rgba(11,11,11,0.06);
  }
  .machine-free { border-left-color: var(--good); }
  .machine-running { border-left-color: var(--info); }
  .machine-unclaimed { border-left-color: var(--warning); background: var(--warning-tint); }
  .machine-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
  .machine-head h2 { margin: 0; }
  .machine-icon { flex: none; color: var(--ink-muted); }

  .queue-list { list-style: none; margin: 0.5rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .queue-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .queue-row.mine { font-weight: 600; }

  .error { color: #8a1f1f; background: #fdeceb; border: 1px solid #e0a9a4; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 1rem; }

  /* crit 9: tells both sides of a move-back-one swap what happened and
     why — stays until dismissed, not a toast that fades on its own */
  .notice { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; background: var(--info-tint); color: #184f95; border-radius: 0.5rem; padding: 0.6rem 0.75rem; margin: 0.4rem 0; font-size: 0.9rem; }
  .notice form { margin: 0; }
  /* offer card: the same notice banner, but with a decision to make (two
     buttons) rather than one to acknowledge — border marks it as
     something to act on, not just read */
  .offer-card { border: 1px solid var(--mine); flex-wrap: wrap; }
  /* dryer prompt: same shape as the offer card (a decision, not just an
     acknowledgement) — crit 9 Stage 8 */
  .dryer-prompt { border: 1px solid var(--mine); flex-wrap: wrap; margin-top: 0.6rem; }

  /* the landing page's app introduction */
  .intro { line-height: 1.6; margin-bottom: 1.25rem; }
  .intro p { margin: 0.6rem 0; }
  .intro .coming-next { color: var(--ink-muted); font-size: 0.9rem; font-style: italic; }

  /* README.md, rendered in full at /readme/ */
  .prose { line-height: 1.6; }
  .prose h1 { font-size: 1.5rem; }
  .prose h2 { font-size: 1.2rem; margin-top: 1.5rem; }
  .prose h3 { font-size: 1.05rem; margin-top: 1.25rem; }
  .prose p, .prose ul, .prose ol { margin: 0.75rem 0; }
  .prose li { margin: 0.25rem 0; }
  .prose code { background: #eeede9; border-radius: 0.3rem; padding: 0.1rem 0.3rem; font-size: 0.9em; }
`;

// Crit 9: the claim-window countdown ticks client-side every second
// (plans/crit-8.md calls for "an actual countdown, not static text") —
// the server only ever sends the deadline once, in data-countdown, and
// this script is the only thing that recomputes "how long left" between
// re-fetches. It re-scans the DOM each tick rather than caching element
// references, so it keeps working after htmx/SSE swaps a card out from
// under it with no extra wiring needed on the fragment routes' side.
const COUNTDOWN_SCRIPT = `
  function tickCountdowns() {
    document.querySelectorAll("[data-countdown]").forEach(function (el) {
      var deadline = Number(el.getAttribute("data-countdown"));
      var remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      var minutes = Math.floor(remaining / 60);
      var seconds = remaining % 60;
      el.textContent = minutes + ":" + String(seconds).padStart(2, "0");
    });
  }
  setInterval(tickCountdowns, 1000);
`;

// Crit 9: one shared SSE connection per page (hx-ext="sse" sse-connect
// opens it), carrying only change signals — each listening element below
// re-fetches its own small, identity-aware fragment on its own trigger
// (plans/crit-9.md Stage 1), rather than the server pushing rendered HTML
// to every connection regardless of whose cookie it is.
function page(title: string, body: Html): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} — Laundry Queue</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <script src="https://unpkg.com/htmx-ext-sse@2.2.4/sse.js"></script>
        <style>${raw(STYLES)}</style>
      </head>
      <body hx-ext="sse" sse-connect="/events">
        <nav class="topnav">
          <a href="/">Machines</a>
          <a href="/readme/">What good means here</a>
        </nav>
        <h1><a href="/">Laundry Queue</a></h1>
        ${body}
        <script>${raw(COUNTDOWN_SCRIPT)}</script>
      </body>
    </html>`;
}

// --- small building blocks ----------------------------------------------

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" });
}

// Always shown alongside the clock time (plans/crit-8.md: both formats,
// never one or the other — people scan for different ones).
function relativeTime(ms: number, now: number): string {
  const diffMin = Math.round((ms - now) / 60_000);
  if (diffMin <= 0) return "now";
  if (diffMin === 1) return "in 1 min";
  return `in ${diffMin} min`;
}

// Crit 9 Stage 6: redrawn in the reference image's illustrated style
// (research/1.png) — a rounded machine body, two control dots and a
// display strip up top, a filled accent-colour drum instead of a plain
// outline. The reference's extra scene props (detergent bottle, basket)
// are left out: those read fine in a large standalone illustration, but
// this icon sits small, inline next to a machine number — adding more
// line work at that size would blur together rather than read clearly.
// The machine's number still sits inside the drum, like a real machine's
// number sticker, so the icon alone (shape = type, number = which one)
// is enough to tell machines apart before reading any text. Decorative
// for screen readers (the adjacent "Washer N" text is the real
// accessible name).
//
// Crit 9 Stage 8: a dryer gets its own drum colour (orange, not the
// washer's purple) *and* its own top-left detail — vent slits instead of
// a flat display strip — so the two types read apart by shape, not colour
// alone (plans/crit-8.md's rule: colour is never the only cue).
function machineIcon(number: number, type: Machine["type"]): Html {
  const isDryer = type === "dryer";
  const drumFill = isDryer ? "var(--dryer)" : "var(--mine)";
  const topDetail = isDryer
    ? `<path d="M6 4.3h1.8M9.1 4.3h1.8M12.2 4.3h1.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`
    : `<rect x="6" y="4.3" width="7" height="1.6" rx="0.8" stroke="currentColor" stroke-width="1.1"/>`;
  return raw(
    `<svg class="machine-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2" width="19" height="20" rx="3" stroke="currentColor" stroke-width="1.4"/>
      ${topDetail}
      <circle cx="16.3" cy="5.1" r="0.9" stroke="currentColor" stroke-width="1.1"/>
      <circle cx="19" cy="5.1" r="0.9" stroke="currentColor" stroke-width="1.1"/>
      <circle cx="12" cy="14.5" r="6.8" stroke="currentColor" stroke-width="1.4"/>
      <circle cx="12" cy="14.5" r="5.4" fill="${drumFill}" stroke="currentColor" stroke-width="1"/>
      <text x="12" y="15" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" stroke="none" fill="white">${number}</text>
    </svg>`,
  );
}

function badge(kind: "good" | "info" | "warning" | "neutral", icon: string, label: string): Html {
  return html`<span class="badge badge-${kind}"><span aria-hidden="true">${icon}</span> ${label}</span>`;
}

// One status vocabulary, used everywhere a reservation or a machine shows
// up (plans/crit-8.md's status colours: good/info/warning, text label
// always present, colour never the only cue).
function rowBadge(row: QueueRow, forOwner: boolean): Html {
  if (row.status === "running") return badge("info", "↻", "Running");
  if (row.status === "claimed") return badge("info", "✓", "Claimed");
  if (row.position === 1) return badge("warning", "⚠", forOwner ? "Your turn" : "Unclaimed");
  return badge("neutral", "…", "Waiting");
}

function positionBadge(n: number): Html {
  return html`<span class="position">${n}</span>`;
}

// Bare `positionBadge` reads fine inside the machine card's numbered
// queue list (reservationLine), where the <ol> itself is the context —
// but pulled out on its own, in the pinned "your status" block or the
// home page's own row for your reservation, a lone number has nothing
// around it saying what it counts. One pill with "#N in line" replaces
// the circle entirely here, rather than sitting a text label next to it —
// a circled "1" and "#1 in line" are the same fact said twice.
function positionLine(n: number): Html {
  return html`<span class="position-line">#${n} in line</span>`;
}

// mm:ss form for the one chip that actually ticks (the claim window) —
// plans/crit-8.md calls for "an actual countdown, not static text", and a
// deadline a few minutes out reads better to the second than "in 3 min".
function countdownText(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function timeChip(label: string, ms: number, now: number, fixed: boolean, compact = false, countdown = false): Html {
  const relative = countdown
    ? html`<span class="chip-relative" data-countdown="${ms}">${countdownText(ms - now)}</span>`
    : html`<span class="chip-relative">${relativeTime(ms, now)}</span>`;
  return html`<div class="chip ${fixed ? "chip-fixed" : "chip-estimate"} ${compact ? "chip-compact" : ""}">
    <span class="chip-label">${label}</span>
    <span class="chip-time">${clockTime(ms)}</span>
    ${relative}
  </div>`;
}

// The one chip relevant to a given row: a countdown while it's unclaimed
// and free, a finish time while running, or an estimated/fixed ready time
// otherwise. The claim deadline also ticks client-side every second (see
// the page shell's script) — plans/crit-8.md calls for an actual
// countdown, not text that only updates when the card gets re-fetched.
// The label itself says "Est." while unfixed, not just the chip's
// dashed-vs-solid border — README.md argues uncertainty should be marked,
// not just rendered subtly enough to miss (plans/crit-8.md's "estimated
// vs. fixed" distinction is meant to be visible before you even read the
// label, but it still needs the label to actually say so).
//
// Two labels deliberately avoid words the app uses for something else:
// "Ready at" (not "Starts") is when the machine is yours to claim — not
// when you actually start the wash, which is a separate tap after
// claiming; "Ready" was picked over the earlier "Turn at" for being the
// plainer, more everyday word, while still not colliding with "start."
// "Finish at" (not "Free at") is when the current wash ends — "Free" is
// the app's own word for a machine nobody's queued for, and a finished
// machine with someone waiting goes to "unclaimed," not free.
function rowTimeChip(row: QueueRow, now: number, compact = false): Html {
  if (row.status === "claimed") return raw("");
  if (row.status === "running") return timeChip("Finish at", row.endMs, now, true, compact);
  if (row.claimDeadlineMs != null) return timeChip("Claim by", row.claimDeadlineMs, now, false, compact, true);
  return timeChip(row.fixed ? "Ready at" : "Est. ready at", row.scheduledStartMs, now, row.fixed, compact);
}

// Crit 9 (plans/crit-9.md Stage 6): a reservation's own lifecycle really
// is linear — waiting, then claimed, then running, then done — unlike
// queue *position*, which the move-back-one rule can send backward (that
// stays the existing "#N in line" text, never a step sequence). Dots
// aren't shown for cancelled/missed, since those exit the sequence
// sideways rather than completing it; the plain text badge already
// covers that case.
const STATUS_STEPS = [
  { key: "waiting", label: "Waiting" },
  { key: "claimed", label: "Claimed" },
  { key: "running", label: "Washing" },
  { key: "done", label: "Done" },
] as const;

function statusDots(status: QueueRow["status"]): Html {
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === status);
  if (stepIndex === -1) return raw(""); // cancelled/missed: no sequence to show

  return html`<div class="status-dots" role="list" aria-label="Reservation progress">
    ${STATUS_STEPS.map((step, i) => {
      const done = i < stepIndex;
      const current = i === stepIndex;
      const dot = html`<span
        class="dot ${done ? "dot-done" : ""} ${current ? "dot-current" : ""}"
        role="listitem"
      >
        <span aria-hidden="true">${done ? "✓" : ""}</span>
        <span class="sr-only">${step.label}${done ? " (done)" : current ? " (current step)" : ""}</span>
      </span>`;
      const line = i < STATUS_STEPS.length - 1 ? html`<span class="dot-line" aria-hidden="true"></span>` : raw("");
      return html`${dot}${line}`;
    })}
  </div>`;
}

// Crit 9 (plans/crit-9.md Stage 2): a silent swap is worse than crit 8's
// blunt "ejected outright" rule — at least that was visible. Both sides
// of a move-back-one swap get told here, plainly and without blame on the
// person who moved back, with a "Got it" that clears it on confirmed
// read rather than fading on a timer.
function noticeBanner(row: QueueRow): Html {
  if (row.notice == null) return raw("");
  const text =
    row.notice === "moved_back"
      ? "Your claim window passed, so you moved back one place."
      : "The person ahead of you missed their window — it's your turn now.";
  return html`<div class="notice">
    <span>${text}</span>
    <form method="post" action="/reservations/${row.reservationId}/dismiss-notice">
      <button class="btn-quiet" type="submit">Got it</button>
    </form>
  </div>`;
}

function washingTypeOptions(): Html {
  return html`${Object.entries(WASHING_TYPES).map(
    ([value, type]) => html`<option value="${value}">${type.label} (${type.minutes} min)</option>`,
  )}`;
}

// Crit 9 (plans/crit-9.md Stage 8): a dryer's reservation form offers
// DRYING_TYPES instead — the same reason the server-side route checks the
// machine's own type rather than trusting whatever the form sends.
function dryingTypeOptions(): Html {
  return html`${Object.entries(DRYING_TYPES).map(
    ([value, type]) => html`<option value="${value}">${type.label} (${type.minutes} min)</option>`,
  )}`;
}

// "End the wash" uses a plain onsubmit confirm rather than converting
// this one form to an htmx-handled request (hx-confirm only intercepts
// htmx-issued requests) — every action here is a normal form POST with a
// 303 redirect, and ending a running wash early should submit the same
// way as every other action, just with a confirmation step first since
// it's irreversible and not necessarily the machine's owner clicking it
// by mistake (plans/crit-9.md Stage 1.5).
function actionButtons(row: QueueRow): Html {
  return html`${row.status === "waiting" && row.position === 1
      ? html`<form method="post" action="/reservations/${row.reservationId}/claim"><button class="btn-primary" type="submit">Claim (scan)</button></form>`
      : raw("")}
    ${row.status === "claimed"
      ? html`<form method="post" action="/reservations/${row.reservationId}/start"><button class="btn-primary" type="submit">Start the wash</button></form>`
      : raw("")}
    ${row.status === "waiting" || row.status === "claimed"
      ? html`<form method="post" action="/reservations/${row.reservationId}/cancel"><button class="btn-quiet" type="submit">Cancel</button></form>`
      : raw("")}
    ${row.status === "running"
      ? html`<form
          method="post"
          action="/reservations/${row.reservationId}/finish"
          onsubmit="return confirm('End this wash now? This can\\'t be undone.')"
        ><button class="btn-quiet" type="submit">End the wash</button></form>`
      : raw("")}`;
}

// --- pages ---------------------------------------------------------------

export function identityPage(): Html {
  return page(
    "Room number",
    html`<div class="intro">
      <p>A shared queue for a laundry room's washers and dryers. When a
      whole residence shares one laundry room, it's always packed on
      weekends. People often carry their clothes downstairs only to find
      no free machine; they want to go back up but worry someone else will
      take the machine when it frees up, so they end up wasting time
      waiting in the laundry room. This app helps you reserve and queue
      for laundry online, reminds you of your upcoming reservation, and
      helps you find a freed-up machine as fast as possible. It's
      automated from start to finish, making sharing with strangers easy
      and keeping communication and waiting costs as low as possible.</p>

      <p class="coming-next">Reminders, finding a freed-up machine faster,
      and live updates aren't built yet — coming next.</p>
    </div>
      <p>Enter your room number — that's how the queue tells you apart. Just
      the number is fine (e.g. <strong>304</strong>). No account, nothing
      else is stored, no name.</p>
      <form method="post" action="/identity">
        <input type="text" name="room" placeholder="e.g. 304 or room304" inputmode="numeric" required maxlength="12" />
        <button class="btn-primary" type="submit">Continue</button>
      </form>`,
  );
}

function reservationLine(row: QueueRow, identity: string, now: number): Html {
  const mine = row.person === identity;
  return html`<li class="queue-row ${mine ? "mine" : ""}">
    ${positionBadge(row.position)}
    <span>${mine ? "you" : row.person}</span>
    ${rowBadge(row, mine)}
    ${rowTimeChip(row, now, true)}
  </li>`;
}

// The whole card is swapped as one unit (hx-swap="outerHTML") on its own
// machine's SSE event, since the state class (free/unclaimed/running)
// changes along with the content — the fetched replacement carries the
// same id/trigger, so it keeps listening after every swap.
export function machineCard(machine: Machine, rows: QueueRow[], identity: string, now: number): Html {
  const mine = rows.find((r) => r.person === identity);
  const front = rows[0];
  const stateClass = !front ? "machine-free" : front.status === "waiting" ? "machine-unclaimed" : "machine-running";

  return html`<div
    class="machine ${stateClass}"
    id="machine-${machine.id}"
    hx-trigger="sse:machine-${machine.id}"
    hx-get="/machines/${machine.id}/card"
    hx-swap="outerHTML"
  >
    <div class="machine-head">
      ${machineIcon(machine.id, machine.type)}
      <h2>${machine.label}</h2>
      ${!front ? badge("good", "✓", "Free") : raw("")}
    </div>
    ${rows.length === 0
      ? raw("")
      : html`<ol class="queue-list">
          ${rows.map((r) => reservationLine(r, identity, now))}
        </ol>`}
    ${mine
      ? html`<p>${actionButtons(mine)}</p>`
      : html`<form method="post" action="/machines/${machine.id}/reservations">
          <select name="washingType">${machine.type === "dryer" ? dryingTypeOptions() : washingTypeOptions()}</select>
          <button class="btn-primary" type="submit">Reserve</button>
        </form>`}
  </div>`;
}

// Crit 9 (plans/crit-9.md Stage 3): "earlier machine" offer — accept
// vacates the original reservation and claims the new machine directly;
// decline leaves the original place untouched and hands it to the next
// eligible person on the next tick. The countdown reuses the same
// client-side ticking chip as a claim window, just against respondBy.
function offerCard(row: OfferRow, now: number): Html {
  return html`<div class="notice offer-card">
    <div>
      <span>An earlier machine opened up: <strong>${row.machine.label}</strong>.</span>
      ${timeChip("Respond by", row.offer.respondBy, now, false, true, true)}
    </div>
    <div>
      <form method="post" action="/offers/${row.offer.id}/accept" style="display:inline">
        <button class="btn-primary" type="submit">Switch now</button>
      </form>
      <form method="post" action="/offers/${row.offer.id}/decline" style="display:inline">
        <button class="btn-quiet" type="submit">Stay put</button>
      </form>
    </div>
  </div>`;
}

// Crit 9 (plans/crit-9.md Stage 8): offered, not automatic, same
// reasoning as the earlier-machine offer — only the resident knows
// whether holding a dryer slot is worth it. The claim window on the
// resulting reservation doesn't start until this wash is done, so
// there's no rush here the way there is with an offer's own countdown.
function dryerPromptCard(washReservationId: number, suggestion: DryerOption): Html {
  return html`<div class="notice dryer-prompt">
    <span>Want to queue <strong>${suggestion.label}</strong> for after this wash? It'll be ready when you are — the countdown doesn't start until your wash is done.</span>
    <div>
      <form method="post" action="/reservations/${washReservationId}/queue-dryer" style="display:inline">
        <select name="dryingType">${dryingTypeOptions()}</select>
        <button class="btn-primary" type="submit">Queue it</button>
      </form>
      <form method="post" action="/reservations/${washReservationId}/dismiss-dryer-prompt" style="display:inline">
        <button class="btn-quiet" type="submit">No thanks</button>
      </form>
    </div>
  </div>`;
}

export function myStatusBlock(
  mine: { machine: Machine; row: QueueRow; dryerSuggestion?: DryerOption }[],
  myOffers: OfferRow[],
  now: number,
): Html {
  if (mine.length === 0 && myOffers.length === 0) return raw("");
  return html`<div class="my-status">
    <h2>Your status</h2>
    ${myOffers.map((o) => offerCard(o, now))}
    ${mine.map(
      ({ machine, row, dryerSuggestion }) => html`<div class="my-status-row-wrap">
        ${noticeBanner(row)}
        ${statusDots(row.status)}
        <div class="my-status-row">
          ${machineIcon(machine.id, machine.type)}
          <strong>${machine.label}</strong>
          ${positionLine(row.position)}
          ${rowBadge(row, true)}
          ${rowTimeChip(row, now)}
          ${actionButtons(row)}
        </div>
        ${dryerSuggestion ? dryerPromptCard(row.reservationId, dryerSuggestion) : raw("")}
      </div>`,
    )}
  </div>`;
}

export function homePage(
  identity: string,
  machines: Machine[],
  rowsByMachine: Map<number, QueueRow[]>,
  myOffers: OfferRow[],
  now: number,
  getDryerSuggestion: (reservationId: number) => DryerOption | undefined,
): Html {
  const mine = machines.flatMap((m) => {
    const row = (rowsByMachine.get(m.id) ?? []).find((r) => r.person === identity);
    return row ? [{ machine: m, row, dryerSuggestion: getDryerSuggestion(row.reservationId) }] : [];
  });

  return page(
    "Machines",
    html`<p>Signed in as <strong>${identity}</strong>.
      <form method="post" action="/identity/clear" style="display:inline">
        <button class="btn-quiet" type="submit">Switch room</button>
      </form></p>
      <div id="my-status-wrapper" hx-trigger="sse:changed" hx-get="/my-status" hx-swap="innerHTML">
        ${myStatusBlock(mine, myOffers, now)}
      </div>
      <div class="machines">${machines.map((m) => machineCard(m, rowsByMachine.get(m.id) ?? [], identity, now))}</div>`,
  );
}

export function errorPage(message: string, status: number): Html {
  return page("Error", html`<p class="error">${message} (${status})</p><p><a href="/">← All machines</a></p>`);
}

// README.md, rendered to HTML (src/readme.ts) and published in full here —
// `raw` because marked already escaped/produced the HTML, not user input.
export function readmePage(renderedHtml: string): Html {
  return page("README", html`<div class="prose">${raw(renderedHtml)}</div>`);
}
