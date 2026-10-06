import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { db } from "./db.ts";
import { normalizeRoom } from "./identity.ts";
import * as queue from "./queue.ts";
import { machines, reservations } from "./schema.ts";
import { durationFor, isWashingType } from "./washing-types.ts";
import { errorPage, homePage, identityPage, reservationPage } from "./views.ts";

const IDENTITY_COOKIE = "person";

export const app = new Hono();

app.get("/", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(identityPage());

  const now = Date.now();
  const allMachines = db.select().from(machines).all();
  const rowsByMachine = new Map(allMachines.map((m) => [m.id, queue.queueFor(m.id, now)]));
  return c.html(homePage(identity, allMachines, rowsByMachine, now));
});

app.post("/identity", async (c) => {
  const body = await c.req.parseBody();
  const room = normalizeRoom(typeof body.room === "string" ? body.room : "");
  if (!room) return c.html(errorPage("enter your room number as roomXXX, e.g. room304", 400), 400);

  setCookie(c, IDENTITY_COOKIE, room, { path: "/", httpOnly: true, sameSite: "Lax" });
  return c.redirect("/", 303);
});

app.post("/machines/:id/reservations", async (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const machineId = Number(c.req.param("id"));
  const machine = db.select().from(machines).where(eq(machines.id, machineId)).get();
  if (!machine) return c.html(errorPage("no such machine", 404), 404);

  const body = await c.req.parseBody();
  const washingType = typeof body.washingType === "string" ? body.washingType : "";
  if (!isWashingType(washingType)) return c.html(errorPage("pick a washing type", 400), 400);

  const reservationId = queue.join(machineId, identity, washingType, durationFor(washingType));
  c.header("Location", `/reservations/${reservationId}`);
  return c.body(null, 303);
});

function findRow(machineId: number, reservationId: number) {
  return queue.queueFor(machineId).find((r) => r.reservationId === reservationId);
}

app.get("/reservations/:id", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.redirect("/", 303);

  const id = Number(c.req.param("id"));
  const reservation = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!reservation) return c.html(errorPage("no such reservation", 404), 404);

  const machine = db.select().from(machines).where(eq(machines.id, reservation.machineId)).get()!;
  const row = findRow(machine.id, id);
  if (!row) return c.html(errorPage("that reservation has ended", 404), 404);

  return c.html(reservationPage(machine, row, identity, Date.now()));
});

function actionRoute(path: string, act: (id: number, identity: string) => queue.ActionResult) {
  app.post(path, (c) => {
    const identity = getCookie(c, IDENTITY_COOKIE);
    if (!identity) return c.html(errorPage("sign in first", 400), 400);

    const id = Number(c.req.param("id"));
    const result = act(id, identity);
    if (!result.ok) return c.html(errorPage(result.message, result.status), result.status);

    return c.redirect(`/reservations/${id}`, 303);
  });
}

actionRoute("/reservations/:id/claim", queue.claim);
actionRoute("/reservations/:id/start", queue.start);
app.post("/reservations/:id/cancel", (c) => {
  const identity = getCookie(c, IDENTITY_COOKIE);
  if (!identity) return c.html(errorPage("sign in first", 400), 400);

  const id = Number(c.req.param("id"));
  const result = queue.cancel(id, identity);
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
