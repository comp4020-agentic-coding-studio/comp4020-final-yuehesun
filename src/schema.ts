import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// `type` is all "washer" today (crit 8 ships one machine type), but it's a
// real column rather than assumed, because the per-room reservation cap
// (plan.md) is scoped per type — "two washers at once, two dryers later"
// — and crit 9 adds a second type.
export const machines = sqliteTable("machines", {
  id: int("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  type: text("type").notNull().default("washer"),
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
});

export type Machine = typeof machines.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
