import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { db, dbPath } from "./db.ts";
import { normalizeRoom } from "./identity.ts";
import * as logging from "./logging.ts";
import * as queue from "./queue.ts";
import * as presence from "./presence.ts";
import * as realtime from "./realtime.ts";
import { renderReadme } from "./readme.ts";
import { readSimulationResults } from "./simulation-results.ts";
import { type Machine, machines, offers, reservations } from "./schema.ts";
import { dryingDurationFor, isDryingType } from "./drying-types.ts";
import { durationFor, isWashingType } from "./washing-types.ts";
import { aheadLabelFor, errorPage, handoffRequiredBanner, homePage, identityPage, machineCard, myStatusBlock, readmePage, scanRequiredBanner, scanRequiredPage, simulationPage } from "./views.ts";
import { laundryPage, scanIdentityPage } from "./laundry-view.ts";
import { boardStateFor, boardStateLabel } from "./board-state.ts";
import { publicOrigin, scanUrlFor } from "./qr.ts";
import QRCode from "qrcode";
import { serveStatic } from "@hono/node-server/serve-static";

const IDENTITY_COOKIE = "person";

export const app = new Hono();

// Crit 10 (plans/crit-10.md Stage 2): a request line for every
// state-changing request. GETs are deliberately excluded — htmx/SSE
// re-fetch /machines/:id/card and /my-status on every state change
// (crit 9's realtime transport), and logging those would bury "who did
// what" under routine polling that isn't anyone doing anything. The tag
// bound here is what lets every logEvent() call made while handling this
// request (in app.ts or queue.ts) share one tag with this request line.
app.use(async (c, next) => {
  if (c.req.method !== "POST") return next();

  const tag = logging.genTag();
  const start = Date.now();
  await logging.withTag(tag, next);
  const user = getCookie(c, IDENTITY_COOKIE) ?? "-";
  logging.logRequest(tag, c.req.method, c.req.path, c.res.status, Date.now() - start, user);
});

// spec/global-setup.ts checks this before running any HTTP-driving spec
// against APP_URL, so a bare `pnpm check` that lands on a stray dev server
// (localhost:8080 or anything else) refuses to run rather than writing
// fake reservations into that server's real .data/app.db.
app.get("/__db-path", (c) => c.text(dbPath));

app.get("/readme/", (c) => c.html(readmePage(renderReadme())));

app.get("/simulation", (c) => c.html(simulationPage(readSimulationResults(), db.select().from(machines).all())));

// Crit 9 Stage 3: pending offers aren't tied to a QueueRow — a pending
// offer lives on the candidate's own reservation, not the idle machine's
// queue — so the home page and /my-status both need this looked up
// separately to show it in the pinned "your status" block.
function pendingOffersFor(identity: string, now: number) {
  return db
    .select({ offer: offers, reservation: reservations, machine: machines })
    .from(offers)
    .innerJoin(reservations, eq(offers.reservationId, reservations.id))
    .innerJoin(machines, eq(offers.machineId, machines.id))
    .where(and(eq(reservations.personName, identity), eq(offers.status, "pending"), eq(reservations.status, "waiting")))
    .all()
    .filter((row) => row.offer.respondBy > now);
}

app.get("/", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(identityPage());

  const now = Date.now();
  const allMachines = db.select().from(machines).all();
  const rowsByMachine = new Map(allMachines.map((m) => [m.id, queue.queueFor(m.id, now)]));
  const myOffers = pendingOffersFor(identity, now);
  const pendingPickups = queue.doneUnacknowledgedFor(identity);
  // plans/laundry-handoff-decouple-from-claim.md: curried to the same
  // single-argument shape suggestedDryer already has, since
  // suggestedHandoff additionally needs to confirm the reservation is
  // this exact viewer's own (a check suggestedDryer doesn't need, since
  // it's only ever called on rows already scoped to this identity by
  // homePage's own `mine` filter — suggestedHandoff adds this itself, for
  // the same reason loadOwned exists, not relying on the caller to have
  // scoped it already).
  const getHandoffSuggestion = (reservationId: number) => queue.suggestedHandoff(reservationId, identity);
  return c.html(homePage(identity, allMachines, rowsByMachine, myOffers, now, queue.suggestedDryer, getHandoffSuggestion, pendingPickups));
});

// plans/3d-walkthrough.md Stage 8.1: the real CC0 GLTF models (washer,
// dryer, sink, table, ceiling lamp, character — see public/models/SOURCES.md
// for exactly which asset and license each one is) are downloaded once and
// committed into the repo rather than fetched from a third-party host at
// runtime, matching ADR 0003's "no outbound dependency" shape the rest of
// the app already follows. Served as plain static files, no dependency on
// anything else in this route table.
app.use("/models/*", serveStatic({ root: "./public" }));

// plans/3d-walkthrough.md Stage 1: the first-person 3D room. Same "no
// cookie -> identity page" guard as GET / above, reused verbatim rather
// than a second, slightly-different check — and deliberately *not* gated
// on holding a reservation (docs/adr/0012's sibling decision: a resident
// can walk into the room to look around before deciding to queue).
app.get("/laundry", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(identityPage());

  const allMachines = db.select().from(machines).all();
  return c.html(laundryPage(allMachines));
});

// plans/3d-walkthrough.md Stage 2: the 3D scene's own data source for live
// machine state — a second consumer of the exact same board-state.ts
// logic the 2D board already renders with (boardStateFor/boardStateLabel),
// not a re-derivation of "what does this state mean." Identity-aware (like
// GET /machines/:id/card) since boardStateFor's "your-turn" vs "unclaimed"
// distinction depends on whose cookie is asking. Covers every machine in
// one request rather than one route per machine, since the scene refetches
// this on every relevant SSE event and 10 small requests per tick would be
// wasteful for no benefit over one.
//
// Stage 8.3/8.4 (plans/3d-walkthrough.md): extended beyond Stage 2's
// original {id, state, label, nextRoom} shape with what the 3D scene's
// interaction layer needs: whether the viewer holds the front waiting
// reservation on this machine (isMyTurn — drives whether a free-machine
// interaction opens the examine overlay vs. nothing), and whether this
// machine has a done-and-unacknowledged reservation sitting on it
// (unclaimedLaundry — drives Stage 8.4's handoff indicator, distinct from
// the normal state/colour, since a "done" reservation has already left
// boardStateFor's own waiting/claimed/running vocabulary entirely — see
// the Stage 8.4b commit's note on queueFor() never returning "done" rows).
// The top-level myBasket field is 8.4a's own data point: whether the
// viewer's own basket should currently be visible, computed once here
// rather than re-derived per-machine, since it depends on the viewer's
// reservations as a whole, not any one machine.
app.get("/laundry/machines-state", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.json({ error: "sign in first" }, 400);

  const now = Date.now();
  const allMachines = db.select().from(machines).all();
  const result = allMachines.map((m) => {
    const rows = queue.queueFor(m.id, now);
    const front = rows[0];
    const state = boardStateFor(front, front?.person === identity);
    const unclaimed = queue.laundryInDrumOn(m.id);
    // Stage 10 (3D room marker): whether the viewer holds ANY active
    // reservation on this machine, not just the front one — front?.person
    // === identity (used by isMyTurn/unclaimedLaundry below, which really
    // do only care about the front reservation) would miss a viewer
    // waiting second-or-later, or already claimed/running when a
    // different row happens to be front. Mirrors src/views.ts's own
    // homePage, which already does `rowsForMachine.find((r) => r.person
    // === identity)` for exactly this reason.
    //
    // Also true while the viewer's own laundry is done-but-not-yet-
    // collected on this machine (unclaimed.personName === identity) —
    // without this, the marker disappeared the instant a wash finished,
    // since queueFor()'s active rows (waiting/claimed/running) never
    // include a "done" reservation at all. Per the user's own request:
    // the marker should stay through the whole "yours in some sense"
    // window, ending only once the laundry is actually collected
    // (pickedUpAt set), not the moment the queue-position sense of
    // "mine" lapses.
    const mine = rows.some((r) => r.person === identity) || unclaimed?.personName === identity;
    return {
      id: m.id,
      state,
      label: boardStateLabel(state, m.type),
      nextRoom: front ? (front.person === identity ? "you" : front.person) : undefined,
      isMyTurn: front?.person === identity && front.status === "waiting",
      isMine: mine,
      // plans/laundry-handoff-decouple-from-claim.md: widened from
      // front.status === "waiting" only to "waiting" | "claimed", to
      // match isFrontWaitingHolder's own widened check — claim is now
      // unconditional on this machine's laundry state, so the resident
      // entitled to pick it up is still the machine's front holder even
      // after they've claimed (not just while still waiting).
      unclaimedLaundry: unclaimed
        ? {
            room: unclaimed.personName,
            canHandOff: front?.person === identity && (front.status === "waiting" || front.status === "claimed"),
          }
        : undefined,
    };
  });
  // 8.4a: a basket is "carried" whenever the viewer has a reservation not
  // yet started (waiting/claimed — clothes still with them) or done but
  // not yet collected (going back for it) — running is the one state with
  // no basket, since the clothes are in the machine. A separate query from
  // the per-machine loop above (queueFor()'s active set and
  // doneUnacknowledgedFor's done set are disjoint, so this can't be
  // folded into the loop without querying twice anyway).
  const activeMine = allMachines.some((m) => queue.queueFor(m.id, now).some((r) => r.person === identity && r.status !== "running"));
  const doneMine = queue.doneUnacknowledgedFor(identity);
  // Stage 8.4: the drop-off shelf's own numbered-spot-occupied display —
  // which of the fixed spots currently hold someone's unacknowledged
  // laundry, independent of whose laundry it is or who's viewing.
  const occupiedSpots = Array.from(queue.occupiedPickupSpots());
  // plans/laundry-dropoff-flow.md: whether — and from which machine — the
  // viewer is currently carrying someone else's laundry, read from the
  // real IN_TRANSIT/carriedBy server state rather than left to a
  // client-only variable. This is the actual fix for the old
  // "basket flickers" bug: the server now agrees with the 3D scene's
  // carry state for the whole duration of the carry, instead of
  // reporting "done" the instant pickup happened.
  const carrying = queue.carryingFor(identity);
  return c.json({
    machines: result,
    myBasketVisible: activeMine || doneMine.length > 0 || carrying != null,
    basketKind: carrying != null ? "other" : "own",
    carryingFromMachine: carrying?.machineId,
    occupiedSpots,
  });
});

// plans/3d-walkthrough.md Stage 3: a real, server-rendered QR code per
// machine, encoding this machine's scan URL. The origin is computed from
// the incoming request itself (not a hardcoded deployed hostname), so the
// same code works against localhost during verification and against the
// real deployed host in production. docs/adr/0012: the payload is a plain
// machine-id URL, no token — exactly as trusted as a sticker on a real
// machine, matching how identity is unverified everywhere else in this
// app (ADR 0002).
//
// docs/adr/0012's addendum: if the browser requesting this image already
// has an identity cookie (true for the 3D room's own desktop session,
// which required one to reach /laundry at all), that room number rides
// along as a ?room= query param. /laundry/scan/:id below uses it only to
// prefill — never to skip — the phone's own identity form, so the
// scanning phone still has to press "Continue" itself before anything is
// set. The room number was already visible on that same desktop session
// (the 3D character's floating label, the home page board), so this
// exposes nothing a bystander glancing at the screen couldn't already
// read directly.
app.get("/machines/:id/qrcode.png", async (c) => {
  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.notFound();

  const origin = publicOrigin(c.req.url);
  const identity = getCookie(c, IDENTITY_COOKIE);
  const scanUrl = scanUrlFor(origin, machineId, identity);
  const png = await QRCode.toBuffer(scanUrl.toString(), { type: "png", margin: 1 });
  return c.body(new Uint8Array(png), 200, { "content-type": "image/png" });
});

// plans/3d-walkthrough.md Stage 3's scan landing page (scanPage, still
// used below for the logged-out case's eventual landing and kept
// entirely intact — nothing about its own three branches changed) is no
// longer where an already-identified scanner lands. Stage 10 (user
// feedback): a resident who already has a room-number cookie expects
// scanning a machine's code to open the same home page they already
// reserve/claim from — not a separate, machine-scoped mini-page — so
// this route now redirects there once identity is known. The logged-out
// branch is unaffected: scanIdentityPage's own `redirect` field already
// threads a just-identified visitor back through this exact route, so
// after identity is set, the one extra hop lands here and continues
// straight through to "/".
app.get("/laundry/scan/:id", (c) => {
  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.html(errorPage("no such machine", 404), 404);

  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) {
    // docs/adr/0012's addendum: ?room= (set by the QR code above, from the
    // 3D room desktop session's own identity cookie) only ever prefills
    // the form field — run through the same normalizeRoom() every other
    // identity input goes through, so a malformed or hostile query value
    // just fails to prefill rather than being trusted outright. The
    // scanning phone still has to press "Continue" itself; nothing here
    // sets a cookie or claims anything on its own.
    const prefill = normalizeRoom(c.req.query("room") ?? "");
    return c.html(scanIdentityPage(machineId, prefill));
  }

  // plans/laundry-scan-gated-claim.md Stage 2: this is the one real
  // place a scan event gets recorded — reaching this route with a known
  // identity is, definitionally, a real scan (a phone's camera scanning
  // the machine's actual code, or the just-identified visitor's own
  // redirect back through this exact route after typing their room
  // number). Recorded before the redirect, so a claim attempted the
  // instant the home page loads already sees it.
  queue.recordScan(machineId, identity);
  logging.logEvent("machine_scanned", { room: identity, machine: machineId });

  return c.redirect("/", 303);
});

// plans/laundry-presence.md Stage 1: one browser tab's own position
// report. Fire-and-forget from the client's own perspective (a bare 204
// — this is telemetry, not an action with a user-visible consequence, so
// there's nothing to render back).
app.post("/laundry/presence", async (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.json({ error: "sign in first" }, 400);

  const body = await c.req.json().catch(() => null);
  // The one route in this app that accepts a body shaped by client-side
  // JS rather than a form field, so malformed/missing fields are a real
  // possibility (a stale tab mid-reload, a future client bug) — checked
  // defensively, not just against hostile input.
  if (!body || typeof body.tabId !== "string" || typeof body.x !== "number" || typeof body.z !== "number" || typeof body.yaw !== "number") {
    return c.json({ error: "malformed presence report" }, 400);
  }
  presence.report(body.tabId, identity, body.x, body.z, body.yaw, !!body.moving);
  return c.body(null, 204);
});

// plans/laundry-presence.md Stage 1: an explicit "I'm gone" signal, sent
// via navigator.sendBeacon on pagehide so a deliberate tab close/
// navigation removes the character immediately instead of waiting out
// presence.ts's stale-record timeout. Best-effort only — removeStale()
// is what guarantees a dead tab's character eventually disappears even
// if this never fires (a crashed tab, a lost connection on the way out).
app.post("/laundry/presence/leave", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body && typeof body.tabId === "string") presence.remove(body.tabId);
  return c.body(null, 204);
});

// plans/laundry-presence.md Stage 1: SSE, one stream per connected
// /laundry tab, broadcasting everyone else's current positions on a
// steady tick. Modelled on GET /events' own shape directly below, but a
// separate stream and a separate Set<SSEStreamingApi> — presence is
// continuous high-frequency state, a different shape from /events' own
// discrete change signals, so the two are kept apart rather than merged
// (see the plan's "Why this needs a new transport").
app.get("/laundry/presence-stream", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.text("sign in first", 400);

  return streamSSE(c, async (stream) => {
    presence.addStream(stream);
    stream.onAbort(() => presence.removeStream(stream));
    while (!stream.closed && !stream.aborted) {
      await stream.sleep(60_000);
    }
  });
});

// Crit 9: one shared SSE stream per browser (plans/crit-9.md Stage 1). It
// carries only change signals, named per machine, so each fragment below
// re-fetches itself with the viewer's own cookie rather than the server
// pushing rendered HTML that would be the same for every viewer.
app.get("/events", (c) => {
  return streamSSE(c, async (stream) => {
    realtime.addStream(stream);
    stream.onAbort(() => realtime.removeStream(stream));
    while (!stream.closed && !stream.aborted) {
      await stream.sleep(60_000);
    }
  });
});

app.get("/machines/:id/card", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.html(errorPage("no such machine", 404), 404);

  const rows = queue.queueFor(machineId);
  return c.html(machineCard(machine, rows, identity, Date.now()));
});

app.get("/my-status", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const now = Date.now();
  const allMachines = db.select().from(machines).all();
  const mine = allMachines.flatMap((m) => {
    const rowsForMachine = queue.queueFor(m.id, now);
    const row = rowsForMachine.find((r) => r.person === identity);
    return row
      ? [{
          machine: m,
          row,
          aheadLabel: aheadLabelFor(rowsForMachine, row, m.type),
          dryerSuggestion: queue.suggestedDryer(row.reservationId),
          handoffSuggestion: queue.suggestedHandoff(row.reservationId, identity),
        }]
      : [];
  });
  const myOffers = pendingOffersFor(identity, now);
  const pendingPickups = queue.doneUnacknowledgedFor(identity);
  return c.html(myStatusBlock(mine, myOffers, now, pendingPickups));
});

// plans/3d-walkthrough.md Stage 3: an optional `redirect` field, sent only
// by the scan landing page's identity form, sends a just-scanned visitor
// back to the machine they scanned instead of always to "/". Validated
// against a narrow allowlist shape — a same-origin path starting exactly
// with "/laundry/scan/" — so this can't become an open redirect; anything
// else (a full URL, a protocol-relative "//host" path, any other path)
// is silently ignored and falls back to "/", the same as not sending the
// field at all.
function safeScanRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/laundry/scan/")) return undefined;
  if (value.startsWith("//")) return undefined; // protocol-relative, would leave this origin
  return value;
}

app.post("/identity", async (c) => {
  const body = await c.req.parseBody();
  const room = normalizeRoom(typeof body.room === "string" ? body.room : "");
  const redirectTo = safeScanRedirect(body.redirect) ?? "/";
  if (!room) return c.html(errorPage("enter your room number as roomXXX, e.g. room304", 400), 400);

  setCookie(c, IDENTITY_COOKIE, room, { path: "/", httpOnly: true, sameSite: "Lax" });
  logging.logEvent("identity_set", { room });
  return c.redirect(redirectTo, 303);
});

// Lets a visitor get back to the room-number prompt — there was otherwise
// no way back to it, including to switch rooms while testing.
app.post("/identity/clear", (c) => {
  const room = getCookie(c, IDENTITY_COOKIE);
  deleteCookie(c, IDENTITY_COOKIE, { path: "/" });
  if (room) logging.logEvent("identity_cleared", { room });
  return c.redirect("/", 303);
});

// Crit 9 (plans/crit-9.md Stage 8): the "washing type" lookup reserves a
// washer; a dryer uses the separate DRYING_TYPES lookup instead — which
// one applies is decided by the machine's own type, not by whatever the
// request happens to send, so a dryer can't be reserved with a washer's
// duration options or vice versa.
app.post("/machines/:id/reservations", async (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.html(errorPage("no such machine", 404), 404);

  const body = await c.req.parseBody();
  const typeInput = typeof body.washingType === "string" ? body.washingType : "";

  let durationMinutes: number;
  if (machine.type === "dryer") {
    if (!isDryingType(typeInput)) return c.html(errorPage("pick a drying type", 400), 400);
    durationMinutes = dryingDurationFor(typeInput);
  } else {
    if (!isWashingType(typeInput)) return c.html(errorPage("pick a washing type", 400), 400);
    durationMinutes = durationFor(typeInput);
  }

  const result = queue.join(machineId, identity, typeInput, durationMinutes);
  if (!result.ok) {
    logging.logEvent("reservation_join_denied", { room: identity, machine: machineId, reason: result.message });
    return c.html(errorPage(result.message, result.status), result.status);
  }
  logging.logEvent("reservation_joined", {
    reservation: result.reservationId,
    room: identity,
    machine: machineId,
    type: typeInput,
  });

  // spec/'s join() client reads this id out of the Location header's path
  // (plans/crit-8.md's wire contract) — the string shape has to stay.
  // GET /reservations/:id below just bounces a real browser on to "/"
  // (plans/crit-9.md Stage 1.5: the detail page itself is gone, since the
  // home page's pinned "your status" block already renders every action
  // directly) — spec/'s client never actually follows this redirect, it
  // only parses the id out of the header string.
  c.header("Location", `/reservations/${result.reservationId}`);
  return c.body(null, 303);
});

app.get("/reservations/:id", (c) => c.redirect("/", 303));

// Crit 9 (plans/crit-9.md Stage 1.5): actions redirect to the home page,
// not a reservation detail page — there isn't one anymore.
//
// Crit 10 (plans/crit-10.md Stage 3): `name` drives both the success
// event and (suffixed "_denied") the failure one — this is also what
// makes the brief's authorization example show up for free: a 403 from
// `loadOwned`/`loadOwnedOffer` (room A acting on room B's reservation)
// logs as a named, room-attributed denial instead of an unlabelled row.
function actionRoute(path: string, name: string, act: (id: number, identity: string) => queue.ActionResult) {
  app.post(path, (c) => {
    const identity = getCookie(c, IDENTITY_COOKIE);
    if (!identity) return c.html(errorPage("sign in first", 400), 400);

    const id = Number(c.req.param("id"));
    const result = act(id, identity);
    if (!result.ok) {
      logging.logEvent(`${name}_denied`, { id, room: identity, reason: result.message });
      return c.html(errorPage(result.message, result.status), result.status);
    }
    logging.logEvent(name, { id, room: identity });
    return c.redirect("/", 303);
  });
}

// plans/laundry-scan-gated-claim.md Stage 3/6.1: claim gets its own route
// instead of actionRoute()'s generic wrapper, solely so its one new
// rejection reason ("scan the machine's code first") can render
// differently from every other rejection (ownership, front-of-queue,
// window timing), which still render through the same errorPage() every
// other action uses. No change to queue.claim() itself or to any other
// action's own route.
//
// Stage 6.1: the home page's Claim button is now an htmx request
// (src/views.ts's actionButtons(), hx-target="#claim-feedback-:id"), so a
// resident clicking it with no scan recorded sees an inline notice
// instead of the whole page navigating to scanRequiredPage() — but every
// existing non-browser caller (spec/*.test.ts, sim/driver.ts, a plain
// curl) still gets exactly the old shape, nothing broken for them.
// htmx itself is what makes this branch possible to do safely:
// - It sends "HX-Request: true" on every request it issues (confirmed
//   against htmx's own docs, not assumed) — the one reliable way to tell
//   an htmx-originated request apart from a plain form POST or a test's
//   bare fetch(), without adding a new query param or header convention
//   of this app's own.
// - htmx's default response handling never swaps a non-2xx response's
//   body into hx-target at all (it only fires htmx:responseError and
//   leaves the target untouched) — so returning the old scanRequiredPage()
//   at its real 409 status, unchanged, for an htmx request would make the
//   Claim button look like it silently does nothing. The inline banner
//   below is returned at 200 instead, specifically so htmx actually
//   swaps it in; the real failure is still logged server-side exactly as
//   before, and a non-htmx caller (every spec file, sim/driver.ts) still
//   sees the real 409/403/404 status it already asserts on.
// - A 3xx status is intercepted by the browser's own XHR/fetch layer
//   before htmx's own header/response logic ever runs, so an htmx request
//   can't be redirected via Location the way a plain form submit is —
//   htmx's own documented alternative is the HX-Redirect response
//   header, which triggers a full client-side navigation exactly like a
//   3xx would for a plain form. Used only for the htmx branch below; the
//   non-htmx branch keeps the original 303 redirect unchanged.
app.post("/reservations/:id/claim", (c) => {
  const isHtmx = c.req.header("HX-Request") === "true";
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const id = Number(c.req.param("id"));
  const result = queue.claim(id, identity);
  if (!result.ok) {
    logging.logEvent("reservation_claimed_denied", { id, room: identity, reason: result.message });
    if (result.message === "scan the machine's code first") {
      if (isHtmx) return c.html(scanRequiredBanner(), 200);
      return c.html(scanRequiredPage(), result.status);
    }
    return c.html(errorPage(result.message, result.status), result.status);
  }
  logging.logEvent("reservation_claimed", { id, room: identity });
  if (isHtmx) {
    c.header("HX-Redirect", "/");
    return c.body(null, 200);
  }
  return c.redirect("/", 303);
});
// plans/laundry-handoff-decouple-from-claim.md: start() gets its own
// route instead of actionRoute()'s generic wrapper, for the same reason
// claim() does above — its one new rejection reason ("move the previous
// resident's laundry out first") renders through an inline htmx banner,
// not a full-page errorPage() navigation, while every other rejection
// from start() (not claimed yet) still renders through errorPage() same
// as before. No change to queue.start() itself beyond its own new
// precondition.
app.post("/reservations/:id/start", (c) => {
  const isHtmx = c.req.header("HX-Request") === "true";
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const id = Number(c.req.param("id"));
  const result = queue.start(id, identity);
  if (!result.ok) {
    logging.logEvent("reservation_started_denied", { id, room: identity, reason: result.message });
    if (result.message === "move the previous resident's laundry out first") {
      if (isHtmx) return c.html(handoffRequiredBanner(), 200);
      return c.html(errorPage(result.message, result.status), result.status);
    }
    return c.html(errorPage(result.message, result.status), result.status);
  }
  logging.logEvent("reservation_started", { id, room: identity });
  if (isHtmx) {
    c.header("HX-Redirect", "/");
    return c.body(null, 200);
  }
  return c.redirect("/", 303);
});
actionRoute("/reservations/:id/cancel", "reservation_cancelled", queue.cancel);
actionRoute("/reservations/:id/finish", "reservation_finished", queue.finish);
actionRoute("/reservations/:id/dismiss-notice", "notice_dismissed", queue.dismissNotice);
actionRoute("/reservations/:id/dismiss-dryer-prompt", "dryer_prompt_dismissed", queue.dismissDryerPrompt);
actionRoute("/reservations/:id/dismiss-handoff-prompt", "handoff_prompt_dismissed", queue.dismissHandoffPrompt);
actionRoute("/offers/:id/accept", "offer_accepted", queue.acceptOffer);
actionRoute("/offers/:id/decline", "offer_declined", queue.declineOffer);
// Stage 8.4 (plans/3d-walkthrough.md, docs/adr/0013): the original owner
// confirming they've collected their laundry — loadOwned-gated exactly
// like every other per-reservation action, so actionRoute's shape fits
// unchanged.
actionRoute("/reservations/:id/acknowledge-pickup", "laundry_pickup_acknowledged", queue.acknowledgePickup);

// plans/laundry-dropoff-flow.md: the handoff split into two real steps.
// Neither fits actionRoute's shape — pickup/place both need a JSON reply
// (read by the 3D scene's own JS) rather than a redirect to "/", and
// place's reply needs the chosen spot, which actionRoute's generic
// wrapper has no visibility into. Logging happens inside queue.ts itself
// for the same reason the old single /handoff route's logging did.
app.post("/machines/:id/pickup", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.json({ error: "sign in first" }, 400);

  const machineId = Number(c.req.param("id"));
  const result = queue.pickUpLaundry(machineId, identity);
  if (!result.ok) return c.json({ error: result.message }, result.status);
  return c.json({ ok: true });
});

app.post("/machines/:id/place", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.json({ error: "sign in first" }, 400);

  const machineId = Number(c.req.param("id"));
  const result = queue.placeLaundry(machineId, identity);
  if (!result.ok) return c.json({ error: result.message }, result.status);
  return c.json({ spot: result.spot });
});

// plans/laundry-handoff-decouple-from-claim.md: the home page's "Yes, I
// moved it" card — a plain form POST (not JSON over fetch, unlike
// /pickup and /place above, since this is reached from a regular <form>
// on the home page, not the 3D scene's own JS). Calls confirmHandoff, not
// placeLaundry directly, so it works as a standalone confirm action for
// a resident who never touched the 3D scene's pickup step at all. Once
// this succeeds, suggestedHandoff() naturally stops returning this
// machine's suggestion (unacknowledgedLaundryOn no longer finds anything
// to report), so the card disappears on the next render with no separate
// dismissal needed — "Yes" and "No" both end the card's life, just via
// different underlying facts.
app.post("/machines/:id/confirm-handoff", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const machineId = Number(c.req.param("id"));
  const result = queue.confirmHandoff(machineId, identity);
  if (!result.ok) {
    logging.logEvent("laundry_confirm_handoff_denied", { machine: machineId, room: identity, reason: result.message });
    return c.html(errorPage(result.message, result.status), result.status);
  }
  logging.logEvent("laundry_confirm_handoff", { machine: machineId, room: identity, spot: result.spot });
  return c.redirect("/", 303);
});

// Crit 9 (plans/crit-9.md Stage 8): queues a dryer reservation alongside
// an existing washer reservation — needs its own route rather than
// actionRoute's shape, since it also takes a drying type from the form.
app.post("/reservations/:id/queue-dryer", async (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const washReservationId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const dryingType = typeof body.dryingType === "string" ? body.dryingType : "";
  if (!isDryingType(dryingType)) return c.html(errorPage("pick a drying type", 400), 400);

  const result = queue.queueDryer(washReservationId, identity, dryingType, dryingDurationFor(dryingType));
  if (!result.ok) {
    logging.logEvent("dryer_queue_denied", { reservation: washReservationId, room: identity, reason: result.message });
    return c.html(errorPage(result.message, result.status), result.status);
  }
  logging.logEvent("dryer_queued", {
    reservation: washReservationId,
    room: identity,
    dryerReservation: result.reservationId,
  });

  return c.redirect("/", 303);
});

// JSON queue state — not a page a visitor sees, just how spec/ and
// debugging inspect invariants without parsing HTML (plans/crit-8.md).
app.get("/machines/:id/state", (c) => {
  const machineId = Number(c.req.param("id"));
  const rows = queue.queueFor(machineId).map(({ reservationId, person, status, position }) => ({
    reservationId,
    person,
    status,
    position,
  }));
  return c.json(rows);
});
