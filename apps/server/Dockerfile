# syntax=docker/dockerfile:1.7
# -------------------------------------------------------------------
# Multi-stage build for @vault/server
# -------------------------------------------------------------------

# ─── Stage 1: Build + deploy ──────────────────────────────────────
FROM node:24-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
WORKDIR /usr/src/app
RUN corepack enable

COPY . .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

RUN pnpm --filter @vault/sdk build && pnpm --filter @vault/server build

RUN pnpm --filter @vault/server deploy --legacy --prod /prod/server

# ─── Stage 2: Production runtime ──────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /prod/server ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

USER node
EXPOSE 3001
CMD [ "node", "dist/index.js" ]
