# ADR 0002: Monorepo layout — apps + packages

**Status:** Accepted, deferred (not yet implemented)
**Date:** 2026-05-17

## Context

Today the repo is a hybrid:

```
vault-app/
├── package.json         ← contains BOTH frontend and server deps
├── app/                 ← frontend source, no package.json
├── server/              ← server source, no package.json
└── packages/sdk/        ← isolated package with its own package.json
```

`pnpm-workspace.yaml` includes `"."` so the root acts as a workspace member.
The SDK is a "real" package; `app/` and `server/` are just folders that the
root `package.json` happens to compile.

This causes:

- Server install pulls Vue, Vite, Tailwind into `node_modules` — pointless
  for a deployed API.
- Frontend install pulls Hono, Azure SDK, dotenv. Vite tree-shakes them out
  of the bundle, but the source tree carries them.
- No clean independent deploy. `pnpm deploy --filter server` has nothing to
  filter on.
- Dependency upgrades collide. Future divergent needs (e.g., different `zod`
  major) become harder.
- Type boundaries are conventional, not enforced. Nothing prevents
  `app/` from importing `server/lib/` directly.
- The root `package.json` is ambiguous: is it the frontend? The whole repo?

## Options considered

### A. Full apps + packages split

```
vault-app/
├── package.json              ← workspace root, dev tools only
├── pnpm-workspace.yaml       ← packages: ["apps/*", "packages/*"]
├── apps/
│   ├── web/
│   │   ├── package.json      ← vue, vue-router, lucide, tailwind, vite
│   │   └── src/
│   └── server/
│       ├── package.json      ← hono, @azure/storage-blob, dotenv, tsx
│       └── src/
└── packages/
    └── sdk/
```

The canonical pnpm / Turborepo / Nx layout. Each app deploys independently.

### B. Minimal split — extract server only

Keep root as the frontend, give server its own `package.json`. Less churn,
half the benefit. The root remains ambiguously "the frontend".

### C. Keep current

Defensible only while the project is tiny and deploys as one unit. Stops
being defensible the moment we need:

- Different deploy targets (Vercel for web, Fly/Render for API)
- A Dockerfile that doesn't ship Vite
- A second app (mobile, CLI, admin)
- CI that builds web and server independently

## Decision

**Adopt Option A. Defer execution.**

Option A is the recommended structure and is what the project is already
implicitly heading toward (the SDK is already a workspace package). The
migration is mechanical but touches ~30-50 files. We are deferring the work
because:

- Other gaps (auth, metadata persistence, tests) are higher value right now.
- The current layout still works for a single combined dev/deploy.
- Doing the migration after auth and metadata schemas land means we move
  those into `packages/` once instead of twice.

When we execute, the migration plan is roughly:

1. Create `apps/web/` and `apps/server/`.
2. Move `app/*` → `apps/web/src/*`; move `index.html`, `vite.config.ts` →
   `apps/web/`.
3. Move `server/*` → `apps/server/src/*`.
4. Create `apps/web/package.json` and `apps/server/package.json`. Each lists
   only its own runtime deps plus `@vault/sdk: workspace:*`.
5. Slim root `package.json` to dev-only tooling (`concurrently`,
   `typescript`, `vue-tsc`).
6. Update `pnpm-workspace.yaml` to `packages: ["apps/*", "packages/*"]`.
7. Adjust tsconfigs and `@/` path aliases per app.
8. Update `CONTEXT-MAP.md` and the `dev`, `dev:web`, `dev:api`, `build`,
   `start` scripts.
9. Add a smoke-test build of each app to CI when CI lands.

## Consequences

### Positive

- Each app has its own deps, build, deploy story.
- Type boundaries become enforced by package boundaries.
- New packages (`packages/auth`, `packages/db-schema`, etc.) slot in
  naturally.
- `pnpm deploy --filter server ./out/server` produces a self-contained
  server bundle.

### Negative

- Three `package.json` files to maintain instead of one. Mitigation:
  `syncpack` if drift becomes a problem.
- Slightly more ceremony to add a dep.
- One-time migration cost.

### Neutral

- `app/` and `server/` paths in docs and scripts will be stale until the
  migration. We will leave them for now and update them in the same change
  that performs the move.

## References

- Gap analysis item: `docs/gap-analysis.md` — "Monorepo layout"
- Related: ADR 0001 (SDK as shared contract) — Option A makes the SDK's
  role as the shared contract more visible.
