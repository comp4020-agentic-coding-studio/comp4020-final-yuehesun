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
  return c.html(homePage(identity, allMachines, rowsByMachine, myOffers, now, queue.suggestedDryer));
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
  return c.html(myStatusBlock(mine, myOffers, now));
});

app.post("/identity", async (c) => {
  const body = await c.req.parseBody();
  const room = normalizeRoom(typeof body.room === "string" ? body.room : "");
  if (!room) return c.html(errorPage("enter your room number as roomXXX, e.g. room304", 400), 400);

  setCookie(c, IDENTITY_COOKIE, room, { path: "/", httpOnly: true, sameSite: "Lax" });
  logging.logEvent("identity_set", { room });
  return c.redirect("/", 303);
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
