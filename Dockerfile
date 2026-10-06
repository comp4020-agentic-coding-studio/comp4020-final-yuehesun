# syntax = docker/dockerfile:1

# Node 24 runs TypeScript directly (type-stripping) — no build/bundle step,
# just install production deps and run src/server.ts. See ADR 0003.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV=production

ARG PNPM_VERSION=11.9.0
RUN npm install -g pnpm@$PNPM_VERSION

# --- deps stage: production deps only ---------------------------------------
FROM base AS deps

# toolchain for native modules (better-sqlite3), in case no prebuilt binary
# matches the image platform
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python-is-python3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# --- runtime stage: just the app and its production deps -------------------
FROM base

COPY --from=deps /app/node_modules /app/node_modules
COPY package.json ./
COPY src ./src
# the committed migrations, applied at boot (see src/db.ts, ADR 0003)
COPY drizzle ./drizzle
COPY README.md ./

ENV HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "src/server.ts"]
