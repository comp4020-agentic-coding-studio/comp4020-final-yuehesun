import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Machine } from "./schema.ts";
import { WASHING_TYPES } from "./washing-types.ts";
import type { QueueRow } from "./queue.ts";

// `html` template results can resolve async (if an interpolated value does),
// so every view function's return type needs to allow for that.
type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// htmx is wired up now (ADR 0003) even though nothing streams live yet —
// crit 9's SSE work hangs off the same script tag. Crit 8's forms are plain
// full-page POST + redirect, since no real-time behaviour is expected yet
// (plans/crit-8.md).
function page(title: string, body: Html): Html {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title} — Laundry Queue</title>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
          .machine { border: 1px solid #ccc; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; }
          .unclaimed { border-color: #c77700; background: #fff8ec; }
          .you { font-weight: bold; }
          form { margin: 0.5rem 0; }
          .error { color: #a40000; border: 1px solid #a40000; border-radius: 0.5rem; padding: 0.75rem; }
        </style>
      </head>
      <body>
        <h1><a href="/" style="color:inherit;text-decoration:none">Laundry Queue</a></h1>
        ${body}
      </body>
    </html>`;
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function washingTypeOptions(): Html {
  return html`${Object.entries(WASHING_TYPES).map(
    ([value, type]) => html`<option value="${value}">${type.label} (${type.minutes} min)</option>`,
  )}`;
}

export function identityPage(): Html {
  return page(
    "Who's this",
    html`<p>Tell us who you are — a name or room number is enough. No account, nothing else is stored.</p>
      <form method="post" action="/identity">
        <input name="name" placeholder="e.g. Room 4B" required maxlength="40" />
        <button type="submit">Continue</button>
      </form>`,
  );
}

function reservationLine(row: QueueRow, identity: string): Html {
  const who = row.person === identity ? html`<span class="you">you</span>` : html`${row.person}`;
  const when = `${row.fixed ? "" : "~"}${timeOf(row.scheduledStartMs)}`;
  const statusText =
    row.status === "running"
      ? `running, free at ${when}`
      : row.status === "claimed"
        ? "claimed, about to start"
        : row.status === "waiting" && row.position === 1
          ? "free but unclaimed — their turn, 3 minutes to claim"
          : `waiting, starts ~${when}`;
  return html`<li>#${row.position} ${who} — ${statusText}</li>`;
}

export function machineCard(machine: Machine, rows: QueueRow[], identity: string): Html {
  const mine = rows.find((r) => r.person === identity && r.status !== "done" && r.status !== "cancelled" && r.status !== "missed");
  const frontUnclaimed = rows[0]?.status === "waiting" && rows[0].position === 1;

  return html`<div class="machine ${frontUnclaimed ? "unclaimed" : ""}">
    <h2>${machine.label}</h2>
    ${rows.length === 0
      ? html`<p>Free — no one queued.</p>`
      : html`<ol>
          ${rows.map((r) => reservationLine(r, identity))}
        </ol>`}
    ${mine
      ? html`<p><a href="/reservations/${mine.reservationId}">Manage your reservation →</a></p>`
      : html`<form method="post" action="/machines/${machine.id}/reservations">
          <select name="washingType">${washingTypeOptions()}</select>
          <button type="submit">Reserve this machine</button>
        </form>`}
  </div>`;
}

export function homePage(identity: string, machines: Machine[], rowsByMachine: Map<number, QueueRow[]>): Html {
  return page(
    "Machines",
    html`<p>Signed in as <strong>${identity}</strong>.</p>
      ${machines.map((m) => machineCard(m, rowsByMachine.get(m.id) ?? [], identity))}`,
  );
}

export function reservationPage(
  machine: Machine,
  row: QueueRow,
  identity: string,
  error?: string,
): Html {
  const owner = row.person === identity;
  const when = `${row.fixed ? "" : "~"}${timeOf(row.scheduledStartMs)}`;

  return page(
    machine.label,
    html`${error ? html`<p class="error">${error}</p>` : raw("")}
      <h2>${machine.label}</h2>
      <p>Position #${row.position} — ${row.status}, ${row.fixed ? "starts" : "estimated start"} ${when}</p>
      ${owner
        ? html`${row.status === "waiting" && row.position === 1
              ? html`<form method="post" action="/reservations/${row.reservationId}/claim"><button type="submit">Claim (scan)</button></form>`
              : raw("")}
            ${row.status === "claimed"
              ? html`<form method="post" action="/reservations/${row.reservationId}/start"><button type="submit">Start the wash</button></form>`
              : raw("")}
            ${row.status === "waiting" || row.status === "claimed"
              ? html`<form method="post" action="/reservations/${row.reservationId}/cancel"><button type="submit">Cancel</button></form>`
              : raw("")}`
        : html`<p>This isn't your reservation.</p>`}
      <p><a href="/">← All machines</a></p>`,
  );
}

export function errorPage(message: string, status: number): Html {
  return page("Error", html`<p class="error">${message} (${status})</p><p><a href="/">← All machines</a></p>`);
}
