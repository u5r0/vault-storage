# ADR 0007: Monorepo Layout

**Status:** Accepted
**Date:** 2026-05-16

## Decision

Use a monorepo structure with pnpm workspaces to manage multiple packages and applications.

## Structure

```
vault-storage/
├── apps/
│   ├── server/      # Hono API server
│   └── web/         # Vue 3 frontend
├── packages/
│   └── sdk/         # Shared SDK package
├── tests/
│   └── integration/ # Integration tests
└── docs/            # Documentation
```

## Technical Details

**Package Manager:** pnpm with workspaces

**Packages:**
- `@vault/server` - API server (Hono, TypeScript)
- `@vault/web` - Frontend app (Vue 3, Vite)
- `@vault/sdk` - Shared SDK (Zod schemas, client)

**Shared Dependencies:**
- TypeScript configuration at root
- Shared dev dependencies in root package.json
- Internal dependencies via workspace protocol

## Consequences

**Positive:**
- Single repository for all code
- Shared TypeScript configuration
- Easy local development with single command
- Atomic changes across packages

**Negative:**
- Larger repository
- CI/CD complexity for independent deployments
- Potential coupling between packages

## References

- Private ADR: `docs/adr-private/0002-monorepo-layout.md`
