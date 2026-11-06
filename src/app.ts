import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { db } from "./db.ts";
import { normalizeRoom } from "./identity.ts";
import * as logging from "./logging.ts";
import * as queue from "./queue.ts";
import * as realtime from "./realtime.ts";
import { renderReadme } from "./readme.ts";
import { readSimulationResults } from "./simulation-results.ts";
import { type Machine, machines, offers, reservations } from "./schema.ts";
import { dryingDurationFor, isDryingType } from "./drying-types.ts";
import { durationFor, isWashingType } from "./washing-types.ts";
import { aheadLabelFor, errorPage, homePage, identityPage, machineCard, myStatusBlock, readmePage, simulationPage } from "./views.ts";
import { laundryPage, scanIdentityPage, scanPage } from "./laundry-view.ts";
import { boardStateFor, boardStateLabel } from "./board-state.ts";
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
  return c.html(homePage(identity, allMachines, rowsByMachine, myOffers, now, queue.suggestedDryer, pendingPickups));
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
    const unclaimed = queue.doneUnacknowledgedOnMachine(m.id);
    return {
      id: m.id,
      state,
      label: boardStateLabel(state, m.type),
      nextRoom: front ? (front.person === identity ? "you" : front.person) : undefined,
      isMyTurn: front?.person === identity && front.status === "waiting",
      unclaimedLaundry: unclaimed ? { room: unclaimed.reservationId, canHandOff: front?.person === identity && front.status === "waiting" } : undefined,
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
  return c.json({ machines: result, myBasketVisible: activeMine || doneMine.length > 0, occupiedSpots });
});

// plans/3d-walkthrough.md Stage 3: a real, server-rendered QR code per
// machine, encoding this machine's scan URL. The origin is computed from
// the incoming request itself (not a hardcoded deployed hostname), so the
// same code works against localhost during verification and against the
// real deployed host in production. docs/adr/0012: the payload is a plain
// machine-id URL, no token — exactly as trusted as a sticker on a real
// machine, matching how identity is unverified everywhere else in this
// app (ADR 0002).
app.get("/machines/:id/qrcode.png", async (c) => {
  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.notFound();

  const origin = new URL(c.req.url).origin;
  const scanUrl = `${origin}/laundry/scan/${machineId}`;
  const png = await QRCode.toBuffer(scanUrl, { type: "png", margin: 1 });
  return c.body(new Uint8Array(png), 200, { "content-type": "image/png" });
});

// plans/3d-walkthrough.md Stage 3: the scan landing page — three branches
// (plus the logged-out redirect-through-identity case, handled by
// scanIdentityPage below), built entirely from existing queue.ts reads
// and existing action routes (POST /reservations/:id/claim,
// POST /machines/:id/reservations both already exist and are unchanged).
app.get("/laundry/scan/:id", (c) => {
  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.html(errorPage("no such machine", 404), 404);

  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(scanIdentityPage(machineId));

  const now = Date.now();
  const rows = queue.queueFor(machineId, now);
  return c.html(scanPage(machine, rows, identity, now));
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
      ? [{ machine: m, row, aheadLabel: aheadLabelFor(rowsForMachine, row, m.type), dryerSuggestion: queue.suggestedDryer(row.reservationId) }]
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

actionRoute("/reservations/:id/claim", "reservation_claimed", queue.claim);
actionRoute("/reservations/:id/start", "reservation_started", queue.start);
actionRoute("/reservations/:id/cancel", "reservation_cancelled", queue.cancel);
actionRoute("/reservations/:id/finish", "reservation_finished", queue.finish);
actionRoute("/reservations/:id/dismiss-notice", "notice_dismissed", queue.dismissNotice);
actionRoute("/reservations/:id/dismiss-dryer-prompt", "dryer_prompt_dismissed", queue.dismissDryerPrompt);
actionRoute("/offers/:id/accept", "offer_accepted", queue.acceptOffer);
actionRoute("/offers/:id/decline", "offer_declined", queue.declineOffer);
// Stage 8.4 (plans/3d-walkthrough.md, docs/adr/0013): the original owner
// confirming they've collected their laundry — loadOwned-gated exactly
// like every other per-reservation action, so actionRoute's shape fits
// unchanged.
actionRoute("/reservations/:id/acknowledge-pickup", "laundry_pickup_acknowledged", queue.acknowledgePickup);

// Stage 8.4: the pickup-and-place action. Not actionRoute's shape — a
// successful handoff needs to report back *which* spot the server picked
// (JSON, read by the 3D scene's own JS), not just redirect to "/" — and
// logging already happens inside queue.handoffLaundry itself (it needs
// the chosen spot in the log line, which actionRoute's generic wrapper
// doesn't have visibility into).
app.post("/machines/:id/handoff", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.json({ error: "sign in first" }, 400);

  const machineId = Number(c.req.param("id"));
  const result = queue.handoffLaundry(machineId, identity);
  if (!result.ok) return c.json({ error: result.message }, result.status);
  return c.json({ spot: result.spot });
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
