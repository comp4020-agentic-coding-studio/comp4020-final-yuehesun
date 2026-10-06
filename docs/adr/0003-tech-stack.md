# 0003: Tech stack — Hono, Drizzle + better-sqlite3, htmx

## Status

Accepted

## Context

Stage 1 of crit 8 can't start until the stack is locked in. Fixed
constraints: one Fly machine at 256MB RAM, one volume at `/data` (no
separate database server), plain HTTP behind Fly's proxy. The repo's
toolchain is already pinned to Node 24.21.0 and pnpm 11.9.0.

## Decision

**Framework: Hono.** Two alternatives were ruled out. Plain Node with no
framework (hand-written routing and HTML templating) was rejected — that
boilerplate wouldn't make the app any better, just bigger to write. A full
framework (SvelteKit or Next.js) was rejected too: heavier memory footprint
than a 256MB machine wants, more moving parts than this app needs, real-time
usually means fighting the framework's own server model, and it sits oddly
next to a README that argues for small and specific. Hono gives the
minimalism of the first option with far less boilerplate, plus a clean path
to streaming for crit 9's real-time work.

**SQLite driver: `better-sqlite3`, not `node:sqlite`.** Node 24 has SQLite
built in with no native module needed, which looked attractive, but
Drizzle's support for it only ships on Drizzle's beta/RC release channel,
not the stable release, and there's a currently open bug where `drizzle-kit`
doesn't fully support it. Too risky to build the whole project on an RC
dependency under deadline. `better-sqlite3` is the mature, proven pairing —
and the same combination week 7's guestbook already used successfully on
this exact Fly setup (one machine, one volume, Node 24).

**Migrations: Drizzle-generated, versioned, applied at boot.** Schema
changes go through `drizzle-kit generate`, the migration files it writes are
committed to the repo, and `migrate()` runs at server startup — not via
Fly's `release_command`. Reason: `release_command` runs on a separate,
transient machine that doesn't have the persistent volume attached in this
course's Fly setup, so the only machine that can see `/data` is the one
that boots and serves the app — migrations have to run there. Same shape as
the week 7 guestbook's `src/lib/db.ts`.

**Docker: multi-stage, `node:24-slim`.** Matches the pinned Node version;
Debian base so `better-sqlite3`'s prebuilt binaries are reliably available,
with `build-essential`/`pkg-config`/`python-is-python3` installed as a
fallback in case no prebuild matches the platform. Build stage installs and
builds; runtime stage copies only `node_modules`, the built output, and the
committed `drizzle/` migrations folder.

**Pages: Hono JSX + htmx.** The server renders HTML with Hono's JSX; htmx
handles partial page updates so most interactions need no custom
JavaScript, and htmx's SSE extension carries real-time updates once crit 9
needs them.

## Consequences

- Stage 1 can now be built on: TypeScript + Node 24, Hono, Drizzle +
  `better-sqlite3`, migrations at boot, htmx for interactivity.
- The Dockerfile carries the native-module build toolchain as a fallback
  even though `better-sqlite3` usually ships prebuilt binaries — a bigger
  build stage, but the runtime stage stays lean since it's copied separately.
- Worth revisiting once Drizzle's `node:sqlite` support leaves RC and the
  `drizzle-kit` bug is fixed — dropping `better-sqlite3` would remove the
  native-module toolchain from the Dockerfile entirely.
- htmx + SSE sets up crit 9's real-time work without a WebSocket library or
  a frontend framework.
