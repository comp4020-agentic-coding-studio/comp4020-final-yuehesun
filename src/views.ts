import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Machine } from "./schema.ts";
import { WASHING_TYPES } from "./washing-types.ts";
import type { QueueRow } from "./queue.ts";

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
    --surface: #fcfcfb;
    --page: #f9f9f7;
    --ink: #0b0b0b;
    --ink-muted: #52514e;
    --ink-faint: #898781;
    --border: rgba(11,11,11,0.14);
    --good: #0ca30c;
    --good-tint: #e9f7e9;
    --warning: #c98500;
    --warning-tint: #fff4de;
    --info: #2a78d6;
    --info-tint: #e8f1fb;
    --mine: #4a3aa7;
    --mine-tint: #efecfa;
  }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 48rem; margin: 0 auto; padding: 1rem 1rem 3rem;
    background: var(--page); color: var(--ink);
  }
  h1 { font-size: 1.25rem; }
  h1 a { color: inherit; text-decoration: none; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  a { color: var(--info); }

  /* buttons: the live action is loud, Cancel stays quiet (plans/crit-8.md) */
  button, .btn {
    font: inherit; border-radius: 0.5rem; padding: 0.55rem 1rem;
    border: 1px solid var(--border); cursor: pointer;
  }
  .btn-primary { background: var(--warning); border-color: var(--warning); color: #241a00; font-weight: 700; }
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

  /* round numbered queue-position badge, deli-ticket style */
  .position {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.6rem; height: 1.6rem; border-radius: 50%;
    background: #eeede9; color: var(--ink); font-weight: 700; font-size: 0.8rem;
    flex: none;
  }
  .mine .position { background: var(--mine); color: white; }

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
  .chip-compact { flex-direction: row; gap: 0.35rem; align-items: baseline; padding: 0.1rem 0.5rem; }
  .chip-compact .chip-label { display: none; }
  .chip-compact .chip-time { font-size: 0.85rem; }

  /* pinned "my status" block: answers "am I up yet?" without hunting a grid */
  .my-status {
    background: var(--mine-tint); border: 1px solid var(--mine);
    border-radius: 0.75rem; padding: 0.9rem 1rem; margin-bottom: 1.25rem;
  }
  .my-status h2 { color: var(--mine); }
  .my-status-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }

  /* machine cards: single column on phone, grid on a wide screen (no JS) */
  .machines {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 1rem;
  }
  .machine {
    border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem;
    background: var(--surface); border-left-width: 6px;
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
`;

function page(title: string, body: Html): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} — Laundry Queue</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <style>${raw(STYLES)}</style>
      </head>
      <body>
        <h1><a href="/">Laundry Queue</a></h1>
        ${body}
      </body>
    </html>`;
}

// --- small building blocks ----------------------------------------------

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Always shown alongside the clock time (plans/crit-8.md: both formats,
// never one or the other — people scan for different ones).
function relativeTime(ms: number, now: number): string {
  const diffMin = Math.round((ms - now) / 60_000);
  if (diffMin <= 0) return "now";
  if (diffMin === 1) return "in 1 min";
  return `in ${diffMin} min`;
}

// The machine's number sits inside the drum, like a real machine's own
// number sticker — so the icon alone (shape = type, number = which one) is
// enough to tell machines apart at a glance, before reading any text.
// Decorative for screen readers (the adjacent "Washer N" text is the real
// accessible name). One shape today; a second shape is the hook crit 9's
// dryers need (plans/crit-8.md).
function machineIcon(number: number): Html {
  return raw(
    `<svg class="machine-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="2"/>
      <circle cx="12" cy="13" r="7"/>
      <text x="12" y="13.5" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" stroke="none" fill="currentColor">${number}</text>
      <line x1="6.5" y1="5" x2="8" y2="5" stroke-linecap="round"/>
      <line x1="10" y1="5" x2="11.5" y2="5" stroke-linecap="round"/>
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

function timeChip(label: string, ms: number, now: number, fixed: boolean, compact = false): Html {
  return html`<div class="chip ${fixed ? "chip-fixed" : "chip-estimate"} ${compact ? "chip-compact" : ""}">
    <span class="chip-label">${label}</span>
    <span class="chip-time">${clockTime(ms)}</span>
    <span class="chip-relative">${relativeTime(ms, now)}</span>
  </div>`;
}

// The one chip relevant to a given row: a countdown while it's unclaimed
// and free, an end time while running, or an estimated/fixed start time
// otherwise. Recomputed per request from real timestamps — not a static
// "3 minutes left" string (plans/crit-8.md).
function rowTimeChip(row: QueueRow, now: number, compact = false): Html {
  if (row.status === "claimed") return raw("");
  if (row.status === "running") return timeChip("Free at", row.endMs, now, true, compact);
  if (row.claimDeadlineMs != null) return timeChip("Claim by", row.claimDeadlineMs, now, false, compact);
  return timeChip("Starts", row.scheduledStartMs, now, row.fixed, compact);
}

function washingTypeOptions(): Html {
  return html`${Object.entries(WASHING_TYPES).map(
    ([value, type]) => html`<option value="${value}">${type.label} (${type.minutes} min)</option>`,
  )}`;
}

function actionButtons(row: QueueRow): Html {
  return html`${row.status === "waiting" && row.position === 1
      ? html`<form method="post" action="/reservations/${row.reservationId}/claim"><button class="btn-primary" type="submit">Claim (scan)</button></form>`
      : raw("")}
    ${row.status === "claimed"
      ? html`<form method="post" action="/reservations/${row.reservationId}/start"><button class="btn-primary" type="submit">Start the wash</button></form>`
      : raw("")}
    ${row.status === "waiting" || row.status === "claimed"
      ? html`<form method="post" action="/reservations/${row.reservationId}/cancel"><button class="btn-quiet" type="submit">Cancel</button></form>`
      : raw("")}`;
}

// --- pages ---------------------------------------------------------------

export function identityPage(): Html {
  return page(
    "Room number",
    html`<p>Enter your room number — that's how the queue tells you apart.
      No account, nothing else is stored, no name.</p>
      <form method="post" action="/identity">
        <input type="text" name="room" placeholder="e.g. room304" pattern="room[0-9]+" required maxlength="12" />
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

export function machineCard(machine: Machine, rows: QueueRow[], identity: string, now: number): Html {
  const mine = rows.find((r) => r.person === identity);
  const front = rows[0];
  const stateClass = !front ? "machine-free" : front.status === "waiting" ? "machine-unclaimed" : "machine-running";

  return html`<div class="machine ${stateClass}">
    <div class="machine-head">
      ${machineIcon(machine.id)}
      <h2>${machine.label}</h2>
      ${!front ? badge("good", "✓", "Free") : raw("")}
    </div>
    ${rows.length === 0
      ? raw("")
      : html`<ol class="queue-list">
          ${rows.map((r) => reservationLine(r, identity, now))}
        </ol>`}
    ${mine
      ? html`<p><a href="/reservations/${mine.reservationId}">Manage your reservation →</a></p>`
      : html`<form method="post" action="/machines/${machine.id}/reservations">
          <select name="washingType">${washingTypeOptions()}</select>
          <button class="btn-primary" type="submit">Reserve</button>
        </form>`}
  </div>`;
}

function myStatusBlock(mine: { machine: Machine; row: QueueRow }[], now: number): Html {
  if (mine.length === 0) return raw("");
  return html`<div class="my-status">
    <h2>Your status</h2>
    ${mine.map(
      ({ machine, row }) => html`<div class="my-status-row">
        ${machineIcon(machine.id)}
        <strong>${machine.label}</strong>
        ${positionBadge(row.position)}
        ${rowBadge(row, true)}
        ${rowTimeChip(row, now)}
        ${actionButtons(row)}
      </div>`,
    )}
  </div>`;
}

export function homePage(
  identity: string,
  machines: Machine[],
  rowsByMachine: Map<number, QueueRow[]>,
  now: number,
): Html {
  const mine = machines.flatMap((m) => {
    const row = (rowsByMachine.get(m.id) ?? []).find((r) => r.person === identity);
    return row ? [{ machine: m, row }] : [];
  });

  return page(
    "Machines",
    html`<p>Signed in as <strong>${identity}</strong>.</p>
      ${myStatusBlock(mine, now)}
      <div class="machines">${machines.map((m) => machineCard(m, rowsByMachine.get(m.id) ?? [], identity, now))}</div>`,
  );
}

export function reservationPage(machine: Machine, row: QueueRow, identity: string, now: number): Html {
  const owner = row.person === identity;

  return page(
    machine.label,
    html`<div class="machine-head">${machineIcon(machine.id)}<h2>${machine.label}</h2></div>
      <p>${positionBadge(row.position)} ${rowBadge(row, owner)}</p>
      ${rowTimeChip(row, now)}
      ${owner ? html`<p>${actionButtons(row)}</p>` : html`<p>This isn't your reservation.</p>`}
      <p><a href="/">← All machines</a></p>`,
  );
}

export function errorPage(message: string, status: number): Html {
  return page("Error", html`<p class="error">${message} (${status})</p><p><a href="/">← All machines</a></p>`);
}
