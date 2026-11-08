import { resolve } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

// The spec checks a RUNNING app over HTTP, so it holds whatever the app is
// built with. CI builds the Dockerfile, starts the image and points APP_URL
// at it, so what passes there is what deploys. Locally, start your app however
// you run it, then `pnpm check`; APP_URL says where it's listening. It waits
// up to a minute, since some stacks take a while to boot or migrate.
//
// The local fallback below is deliberately NOT 8080: that's the port
// `pnpm dev` binds, and a bare `pnpm check` with no APP_URL set used to
// default straight to it, silently running these HTTP-driving specs
// against (and polluting) a real dev database instead of a scratch one.
const DEFAULT_LOCAL_URL = "http://localhost:8095";

// Matches src/db.ts's own default — this is the file a real `pnpm dev`
// (or any server started with no DATABASE_PATH) writes to. A changed
// default port alone doesn't actually guarantee safety: whatever server
// happens to be listening at baseUrl (a stray leftover process, a port
// collision, anyone's `pnpm dev`) might still be backed by this exact
// file. Twice in one real session, a bare `pnpm check` landed on some
// other already-running server backed by this path and wrote ~50 fake
// reservations into it before this check existed — see process-notes.md.
const REAL_DEV_DB_PATH = resolve("./.data/app.db");

export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = process.env.APP_URL ?? DEFAULT_LOCAL_URL;

  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      // not up yet
    }
    if (attempt >= 300) {
      throw new Error(
        `nothing is answering at ${baseUrl}: start your app first, or set APP_URL to where it's listening`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Refuse to drive a spec against whatever's actually backing baseUrl
  // until we know it isn't the real, persistent dev database. A changed
  // path (:memory:, a scratch file, CI's own throwaway container path)
  // passes; an exact match to this checkout's real .data/app.db does not,
  // regardless of which port or which already-running process it is.
  const dbPathRes = await fetch(`${baseUrl}/__db-path`);
  if (dbPathRes.ok) {
    const dbPath = await dbPathRes.text();
    if (dbPath === REAL_DEV_DB_PATH) {
      throw new Error(
        `refusing to run: the server at ${baseUrl} is backed by the real dev database (${dbPath}). ` +
          `Start a dedicated instance for the spec with DATABASE_PATH=:memory: (or another scratch path) ` +
          `and a port that isn't already in use, then set APP_URL to it.`,
      );
    }
  }

  project.provide("baseUrl", baseUrl);
}
