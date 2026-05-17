# ADR 0002: Monorepo layout — apps + packages

**Status:** Accepted, executed 2026-05-17
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

**Adopted Option A. Executed 2026-05-17 after Phase A tests landed.**

Option A is the recommended structure and was what the project was already
implicitly heading toward (the SDK was already a workspace package). The
migration was mechanical but touched ~50 files. We executed earlier than
originally planned because Phase A tests were green and the deferral
rationale (auth/metadata schemas yet to land) no longer outweighed the
ongoing friction of the hybrid layout.

Executed migration:

1. Created `apps/web/` and `apps/server/`.
2. Moved `app/*` → `apps/web/src/*`; moved `index.html`, `vite.config.ts`,
   `public/` → `apps/web/`.
3. Moved `server/*` → `apps/server/src/*`; moved `scripts/seed.ts` →
   `apps/server/scripts/seed.ts`.
4. Created `apps/web/package.json` (`@vault/web`) and `apps/server/package.json`
   (`@vault/server`). Each lists only its own runtime deps plus
   `@vault/sdk: workspace:*`.
5. Slimmed root `package.json` to orchestration + dev-only tooling
   (`concurrently`, `azurite`, `tsx`, `typescript`, `vitest`,
   `@changesets/cli`, `@types/node`).
6. Updated `pnpm-workspace.yaml` to `packages: ["apps/*", "packages/*"]`.
7. Per-app tsconfigs under each app dir; `@/*` alias in `apps/web` now points
   at `./src/*`. Root `tsconfig.json` references the per-app projects plus
   `tsconfig.test.json`.
8. Updated `CONTEXT-MAP.md`, `README.md`, `CONTRIBUTING.md`, `docs/agents/domain.md`,
   `tests/README.md`, and the `dev`, `dev:web`, `dev:api`, `build`, `start`,
   `preview`, `seed` scripts.
9. Updated `vitest.config.ts` include patterns and the integration test
   imports (`tests/integration/files.test.ts`) to the new paths.
10. Smoke-test build of each app in CI is deferred until CI lands (gap #16).

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
