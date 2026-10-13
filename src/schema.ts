import { type AnySQLiteColumn, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// `type` is all "washer" today (crit 8 ships one machine type), but it's a
// real column rather than assumed, because the per-room reservation cap
// (plan.md) is scoped per type — "two washers at once, two dryers later"
// — and crit 9 adds a second type.
export const machines = sqliteTable("machines", {
  id: int("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  type: text("type").notNull().default("washer"),
});

// Crit 9 (plans/crit-9.md Stage 3): a machine of one type going fully
// idle with nobody queued for it, offered to the longest-waiting eligible
// person on a different machine of the same type ("earlier machine"
// offer, plan.md's User story). One row per offer made, not per machine —
// a declined/expired offer stays on record so the eligibility algorithm
// won't immediately re-offer the same still-idle machine to the same
// person (see the documented limitation in plans/crit-9.md Stage 3).
export const offers = sqliteTable("offers", {
  id: int("id").primaryKey({ autoIncrement: true }),
  reservationId: int("reservation_id")
    .notNull()
    .references((): AnySQLiteColumn => reservations.id),
  machineId: int("machine_id")
    .notNull()
    .references(() => machines.id),
  offeredAt: int("offered_at").notNull(),
  respondBy: int("respond_by").notNull(),
  status: text("status", {
    enum: ["pending", "accepted", "declined", "expired"],
  })
    .notNull()
    .default("pending"),
});

// A reservation's status moves waiting -> claimed -> running -> done, or
// sideways to cancelled (the holder backed out) or missed (they didn't
// scan within the 3-minute claim window — crit 8's simple fairness rule,
// see plans/crit-8.md). `turnStartedAt` is set the first time a waiting
// reservation becomes the front of its machine's queue with the machine
// free — that's what the 3-minute window counts from.
export const reservations = sqliteTable("reservations", {
  id: int("id").primaryKey({ autoIncrement: true }),
  machineId: int("machine_id")
    .notNull()
    .references(() => machines.id),
  personName: text("person_name").notNull(),
  washingType: text("washing_type").notNull(),
  durationMinutes: int("duration_minutes").notNull(),
  joinedAt: int("joined_at").notNull(),
  turnStartedAt: int("turn_started_at"),
  claimedAt: int("claimed_at"),
  startedAt: int("started_at"),
  status: text("status", {
    enum: ["waiting", "claimed", "running", "done", "cancelled", "missed"],
  })
    .notNull()
    .default("waiting"),
  // Crit 9 (plans/crit-9.md Stage 2): set when settleMachine()'s
  // move-back-one swap touches this reservation, so the affected person
  // can be told, not just silently repositioned. One outstanding notice
  // at a time — a new one replaces the old rather than stacking a history,
  // since this reports current truth, not a log. Cleared by dismissing it.
  notice: text("notice", { enum: ["moved_back", "moved_up"] }),
  // Crit 9 (plans/crit-9.md Stage 3): set only on the reservation created
  // by accepting an offer — this is what gives it a 10-minute claim
  // window instead of the normal 3 minutes once it's the front of its
  // (new, idle) machine's queue.
  offerId: int("offer_id").references(() => offers.id),
});

export type Machine = typeof machines.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type Offer = typeof offers.$inferSelect;
