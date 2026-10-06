import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { machines } from "./schema.ts";

// One SQLite file is the app's whole persistent state (ADR 0003). In
// production fly.toml will point DATABASE_PATH at the machine's volume
// (/data) so state survives a reload and a redeploy; locally it defaults to
// an untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — there's no
// separate machine to run them from (ADR 0003). Edit src/schema.ts,
// `pnpm db:generate`, commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

const MACHINE_COUNT = 10;

seedMachinesIfEmpty();

// Crit 8 ships one machine type (plans/crit-8.md): ten identical washers,
// seeded once on a fresh database so there's something to reserve.
function seedMachinesIfEmpty(): void {
  if (db.select().from(machines).limit(1).all().length > 0) return;

  for (let i = 1; i <= MACHINE_COUNT; i++) {
    db.insert(machines)
      .values({ label: `Washer ${i}` })
      .run();
  }
}
