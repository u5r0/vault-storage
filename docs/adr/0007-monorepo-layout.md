# ADR 0007: Monorepo Layout

**Status:** Accepted  
**Date:** 2026-05-16  
**Updated:** 2026-05-21 (reflects current structure after ADR 0015/0016/0017)

## Decision

Use a monorepo structure with pnpm workspaces to manage multiple packages and applications.

## Structure

```
vault-storage/
├── apps/
│   ├── server/          # Hono API server
│   │   └── src/
│   │       ├── controllers/   # HTTP layer (thin adapters)
│   │       ├── services/      # Business logic + co-located unit tests
│   │       ├── middleware/     # authenticate, rate-limit
│   │       ├── lib/           # Pure utilities (auth, azure, cookies, email…)
│   │       ├── __setup__/     # Test infrastructure (Azurite + Cosmos global setup)
│   │       ├── app.ts         # createApp() factory
│   │       └── index.ts       # Runtime entry point
│   └── web/             # Vue 3 frontend
│       └── src/
│           ├── modules/       # Feature slices (files, upload, auth, settings, profile)
│           ├── components/    # Global v-* primitives + register.ts
│           ├── stores/        # Global Pinia stores (auth, files, settings, ui)
│           ├── layouts/       # AppLayout, AuthLayout
│           ├── composables/   # Shared composables (useAsync)
│           └── lib/           # client.ts, format.ts
├── packages/
│   └── sdk/             # Shared SDK — Zod schemas + VaultClient
└── docs/                # ADRs and documentation
```

## Technical Details

**Package manager:** pnpm with workspaces

**Packages:**
- `@vault/server` — API server (Hono, TypeScript)
- `@vault/web` — Frontend app (Vue 3, Vite, Pinia)
- `@vault/sdk` — Shared SDK (Zod schemas, `VaultClient`)

**Shared configuration:**
- TypeScript config at root, extended per package
- Shared dev dependencies in root `package.json`
- Internal dependencies via `workspace:*` protocol

**Test layout:**
- Unit tests co-located with source (`services/*.test.ts`, `lib/*.test.ts`)
- Integration tests co-located with controllers (`controllers/*.test.ts`)
- Test infrastructure in `apps/server/src/__setup__/`
- Root `tests/` reserved for future cross-cutting e2e tests

## Consequences

**Positive:**
- Single repository for all code
- Shared TypeScript configuration
- Easy local development with a single `pnpm dev` command
- Atomic changes across packages

**Negative:**
- Larger repository
- CI/CD complexity for independent deployments
- Potential coupling between packages

## References

- [ADR 0008: Application Architecture](0008-application-architecture.md) — detailed backend and frontend structure
- Private ADR: `docs/adr-private/0002-monorepo-layout.md`
