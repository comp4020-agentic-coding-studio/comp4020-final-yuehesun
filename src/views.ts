import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Machine, Offer, Reservation } from "./schema.ts";
import { DRYING_TYPES } from "./drying-types.ts";
import { WASHING_TYPES } from "./washing-types.ts";
import type { DryerOption, QueueRow } from "./queue.ts";
import type { SimulationResults } from "../scripts/simulate.ts";
import { BOARD_STATE_CLASS, boardStateFor, boardStateLabel, boardTimeLeftSeconds } from "./board-state.ts";

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

// Crit 10 extension, Stage 12 (plans/crit-10.md "Extension";
// research/design-plan.md): every colour, type size and space used below
// is one of the tokens that plan names — nothing ad-hoc. Palette is 6
// named colours with one role each; state colours are always paired with
// a text label in the markup (plans/crit-8.md's rule: colour never
// carries meaning alone). The old pale-cyan "--page" background, the
// identical-white-rounded-card machine grid, and the single centred
// column at any width are the three things research/design-plan.md's own
// self-review flagged as the generic version of this page — all three
// are gone below, replaced by a departure-board layout (research/flighty/
// mapping.md), a warm paper background, and a 1280px layout that puts the
// status block beside the board instead of above a narrower column.
const STYLES = `
  :root {
    /* palette (research/design-plan.md "Palette") */
    --ink: #1c1a17;
    --ink-muted: #6b6358;
    --paper: #f6f3ec;
    --surface: #ffffff;
    --rule: #ded7c8;
    --free: #1f6f5c;
    --free-tint: #e3efe9;
    --info: #2b5f8a;
    --info-tint: #e5edf3;
    --alert: #b5402a;
    --alert-tint: #f5e6e1;
    --dryer: #b5461f;

    /* type scale (research/design-plan.md "Type") */
    --text-xs: 0.75rem;
    --text-sm: 0.875rem;
    --text-base: 1rem;
    --text-lg: 1.25rem;
    --text-xl: 2rem;
    --text-hero: 4.5rem;

    /* spacing scale (research/design-plan.md "Spacing") */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --space-6: 2rem;
    --space-7: 3rem;

    --card-radius: 1rem;
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
    max-width: 72rem; margin: 0 auto; padding: var(--space-4) var(--space-4) var(--space-7);
    background: var(--paper); color: var(--ink); font-size: var(--text-base);
  }
  h1 { font-size: var(--text-xl); font-weight: 800; margin: var(--space-3) 0 var(--space-5); letter-spacing: -0.02em; }
  h1 a { color: inherit; text-decoration: none; }
  h2 { font-size: var(--text-base); margin: 0 0 var(--space-2); }
  a { color: var(--info); }
  .topnav { display: flex; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--rule); font-size: var(--text-sm); }
  .topnav a { color: var(--info); text-decoration: none; font-weight: 600; }

  /* buttons: the live action is loud, Cancel stays quiet (plans/crit-8.md) */
  button, .btn {
    font: inherit; border-radius: 0.5rem; padding: 0.55rem 1rem;
    border: 1px solid var(--rule); cursor: pointer;
    display: inline-block; text-decoration: none;
  }
  .btn-primary { background: var(--alert); border-color: var(--alert); color: white; font-weight: 700; }
  .btn-quiet { background: transparent; color: var(--ink-muted); font-size: var(--text-sm); padding: 0.3rem 0.6rem; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible {
    outline: 3px solid var(--info); outline-offset: 2px;
  }
  form { display: inline-block; margin: 0.25rem 0.4rem 0 0; }
  input[type="text"], select { font: inherit; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid var(--rule); background: var(--surface); color: var(--ink); }

  /* tabular figures everywhere a time or countdown appears, so digits
     never shift width as they tick (research/design-plan.md "Type") */
  .num { font-variant-numeric: tabular-nums; }

  /* state word + colour, always together (plans/crit-8.md: colour never
     the only cue) — used for both a machine's board state and a
     reservation's own status word in the status block. */
  .state-word { font-weight: 700; }
  .state-free { color: var(--free); }
  .state-unclaimed, .state-alert { color: var(--alert); }
  .state-running, .state-claimed { color: var(--info); }
  .state-muted { color: var(--ink-muted); font-weight: 600; }

  /* "#N in line" — present but secondary (research/design-plan.md's
     self-review: queue position is no longer the page's dominant figure,
     remaining time is). */
  .position-line { font-weight: 600; color: var(--ink-muted); font-size: var(--text-sm); }

  /* status-dot sequence: one reservation's own waiting -> claimed ->
     running -> done lifecycle, which is genuinely linear (unlike queue
     *position*, which moves back one place on a missed window — that
     stays the "#N in line" text, never this). Small and muted here —
     secondary to the hero figure and reason line, not competing with
     them. Colour/fill is a shortcut, not the only signal — each dot also
     has visually-hidden text a screen reader announces. */
  .status-dots { display: flex; align-items: center; margin: var(--space-2) 0; }
  .status-dots .dot {
    width: 0.9rem; height: 0.9rem; border-radius: 50%; flex: none;
    border: 2px solid var(--ink-muted); display: flex; align-items: center; justify-content: center;
    font-size: 0.6rem; font-weight: 700; color: var(--ink-muted); background: var(--surface);
  }
  .status-dots .dot-line { flex: 1; height: 2px; background: var(--rule); min-width: 0.6rem; }
  .status-dots .dot-done { background: var(--info); border-color: var(--info); color: white; }
  .status-dots .dot-done + .dot-line { background: var(--info); }
  .status-dots .dot-current { border-color: var(--info); color: var(--info); outline: 3px solid var(--info-tint); }

  /* --- the signature element: my own status --- */
  .status-hero {
    background: var(--surface); border: 1px solid var(--rule);
    border-radius: var(--card-radius); padding: var(--space-5) var(--space-4);
    margin-bottom: var(--space-5);
  }
  .status-hero + .status-hero { margin-top: var(--space-4); }
  .hero-label { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; margin: 0 0 var(--space-1); }
  .hero-figure {
    font-size: var(--text-hero); font-weight: 800; line-height: 1; letter-spacing: -0.02em;
    margin: 0 0 var(--space-3);
  }
  .hero-figure-static { font-size: var(--text-xl); color: var(--ink-muted); }
  .hero-meta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--text-lg); margin: 0 0 var(--space-2); }
  .hero-meta .machine-icon { width: 1.5rem; height: 1.5rem; }
  .hero-reason { font-size: var(--text-base); margin: 0 0 var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .hero-reason form { margin: 0; }
  .hero-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

  /* --- the board: one row per machine, departure-board style --- */
  .board-section { margin-bottom: var(--space-6); }
  .board-section h2 { font-size: var(--text-lg); color: var(--ink); margin-bottom: var(--space-3); }
  .board { border-top: 1px solid var(--rule); }
  .board-row {
    display: grid; grid-template-columns: 2fr 1.3fr 1.3fr 1.3fr;
    gap: var(--space-3); align-items: center;
    padding: var(--space-3) 0; border-bottom: 1px solid var(--rule);
  }
  .board-head { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 700; }
  .board-row-mine { background: rgba(28,26,23,0.035); margin: 0 calc(-1 * var(--space-3)); padding-left: var(--space-3); padding-right: var(--space-3); border-radius: 0.5rem; }
  .board-cell-machine { display: flex; align-items: center; gap: var(--space-2); font-weight: 600; }
  .board-cell-machine .machine-icon { flex: none; }
  .board-label { display: none; }
  .board-reserve { grid-column: 1 / -1; display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
  .board-reserve form { margin: 0; display: flex; gap: var(--space-2); }
  @media (max-width: 640px) {
    .board-head { display: none; }
    .board-row { grid-template-columns: 1fr; gap: var(--space-1); }
    .board-label { display: inline; font-weight: 700; color: var(--ink-muted); margin-right: var(--space-1); }
  }
  @media (prefers-reduced-motion: no-preference) {
    .board-row { transition: background-color 0.15s ease; }
  }

  .error { color: var(--alert); background: var(--alert-tint); border: 1px solid var(--alert); border-radius: 0.5rem; padding: var(--space-3); margin-bottom: var(--space-4); }

  /* offer card and dryer prompt: a decision to make (two buttons), not
     just something to acknowledge — border marks it as something to act
     on, reusing the hero-reason row's own layout. */
  .decision-card { background: var(--free-tint); border: 1px solid var(--free); border-radius: var(--card-radius); padding: var(--space-4); margin-bottom: var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .decision-card form { margin: 0; }
  .decision-card select { margin-right: var(--space-2); }
  /* research/design-review.md's extra critique round: gives the offer
     card's one timed fact (respond-by) the same "larger, bolder figure"
     treatment the status hero already gives its own countdown, so it's
     legible at a glance instead of sitting at body size inside a sentence. */
  .decision-countdown { font-size: var(--text-lg); font-weight: 700; color: var(--free); }

  /* crit 9: tells both sides of a move-back-one swap what happened and
     why — stays until dismissed, not a toast that fades on its own */
  .notice-banner { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); background: var(--alert-tint); color: var(--alert); border-radius: 0.5rem; padding: var(--space-3); margin: 0 0 var(--space-3); font-size: var(--text-sm); font-weight: 600; }
  .notice-banner form { margin: 0; }

  /* crit 10 extension, Stage 10 (ADR 0008): a dropped SSE connection must
     never leave a stale queue on screen silently — alert colour, since
     it's telling you the page might be behind right now. */
  .connection-notice { background: var(--alert-tint); color: var(--alert); border-radius: 0.5rem; padding: var(--space-3); margin: 0 0 var(--space-4); font-size: var(--text-sm); font-weight: 600; }

  /* crit 10 extension, Stage 11 (ADR 0009): the dialog browsers focus
     automatically on showModal() — no extra focus-management script
     needed, and Escape closes it via the dialog element's own built-in
     behaviour (both captured by the "close" listener in TURN_ALERT_SCRIPT). */
  .turn-alert { border: none; border-radius: var(--card-radius); padding: var(--space-5) var(--space-5); max-width: 24rem; box-shadow: 0 8px 24px rgba(28,26,23,0.18); }
  .turn-alert::backdrop { background: rgba(28,26,23,0.4); }
  .turn-alert p { margin: 0 0 var(--space-4); font-size: var(--text-lg); }
  .turn-alert form { margin: 0; display: block; }

  /* the landing page's app introduction. research/design-review.md's
     extra critique round: a full-width paragraph at 1280px (the page's
     own 72rem max-width) read exactly like "the generic version" the
     design plan's self-review warned about — an unconstrained block of
     text with no deliberate measure. Capped at a comfortable reading
     width instead, the one place on this page prose, not a table or a
     figure, is the main content. */
  .intro { line-height: 1.6; margin-bottom: var(--space-5); max-width: 38rem; }
  .intro p { margin: var(--space-3) 0; }

  /* --- wide layout (research/design-plan.md's 1280px wireframe): status
     beside the board, using the width, not one narrow centred column --- */
  .page-layout { display: block; }
  @media (min-width: 900px) {
    .page-layout { display: grid; grid-template-columns: 22rem 1fr; gap: var(--space-7); align-items: start; }
    .status-column { position: sticky; top: var(--space-4); }
  }

  /* README.md, rendered in full at /readme/ */
  .prose { line-height: 1.6; max-width: 48rem; }
  .prose h1 { font-size: 1.5rem; }
  .prose h2 { font-size: 1.2rem; margin-top: var(--space-5); }
  .prose h3 { font-size: 1.05rem; margin-top: var(--space-5); }
  .prose p, .prose ul, .prose ol { margin: var(--space-3) 0; }
  .prose li { margin: var(--space-1) 0; }
  .prose code { background: var(--rule); border-radius: 0.3rem; padding: 0.1rem 0.3rem; font-size: 0.9em; }

  /* /simulation: server-rendered SVG bars, no chart library (crit 10
     extension Stage 13, ADR 0007's second use, ADR 0010) */
  .simulation-metric { margin: var(--space-6) 0; }
  .simulation-metric h2 { margin-bottom: var(--space-3); }
  .simulation-chart { display: flex; flex-direction: column; gap: var(--space-2); }
  .simulation-bar-row { display: grid; grid-template-columns: 11rem 1fr auto; gap: var(--space-3); align-items: center; }
  .simulation-bar-label { font-size: var(--text-sm); color: var(--ink-muted); }
  .simulation-bar { width: 100%; height: 0.9rem; border-radius: 0.2rem; overflow: hidden; }
  .simulation-bar-value { font-size: var(--text-sm); white-space: nowrap; }
  .simulation-assumptions { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--rule); }
  .simulation-assumptions li { margin: var(--space-2) 0; }
  @media (max-width: 640px) {
    .simulation-bar-row { grid-template-columns: 1fr; gap: var(--space-1); }
  }

  /* /simulation's replay (Stage 14) — reuses .board/.board-row from the
     real home page's board, so playback looks like the real board, not a
     separate design; these are only the replay's own controls. */
  .simulation-replay-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin: var(--space-3) 0; }
  .simulation-replay-clock { font-weight: 700; font-size: var(--text-lg); margin-left: auto; }
  .simulation-replay-banner { min-height: 1.5em; font-weight: 600; color: var(--info); }
  .simulation-closing { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--rule); color: var(--ink-muted); font-size: var(--text-sm); }
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

// Crit 10 extension, Stage 10 (plans/crit-10.md "Extension"; ADR 0008):
// every state-changing form here is a plain browser POST, not an
// htmx-issued request (plans/crit-9.md Stage 1.5's own reasoning for the
// "end the wash" confirm dialog) — so disabling "while in flight" means
// disabling the button for the moment between click and the browser's own
// navigation to the redirect response, which is exactly the slow-connection
// gap ADR 0008 is about (a resident taps again because nothing *seemed* to
// happen yet). One delegated listener covers every present and future
// form, including ones htmx/SSE swap in later, with no per-form wiring.
// Re-enabling on pageshow handles the back-forward cache: a disabled
// button would otherwise stay disabled forever if the browser restores
// the page from bfcache instead of reloading it.
const DISABLE_ON_SUBMIT_SCRIPT = `
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    // method=dialog forms (the turn-alert's own "Got it") never navigate
    // the page — they just close their <dialog> — so disabling their
    // button here would leave it disabled forever with no pageshow to
    // undo it. Only real state-changing POSTs want this treatment.
    if (form.method === "dialog") return;
    var button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;
  });
  window.addEventListener("pageshow", function () {
    document.querySelectorAll("button[type=submit]:disabled").forEach(function (button) {
      button.disabled = false;
    });
  });
`;

// Crit 10 extension, Stage 11 (plans/crit-10.md "Extension"; ADR 0009):
// README's calm technology argument names exactly two moments the queue
// pulls you back for — one person ahead, and your turn — so this is the
// only place in the app that opens a dialog unprompted. Reads
// data-reservation/data-alert off whatever the server just rendered into
// #my-status-wrapper (alertStateFor in the server-side code above), so it
// works identically on first load and after every SSE-triggered refetch,
// with no separate client-side notion of "my position." Dismissal is
// "once per transition": keyed on reservation id *and* which state fired
// (sessionStorage, wrapped in try/catch — Safari private mode and similar
// can throw on access), so moving from "one ahead" to "my turn" still
// alerts even though "one ahead" was already dismissed, but a reload or a
// live refetch while still in the same state never reopens it. Per ADR
// 0009: no sound, no vibration, nothing for anyone else's changes — only
// the viewer's own reservations ever reach this code at all, since
// #my-status-wrapper only ever renders the signed-in room's own rows.
const TURN_ALERT_SCRIPT = `
  var ORIGINAL_TITLE = document.title;
  var alertQueue = [];
  var currentKey = null;
  var titleChanged = false;
  var dialog = document.getElementById("turn-alert");
  var dialogText = document.getElementById("turn-alert-text");

  function storageKey(reservationId, state) {
    return "turnAlertSeen:" + reservationId + ":" + state;
  }
  function alreadySeen(key) {
    try { return sessionStorage.getItem(key) === "1"; } catch (e) { return false; }
  }
  function markSeen(key) {
    try { sessionStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
  }

  function sentenceFor(state) {
    return state === "my-turn"
      ? "It's your turn — claim your machine before the window runs out."
      : "One person is ahead of you — it's nearly your turn.";
  }
  function titleFor(state) {
    return state === "my-turn" ? "● Your turn — Laundry Queue" : "● Get ready — Laundry Queue";
  }

  // The title keeps announcing until the tab is actually focused, per ADR
  // 0009 — not just until the dialog closes, since dismissing it requires
  // being focused already in most cases, but a background tab getting a
  // fresh refetch (htmx:afterSwap can fire while hidden) must still be
  // able to flag itself for whenever the viewer does look.
  function restoreTitleIfFocused() {
    if (titleChanged && document.hasFocus()) {
      document.title = ORIGINAL_TITLE;
      titleChanged = false;
    }
  }

  function showNext() {
    if (!dialog || dialog.open || alertQueue.length === 0) return;
    var next = alertQueue.shift();
    currentKey = next.key;
    dialogText.textContent = sentenceFor(next.state);
    document.title = titleFor(next.state);
    titleChanged = true;
    dialog.showModal();
  }

  if (dialog) {
    // Fires on both the "Got it" button (type=submit inside a <form
    // method=dialog>) and Escape (the dialog element's own built-in
    // behaviour) — either way, the viewer has acknowledged it, so it's
    // marked seen and never reopens on a later reload/refetch.
    dialog.addEventListener("close", function () {
      if (currentKey) markSeen(currentKey);
      currentKey = null;
      restoreTitleIfFocused();
      showNext();
    });
  }
  window.addEventListener("focus", restoreTitleIfFocused);

  function checkAlerts() {
    document.querySelectorAll("[data-reservation][data-alert]").forEach(function (el) {
      var state = el.getAttribute("data-alert");
      if (!state) return;
      var reservationId = el.getAttribute("data-reservation");
      var key = storageKey(reservationId, state);
      if (alreadySeen(key)) return;
      if (key === currentKey) return;
      if (alertQueue.some(function (a) { return a.key === key; })) return;
      alertQueue.push({ key: key, state: state });
    });
    showNext();
  }

  document.body.addEventListener("htmx:afterSwap", function (event) {
    if (event.target && event.target.id === "my-status-wrapper") checkAlerts();
  });
  document.addEventListener("DOMContentLoaded", checkAlerts);
  if (document.readyState !== "loading") checkAlerts();
`;

// Crit 10 extension, Stage 10 (plans/crit-10.md "Extension"; ADR 0008):
// a dropped SSE connection must never leave a stale queue on screen
// silently — that's the worst case for an app whose whole point is that
// the screen can be trusted instead of walking down to the room. The
// extension's own htmx:sseError/htmx:sseOpen events (dispatched on the
// element carrying sse-connect, i.e. <body>) are the only signal
// available: there's no separate "reconnected" event, just "opened again"
// after at least one prior error.
//
// Re-fetching every live fragment on reconnect reuses the exact same path
// a real SSE message already takes, rather than hand-rolling a second way
// to know each fragment's URL/target/swap style: every element carrying
// hx-trigger="sse:..." already has htmx listening for a plain DOM event
// of that literal name (that's how the SSE extension delivers a message
// in the first place — it just dispatches that named event on the
// element), so re-dispatching the same event name does exactly what a
// live message would, with no per-fragment wiring and no risk of this
// script's idea of "the fragments" drifting from the real ones as new
// sse: triggers get added later (Stage 11's turn alerts, Stage 13's
// /simulation, ...).
const RECONNECT_SCRIPT = `
  function refetchLiveFragments() {
    document.querySelectorAll("[hx-trigger]").forEach(function (el) {
      var trigger = el.getAttribute("hx-trigger");
      if (trigger && trigger.indexOf("sse:") === 0) {
        el.dispatchEvent(new Event(trigger));
      }
    });
  }
  document.body.addEventListener("htmx:sseError", function () {
    var notice = document.getElementById("connection-notice");
    if (notice) notice.hidden = false;
  });
  document.body.addEventListener("htmx:sseOpen", function () {
    var notice = document.getElementById("connection-notice");
    // Only act if the notice was actually showing — htmx:sseOpen also
    // fires on the very first successful connection, which was never a
    // reconnect and needs no refetch.
    if (notice && !notice.hidden) {
      notice.hidden = true;
      refetchLiveFragments();
    }
  });
`;

// Crit 10 extension, Stage 14 (plans/crit-10.md "Extension"): drives
// /simulation's playback from the ReplayFrame[] JSON embedded by
// simulationReplaySection — entirely client-side, no server round-trip
// per frame. Plays once start to finish and stops on the last frame
// (never loops — a replay that loops silently becomes exactly the
// ambient noise README's calm-technology argument warns against). Every
// frame's events render as a brief banner line, replaced by the next
// frame's (or cleared, if a frame has none) rather than accumulating.
const REPLAY_SCRIPT = `
  (function () {
    var dataEl = document.getElementById("replay-data");
    var policySelect = document.getElementById("replay-policy");
    var playButton = document.getElementById("replay-play");
    var clockEl = document.getElementById("replay-clock");
    var bannerEl = document.getElementById("replay-banner");
    if (!dataEl || !policySelect || !playButton || !clockEl || !bannerEl) return;

    var allReplays = JSON.parse(dataEl.textContent);
    var timer = null;

    function minuteToClock(minute) {
      var totalMinutes = 8 * 60 + minute; // simulated day starts at 08:00
      var h = Math.floor(totalMinutes / 60) % 24;
      var m = totalMinutes % 60;
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }

    function sentenceFor(event) {
      if (event.kind === "moved_back") return event.room + " moved back one place — missed their claim or start window.";
      if (event.kind === "moved_up") return event.room + " moved up — the person ahead missed their window.";
      if (event.kind === "ejected") return event.room + " was ejected from the queue — missed their window.";
      if (event.kind === "offer_created") return event.room + " was offered an earlier machine that opened up.";
      return event.room + " queued a dryer for after their wash.";
    }

    function renderFrame(frame) {
      clockEl.textContent = minuteToClock(frame.minute);
      frame.machines.forEach(function (m) {
        var row = document.getElementById("replay-machine-" + m.machineId);
        if (!row) return;
        var stateEl = row.querySelector('[data-field="state"]');
        var nextEl = row.querySelector('[data-field="next"]');
        var timeEl = row.querySelector('[data-field="time"]');
        if (stateEl) {
          stateEl.textContent = m.label;
          stateEl.className = "state-word " + m.cls;
        }
        if (nextEl) nextEl.textContent = m.nextRoom || "—";
        if (timeEl) {
          if (m.timeLeftSeconds == null) {
            timeEl.textContent = "—";
          } else {
            var mins = Math.floor(m.timeLeftSeconds / 60);
            var secs = m.timeLeftSeconds % 60;
            timeEl.textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
          }
        }
      });
      bannerEl.textContent = frame.events.length > 0 ? frame.events.map(sentenceFor).join(" ") : "";
    }

    function play() {
      if (timer) return; // already playing
      var frames = allReplays[policySelect.value] || [];
      if (frames.length === 0) return;
      playButton.disabled = true;
      policySelect.disabled = true;
      var i = 0;
      renderFrame(frames[0]);
      timer = setInterval(function () {
        i++;
        if (i >= frames.length) {
          clearInterval(timer);
          timer = null;
          playButton.disabled = false;
          policySelect.disabled = false;
          return;
        }
        renderFrame(frames[i]);
      }, 60); // 840 frames at 60ms each ~= 50s for the whole simulated day
    }

    playButton.addEventListener("click", play);
  })();
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
          <a href="/simulation">Simulation</a>
        </nav>
        <h1><a href="/">Laundry Queue</a></h1>
        <p id="connection-notice" class="connection-notice" role="status" hidden>Connection lost — reconnecting…</p>
        ${body}
        <dialog id="turn-alert" class="turn-alert">
          <form method="dialog">
            <p id="turn-alert-text"></p>
            <button class="btn-primary" type="submit">Got it</button>
          </form>
        </dialog>
        <script>${raw(COUNTDOWN_SCRIPT)}</script>
        <script>${raw(DISABLE_ON_SUBMIT_SCRIPT)}</script>
        <script>${raw(RECONNECT_SCRIPT)}</script>
        <script>${raw(TURN_ALERT_SCRIPT)}</script>
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
  const drumFill = isDryer ? "var(--dryer)" : "var(--info)";
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

// One status vocabulary, used everywhere a reservation or a machine shows
// up — a CSS class for the colour, the word itself always present in the
// markup (research/design-plan.md's state table: colour never carries
// meaning alone). Returns the class and the label separately so callers
// can lay them out differently (a board cell's state-word span vs. the
// status hero's own larger reason line).
function stateWordFor(row: QueueRow | undefined, forOwner: boolean, machineType: Machine["type"]): { cls: string; label: string } {
  const state = boardStateFor(row, forOwner);
  return { cls: BOARD_STATE_CLASS[state], label: boardStateLabel(state, machineType) };
}

function rowBadge(row: QueueRow, forOwner: boolean, machineType: Machine["type"]): Html {
  const { cls, label } = stateWordFor(row, forOwner, machineType);
  return html`<span class="state-word ${cls}">${label}</span>`;
}

// "#N in line" — present but secondary now (research/design-plan.md's
// self-review: the hero figure's remaining time is the page's dominant
// number, queue position isn't).
function positionLine(n: number): Html {
  return html`<span class="position-line">#${n} in line</span>`;
}

// mm:ss form for the countdown text — plans/crit-8.md calls for "an
// actual countdown, not static text", and a deadline a few minutes out
// reads better to the second than "in 3 min". Crit 10 extension, Stage 12
// (research/design-plan.md "Type"): also used for the status hero's own
// countdown to an estimated/fixed ready time, not just a claim window —
// the live-ticking figure is itself the "remaining time" the hero's whole
// job is to show.
function countdownText(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Crit 10 extension, Stage 11 (plans/crit-10.md "Extension"; ADR 0009):
// README's calm-technology argument names exactly two moments the queue
// pulls you back for — one person ahead of you, and your turn. Computed
// from the same QueueRow display data every other status line already
// uses (position, status, claimDeadlineMs), not a new queue.ts concept:
// claimDeadlineMs is only set once the claim window has actually started
// (queueFor's own i===0 && turnStartedAt != null check), which is exactly
// what keeps a dryer still waiting on its wash — position 1, but not
// genuinely claimable yet — from firing "my turn" too early.
function alertStateFor(row: QueueRow): "one-ahead" | "my-turn" | undefined {
  if (row.status !== "waiting") return undefined;
  if (row.position === 1 && row.claimDeadlineMs != null) return "my-turn";
  if (row.position === 2) return "one-ahead";
  return undefined;
}

// Crit 10 extension, Stage 12 (research/design-plan.md "Wireframes"): the
// board's own "time left" column — one line, no label (the column header
// already says what it is), tabular figures throughout. A countdown for
// anything with a live deadline (the claim window); a plain finish clock
// time for a running wash (nothing to count down to urgently mid-wash);
// an em dash for "claimed" (no clock runs against you between claiming
// and starting) or a genuinely free machine.
function boardTimeCell(row: QueueRow | undefined, now: number): Html {
  if (!row) return html`<span class="num state-muted">—</span>`;
  if (row.status === "claimed") return html`<span class="num state-muted">—</span>`;
  if (row.status === "running") return html`<span class="num">${clockTime(row.endMs)}</span>`;
  if (row.claimDeadlineMs != null) {
    return html`<span class="num" data-countdown="${row.claimDeadlineMs}">${countdownText(row.claimDeadlineMs - now)}</span>`;
  }
  return html`<span class="num state-muted">${relativeTime(row.scheduledStartMs, now)}</span>`;
}

// Crit 9 (plans/crit-9.md Stage 6): a reservation's own lifecycle really
// is linear — waiting, then claimed, then running, then done — unlike
// queue *position*, which the move-back-one rule can send backward (that
// stays the existing "#N in line" text, never a step sequence). Dots
// aren't shown for cancelled/missed, since those exit the sequence
// sideways rather than completing it; the plain text badge already
// covers that case.
function statusSteps(machineType: Machine["type"]): { key: QueueRow["status"]; label: string }[] {
  return [
    { key: "waiting", label: "Waiting" },
    { key: "claimed", label: "Claimed" },
    { key: "running", label: machineType === "dryer" ? "Drying" : "Washing" },
    { key: "done", label: "Done" },
  ];
}

function statusDots(status: QueueRow["status"], machineType: Machine["type"]): Html {
  const steps = statusSteps(machineType);
  const stepIndex = steps.findIndex((s) => s.key === status);
  if (stepIndex === -1) return raw(""); // cancelled/missed: no sequence to show

  return html`<div class="status-dots" role="list" aria-label="Reservation progress">
    ${steps.map((step, i) => {
      const done = i < stepIndex;
      const current = i === stepIndex;
      const dot = html`<span
        class="dot ${done ? "dot-done" : ""} ${current ? "dot-current" : ""}"
        role="listitem"
      >
        <span aria-hidden="true">${done ? "✓" : ""}</span>
        <span class="sr-only">${step.label}${done ? " (done)" : current ? " (current step)" : ""}</span>
      </span>`;
      const line = i < steps.length - 1 ? html`<span class="dot-line" aria-hidden="true"></span>` : raw("");
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
      ? "You moved back one place: no claim within 3 minutes."
      : "The person ahead of you missed their window — it's your turn now.";
  return html`<div class="notice-banner">
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
function actionButtons(row: QueueRow, machineType: Machine["type"]): Html {
  const verb = machineType === "dryer" ? "dry" : "wash";
  return html`${row.status === "waiting" && row.position === 1
      ? html`<form method="post" action="/reservations/${row.reservationId}/claim"><button class="btn-primary" type="submit">Claim (scan)</button></form>`
      : raw("")}
    ${row.status === "claimed"
      ? html`<form method="post" action="/reservations/${row.reservationId}/start"><button class="btn-primary" type="submit">Start the ${verb}</button></form>`
      : raw("")}
    ${row.status === "waiting" || row.status === "claimed"
      ? html`<form method="post" action="/reservations/${row.reservationId}/cancel"><button class="btn-quiet" type="submit">Cancel</button></form>`
      : raw("")}
    ${row.status === "running"
      ? html`<form
          method="post"
          action="/reservations/${row.reservationId}/finish"
          onsubmit="return confirm('End this ${verb} now? This can\\'t be undone.')"
        ><button class="btn-quiet" type="submit">End the ${verb}</button></form>`
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

// Crit 9 (plans/crit-9.md Stage 3): "earlier machine" offer — accept
// vacates the original reservation and claims the new machine directly;
// decline leaves the original place untouched and hands it to the next
// eligible person on the next tick. Crit 10 extension, Stage 12: reuses
// the decision-card shape (free-tint, a border, two buttons) rather than
// the old info-tint notice banner — this is a choice to make, not just
// something to acknowledge, the same distinction the dryer prompt below
// already drew.
function offerCard(row: OfferRow, now: number): Html {
  // research/design-review.md's extra critique round: scored 4, not 5, on
  // "is my status's time the first thing the eye lands on" at mobile —
  // the card's own respond-by countdown was plain body-text size, so a
  // viewer's eye had nowhere obvious to land before reading the whole
  // sentence. The countdown is still the one fact this card is actually
  // timing (same reasoning as the status hero's own figure), so it's
  // pulled onto its own line at --text-lg instead of sitting inline in
  // the sentence — closer in spirit to Flighty's own inline-but-coloured
  // risk phrase (research/design-plan.md's 01-my-flights.jpg note),
  // without inventing a second --text-hero figure this card doesn't need.
  return html`<div class="decision-card">
    <span>An earlier machine opened up: <strong>${row.machine.label}</strong>.
      <br />Respond by <span class="num decision-countdown" data-countdown="${row.offer.respondBy}">${countdownText(row.offer.respondBy - now)}</span> (${clockTime(row.offer.respondBy)}).</span>
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
  return html`<div class="decision-card">
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

// A status hero's own clock-time figure, plain under the hero so a
// glance at both tells you exactly when, not just "how long" — design
// plan's wireframe keeps one plain-line reason, not a second number.
function heroClockLine(row: QueueRow, now: number): Html {
  if (row.status === "running") return html`ends at ${clockTime(row.endMs)}`;
  if (row.status === "claimed" || row.status === "done") return raw(""); // no clock claim against either state
  if (row.claimDeadlineMs != null) return html`claim by ${clockTime(row.claimDeadlineMs)}`;
  return html`${row.fixed ? "" : "est. "}ready at ${clockTime(row.scheduledStartMs)}`;
}

// Crit 10 extension, Stage 12 (research/design-plan.md's signature
// element): the remaining-time figure is the single largest thing on the
// page (--text-hero, 4.5x body text — research/design-plan.md "Type"),
// and the one plain-line reason underneath names *why*, the same move
// 03-delay-reason.jpg makes (a headline that answers "why," not "what").
// `aheadLabel` is the one piece of information this function can't derive
// from `row` alone — who's actually running ahead of you — so the caller
// (myStatusBlock, which already has every machine's full row list)
// resolves it and passes a ready-made string in.
// The hero figure only ever counts down to a moment the viewer is
// actually waiting on: the claim window (front, waiting), the estimated
// or fixed ready time (further back in the queue), or the wash's own end
// (running). "Claimed" has no clock running against the viewer at all
// (the start window exists, but plans/crit-8.md never surfaced it as a
// countdown even before this redesign, and inventing one here would
// overstate how much is actually known) and "done" has nothing left to
// count — both get a plain static word instead of a stale or fabricated
// number.
function heroCountdownTarget(row: QueueRow): number | undefined {
  if (row.status === "running") return row.endMs;
  if (row.status === "waiting") return row.claimDeadlineMs ?? row.scheduledStartMs;
  return undefined;
}

function statusHero(
  machine: Machine,
  row: QueueRow,
  now: number,
  aheadLabel: string | undefined,
  dryerSuggestion: DryerOption | undefined,
): Html {
  const { cls, label } = stateWordFor(row, true, machine.type);
  const countdownTarget = heroCountdownTarget(row);
  const figure =
    countdownTarget != null
      ? html`<p class="hero-figure num" data-countdown="${countdownTarget}">${countdownText(countdownTarget - now)}</p>`
      : html`<p class="hero-figure hero-figure-static state-muted">${row.status === "claimed" ? "Claimed" : "Done"}</p>`;

  const verb = machine.type === "dryer" ? "dry" : "wash";
  const reason =
    row.status === "running"
      ? `Your ${verb} is running.`
      : row.status === "claimed"
        ? `Claimed — start the ${verb} when you're ready.`
        : row.status === "done"
          ? "Done — thanks for using this machine."
          : row.notice === "moved_back"
            ? "You moved back one place: no claim within 3 minutes."
            : row.notice === "moved_up"
              ? "The person ahead of you missed their window — it's your turn now."
              : row.position === 1
                ? "Your turn — claim before this runs out."
                : (aheadLabel ?? "Waiting for your turn.");

  return html`<div class="status-hero" data-reservation="${row.reservationId}" data-alert="${alertStateFor(row) ?? ""}">
    <p class="hero-label">Your status</p>
    ${figure}
    <div class="hero-meta">
      ${machineIcon(machine.id, machine.type)}
      <strong>${machine.label}</strong>
      <span class="state-word ${cls}">${label}</span>
    </div>
    <p class="hero-reason">
      <span>${reason} <span class="num">${heroClockLine(row, now)}</span></span>
      ${positionLine(row.position)}
    </p>
    ${statusDots(row.status, machine.type)}
    <div class="hero-actions">${actionButtons(row, machine.type)}</div>
    ${dryerSuggestion ? dryerPromptCard(row.reservationId, dryerSuggestion) : raw("")}
  </div>`;
}

export function myStatusBlock(
  mine: { machine: Machine; row: QueueRow; aheadLabel?: string; dryerSuggestion?: DryerOption }[],
  myOffers: OfferRow[],
  now: number,
): Html {
  if (mine.length === 0 && myOffers.length === 0) return raw("");
  return html`${myOffers.map((o) => offerCard(o, now))}
    ${mine.map(({ machine, row, aheadLabel, dryerSuggestion }) =>
      html`${noticeBanner(row)}${statusHero(machine, row, now, aheadLabel, dryerSuggestion)}`,
    )}`;
}

// Crit 10 extension, Stage 12 (research/design-plan.md "Wireframes"): one
// row per machine, departure-board style — machine, state (word+colour),
// next room, time left, aligned in columns, washers then dryers (the
// design plan's own grouping). Replaces the old per-machine card grid,
// which research/design-plan.md's self-review named as the generic
// version of this page. The whole row still listens for its own machine's
// SSE event and swaps outerHTML, same mechanism as the old card.
function boardRow(machine: Machine, rows: QueueRow[], identity: string, now: number): Html {
  const front = rows[0];
  const mine = rows.find((r) => r.person === identity);
  const { cls, label } = stateWordFor(front, front?.person === identity, machine.type);
  const nextRoom = front ? (front.person === identity ? "you" : front.person) : "—";

  return html`<div
    class="board-row ${mine ? "board-row-mine" : ""}"
    id="machine-${machine.id}"
    hx-trigger="sse:machine-${machine.id}"
    hx-get="/machines/${machine.id}/card"
    hx-swap="outerHTML"
  >
    <span class="board-cell-machine">${machineIcon(machine.id, machine.type)} ${machine.label}</span>
    <span><span class="board-label">State</span><span class="state-word ${cls}">${label}</span></span>
    <span><span class="board-label">Next</span>${nextRoom}</span>
    <span><span class="board-label">Time left</span>${boardTimeCell(front, now)}</span>
    ${!mine
      ? html`<div class="board-reserve">
          <form method="post" action="/machines/${machine.id}/reservations">
            <select name="washingType">${machine.type === "dryer" ? dryingTypeOptions() : washingTypeOptions()}</select>
            <button class="btn-primary" type="submit">Reserve</button>
          </form>
        </div>`
      : raw("")}
  </div>`;
}

// Exported under its old name (machineCard) since app.ts's
// GET /machines/:id/card fragment route — what every board row's own
// hx-trigger re-fetches on its machine's SSE event — calls it by this
// name; the row itself is what changed shape, not the wiring around it.
export function machineCard(machine: Machine, rows: QueueRow[], identity: string, now: number): Html {
  return boardRow(machine, rows, identity, now);
}

function boardSection(title: string, machinesOfType: Machine[], rowsByMachine: Map<number, QueueRow[]>, identity: string, now: number): Html {
  if (machinesOfType.length === 0) return raw("");
  return html`<div class="board-section">
    <h2>${title}</h2>
    <div class="board">
      <div class="board-row board-head">
        <span>Machine</span><span>State</span><span>Next</span><span>Time left</span>
      </div>
      ${machinesOfType.map((m) => boardRow(m, rowsByMachine.get(m.id) ?? [], identity, now))}
    </div>
  </div>`;
}

// Looks up who's actually running ahead of `row` on its own machine, for
// the status hero's one-plain-line reason (research/design-plan.md: "the
// reservation ahead is the cause", mirroring 05-wheres-my-plane.jpg's
// upstream-dependency framing). Only meaningful while still waiting
// behind someone — the front-of-queue and already-committed cases never
// call this.
export function aheadLabelFor(allRowsForMachine: QueueRow[], row: QueueRow, machineType: Machine["type"]): string | undefined {
  const idx = allRowsForMachine.findIndex((r) => r.reservationId === row.reservationId);
  if (idx <= 0) return undefined;
  const ahead = allRowsForMachine[idx - 1];
  const verb = machineType === "dryer" ? "dry" : "wash";
  if (ahead.status === "running") return `Waiting on ${ahead.person}'s ${verb}, ends ${clockTime(ahead.endMs)}.`;
  return `Waiting behind ${ahead.person}.`;
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
    const rowsForMachine = rowsByMachine.get(m.id) ?? [];
    const row = rowsForMachine.find((r) => r.person === identity);
    return row
      ? [{ machine: m, row, aheadLabel: aheadLabelFor(rowsForMachine, row, m.type), dryerSuggestion: getDryerSuggestion(row.reservationId) }]
      : [];
  });
  const washers = machines.filter((m) => m.type === "washer");
  const dryers = machines.filter((m) => m.type === "dryer");

  return page(
    "Machines",
    html`<div class="page-layout">
      <div class="status-column">
        <p>Signed in as <strong>${identity}</strong>.
          <form method="post" action="/identity/clear" style="display:inline">
            <button class="btn-quiet" type="submit">Switch room</button>
          </form>
        </p>
        <div id="my-status-wrapper" hx-trigger="sse:changed" hx-get="/my-status" hx-swap="innerHTML">
          ${myStatusBlock(mine, myOffers, now)}
        </div>
      </div>
      <div class="board-column">
        ${boardSection("Washers", washers, rowsByMachine, identity, now)}
        ${boardSection("Dryers", dryers, rowsByMachine, identity, now)}
      </div>
    </div>`,
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

// Crit 10 extension, Stage 13 (plans/crit-10.md "Extension"; ADR 0007,
// second use): scripts/simulate.ts's own numbers, shown without a
// conclusion about which policy is "better" — CLAUDE.md's test harness
// rules reserve that argument for README/PROCESS, and this page doesn't
// make it. One labelled bar per policy per metric; colour is never the
// only cue (every bar also has its number printed next to it).
const POLICY_LABELS: Record<string, string> = {
  "wait-forever": "Wait forever",
  eject: "Eject (crit 8)",
  "move-back-one": "Move back one (current)",
};
const POLICY_COLOR_VAR: Record<string, string> = {
  "wait-forever": "--ink-muted",
  eject: "--alert",
  "move-back-one": "--free",
};

const SIMULATION_METRICS: { key: string; label: string; unit: string }[] = [
  { key: "joinToStartWaitMedianMinutes", label: "Join-to-start wait (median)", unit: "min" },
  { key: "joinToStartWaitP90Minutes", label: "Join-to-start wait (p90)", unit: "min" },
  { key: "joinToStartWaitMaxMinutes", label: "Join-to-start wait (max)", unit: "min" },
  { key: "movedBackOrEjectedCount", label: "People moved back or ejected", unit: "" },
  {
    key: "machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront",
    label: "Machine idle while someone waited behind an absent front",
    unit: "min",
  },
  { key: "extraWaitCausedForOthersMinutes", label: "Extra wait a late person caused others", unit: "min" },
  { key: "extraWaitPaidBySelfMinutes", label: "Extra wait a late person paid themselves", unit: "min" },
];

function simulationBarChart(results: SimulationResults, metricKey: string, unit: string): Html {
  const values = results.policies.map((p) => p.aggregate[metricKey as keyof typeof p.aggregate].mean);
  const max = Math.max(1, ...values);
  return html`<div class="simulation-chart" role="img" aria-label="Bar chart comparing ${metricKey} across missed-window policies">
    ${results.policies.map((p) => {
      const stat = p.aggregate[metricKey as keyof typeof p.aggregate];
      const widthPct = (stat.mean / max) * 100;
      const colorVar = POLICY_COLOR_VAR[p.policy] ?? "--ink-muted";
      return html`<div class="simulation-bar-row">
        <span class="simulation-bar-label">${POLICY_LABELS[p.policy] ?? p.policy}</span>
        <svg class="simulation-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
          <rect x="0" y="0" width="100" height="10" fill="var(--rule)" />
          <rect x="0" y="0" width="${widthPct.toFixed(1)}" height="10" fill="var(${colorVar})" />
        </svg>
        <span class="simulation-bar-value num">${stat.mean.toFixed(1)}${unit} <span class="state-muted">(±${stat.stddev.toFixed(1)})</span></span>
      </div>`;
    })}
  </div>`;
}

// Crit 10 extension, Stage 14 (plans/crit-10.md "Extension"): the bar
// charts above answer "how much," not "what actually happened" — this
// plays back one representative simulated day (results.policies[].replay,
// results.policies[].replaySeed) on the same board layout the real home
// page uses, so a swap is something you watch happen, not just a number.
// Pure client side: the whole day's ReplayFrame[] for the selected policy
// ships embedded in the page (already part of `results`, no new route),
// and REPLAY_SCRIPT below steps through it with setInterval. One row per
// machine is rendered server-side once (icon and label never change
// during playback — only state/next/time left do), matching boardRow's
// own markup/classes so the replay looks like the real board, not a
// separate design.
function simulationReplaySection(results: SimulationResults, machines: Machine[]): Html {
  return html`<section class="simulation-metric simulation-replay">
    <h2>Watch one simulated day</h2>
    <p>Picks the seed closest to each policy's own average above — a
    typical day, not the most dramatic one — and plays it once, start to
    finish, on the same board layout the real queue uses.</p>
    <div class="simulation-replay-controls">
      <label for="replay-policy">Policy</label>
      <select id="replay-policy">
        ${results.policies.map((p) => html`<option value="${p.policy}">${POLICY_LABELS[p.policy] ?? p.policy} — seed ${p.replaySeed}</option>`)}
      </select>
      <button class="btn-primary" type="button" id="replay-play">Play the simulation</button>
      <span class="num simulation-replay-clock" id="replay-clock">08:00</span>
    </div>
    <p class="simulation-replay-banner" id="replay-banner" aria-live="polite"></p>
    <div class="board" id="replay-board">
      ${machines.map(
        (m) => html`<div class="board-row" id="replay-machine-${m.id}" data-machine="${m.id}">
          <span class="board-cell-machine">${machineIcon(m.id, m.type)} ${m.label}</span>
          <span><span class="board-label">State</span><span class="state-word state-free" data-field="state">Free</span></span>
          <span><span class="board-label">Next</span><span data-field="next">—</span></span>
          <span><span class="board-label">Time left</span><span class="num" data-field="time">—</span></span>
        </div>`,
      )}
    </div>
    <script type="application/json" id="replay-data">${raw(JSON.stringify(Object.fromEntries(results.policies.map((p) => [p.policy, p.replay]))))}</script>
    <script>${raw(REPLAY_SCRIPT)}</script>
  </section>`;
}

// Named /simulation rather than /fairness (ADR 0010): the point of this
// page is the testing practice — driving the real queue code through a
// large volume of randomized, reproducible scenarios (deterministic
// simulation testing) — not an argument about which missed-window policy
// is fairest. The policy comparison is one output of running it, not
// what the page is for.
export function simulationPage(results: SimulationResults | undefined, machines: Machine[]): Html {
  if (!results) {
    return page(
      "Simulation",
      html`<p>No simulation results yet — run <code>pnpm sim</code> to generate <code>sim/results.json</code>.</p>`,
    );
  }

  return page(
    "Simulation",
    html`<div class="intro">
      <p>A hundred-plus-resident building using this queue at once isn't
      something anyone can click through by hand to check — so instead of
      manually testing a handful of cases, this runs the real queue code
      through a large number of randomly generated, reproducible days and
      reports what happened.</p>
      <p><strong>Simulated building, not real usage.</strong> Every number below comes from
      ${results.seedCount} randomly generated Saturdays in a made-up ${results.model.residentCount}-resident
      building, run through the real queue code with a virtual clock (<a href="https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/blob/main/docs/adr/0007-verification-harness.md">ADR 0007</a>,
      <a href="https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/blob/main/docs/adr/0010-simulation-as-testing.md">ADR 0010</a>),
      not measurements of a real laundry room. Re-run it yourself with <code>pnpm sim</code>; the
      assumptions it ran with are listed below.</p>
    </div>

    ${simulationReplaySection(results, machines)}

    <section class="simulation-metric">
      <h2>What the numbers add up to</h2>
      <p>Same data as the day you just watched (or any of the other 49
      seeds run under each policy) — summarised across all of them below.</p>
    </section>

    ${SIMULATION_METRICS.map(
      (m) => html`<section class="simulation-metric">
        <h2>${m.label}</h2>
        ${simulationBarChart(results, m.key, m.unit)}
      </section>`,
    )}

    <section class="simulation-assumptions">
      <h2>Assumptions this run made</h2>
      <ul>
        <li>${results.model.residentCount} residents, one simulated Saturday,
          ${results.model.simulatedMinutes / 60} hours (08:00–22:00).</li>
        <li>Each resident does a mean of ${results.model.meanLoadsPerResident} loads of laundry across the day.</li>
        <li>A resident never claims their turn at all ${(results.model.chanceNeverClaims * 100).toFixed(0)}% of the time,
          and never starts a wash once claimed ${(results.model.chanceNeverStartsOnceClaimed * 100).toFixed(0)}% of the time.</li>
        <li>When they do act, lateness is random up to ${results.model.maxClaimLatenessMinutes} minutes for claiming
          and ${results.model.maxStartLatenessMinutes} minutes for starting — both past the real windows, so a
          resident sometimes makes it and sometimes doesn't, re-rolled fresh every time a window opens.</li>
        <li>${(results.model.chanceQueuesDryerAfterWash * 100).toFixed(0)}% take the post-wash dryer prompt;
          ${(results.model.chanceRespondsToOfferAtAll * 100).toFixed(0)}% respond to an "earlier machine" offer at
          all, and ${(results.model.chanceAcceptsOfferGivenResponds * 100).toFixed(0)}% of those accept it.</li>
      </ul>
      <p>These are guesses, not data from a real building — changing them changes every number above.</p>
    </section>

    <p class="simulation-closing">This page reports numbers, not an
    argument — what they actually support, what they don't, and this
    simulation's own limitations are written up separately in
    <a href="https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/blob/main/docs/adr/0011-reading-the-simulation-numbers.md">ADR 0011</a>.
    The app's fairness argument itself is
    <a href="https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/blob/main/docs/adr/0005-fairness-escalation.md">ADR 0005</a>'s
    and <a href="/readme/">README</a>'s, made on different grounds than anything
    measured here.</p>`,
  );
}
