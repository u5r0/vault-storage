# syntax=docker/dockerfile:1.7
# -------------------------------------------------------------------
# Multi-stage build for @vault/server
# Produces a minimal Node 22 Alpine image running dist/index.js
# -------------------------------------------------------------------

# ─── Stage 1: Install dependencies ────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable

# Copy lockfile + workspace manifests first (cache-friendly layer)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/sdk/package.json ./packages/sdk/

# Install only the server's dependency tree (and its workspace deps)
RUN pnpm install --frozen-lockfile --filter @vault/server...

# ─── Stage 2: Build ───────────────────────────────────────────────
FROM deps AS build
COPY packages/sdk ./packages/sdk
COPY apps/server ./apps/server
RUN pnpm --filter @vault/server build

# ─── Stage 3: Production runtime ─────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed at runtime:
# - The bundled server output (single file + sourcemap)
# - node_modules for native deps (argon2) and non-bundled packages
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/package.json ./package.json

# argon2 needs the .node binding from node_modules
# The bundled index.js marks it as external so it resolves from node_modules

# Declare the health endpoint so `docker run` and compose know when
# the process is ready. Uses node's built-in fetch (Node ≥ 18) so no
# curl/wget is needed on the Alpine image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
