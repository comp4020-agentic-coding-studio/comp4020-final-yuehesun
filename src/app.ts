import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { db } from "./db.ts";
import { normalizeRoom } from "./identity.ts";
import * as queue from "./queue.ts";
import * as realtime from "./realtime.ts";
import { renderReadme } from "./readme.ts";
import { type Machine, machines, offers, reservations } from "./schema.ts";
import { dryingDurationFor, isDryingType } from "./drying-types.ts";
import { durationFor, isWashingType } from "./washing-types.ts";
import { errorPage, homePage, identityPage, machineCard, myStatusBlock, readmePage } from "./views.ts";

const IDENTITY_COOKIE = "person";

export const app = new Hono();

app.get("/readme/", (c) => c.html(readmePage(renderReadme())));

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
    const row = queue.queueFor(m.id, now).find((r) => r.person === identity);
    return row ? [{ machine: m, row, dryerSuggestion: queue.suggestedDryer(row.reservationId) }] : [];
  });
  const myOffers = pendingOffersFor(identity, now);
  return c.html(myStatusBlock(mine, myOffers, now));
});

app.post("/identity", async (c) => {
  const body = await c.req.parseBody();
  const room = normalizeRoom(typeof body.room === "string" ? body.room : "");
  if (!room) return c.html(errorPage("enter your room number as roomXXX, e.g. room304", 400), 400);

  setCookie(c, IDENTITY_COOKIE, room, { path: "/", httpOnly: true, sameSite: "Lax" });
  return c.redirect("/", 303);
});

// Lets a visitor get back to the room-number prompt — there was otherwise
// no way back to it, including to switch rooms while testing.
app.post("/identity/clear", (c) => {
  deleteCookie(c, IDENTITY_COOKIE, { path: "/" });
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
  if (!result.ok) return c.html(errorPage(result.message, result.status), result.status);

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
function actionRoute(path: string, act: (id: number, identity: string) => queue.ActionResult) {
  app.post(path, (c) => {
    const identity = getCookie(c, IDENTITY_COOKIE);
    if (!identity) return c.html(errorPage("sign in first", 400), 400);

    const id = Number(c.req.param("id"));
    const result = act(id, identity);
    if (!result.ok) return c.html(errorPage(result.message, result.status), result.status);

    return c.redirect("/", 303);
  });
}

actionRoute("/reservations/:id/claim", queue.claim);
actionRoute("/reservations/:id/start", queue.start);
actionRoute("/reservations/:id/cancel", queue.cancel);
actionRoute("/reservations/:id/finish", queue.finish);
actionRoute("/reservations/:id/dismiss-notice", queue.dismissNotice);
actionRoute("/reservations/:id/dismiss-dryer-prompt", queue.dismissDryerPrompt);
actionRoute("/offers/:id/accept", queue.acceptOffer);
actionRoute("/offers/:id/decline", queue.declineOffer);

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
  if (!result.ok) return c.html(errorPage(result.message, result.status), result.status);

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
