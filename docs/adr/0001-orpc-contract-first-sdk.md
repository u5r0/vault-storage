# ADR 0001 — oRPC contract-first SDK

**Status:** Accepted  
**Date:** 2026-05-16

## Context

The frontend (Vue 3) and backend (Hono + Azure Blob Storage) were completely disconnected. The frontend used hardcoded mock data (`src/data/files.ts`). We needed a typed, maintainable bridge.

Options considered:
- tRPC — RPC-style, requires importing router type from server into frontend
- Directus-style typed REST commands — hand-rolled command descriptors
- oRPC contract-first — contract defined once in a shared package, server implements it, frontend consumes a typed client

## Decision

Use **oRPC contract-first** with a `packages/sdk/` workspace package (`@vault/sdk`).

- Contract lives in `packages/sdk/src/index.ts` using `@orpc/contract`
- Server implements the contract via `@orpc/server`, mounted on Hono via `RPCHandler`
- Frontend uses `@orpc/client` with `RPCLink` pointing at `/api/rpc`
- `VaultEntry` is defined once in the contract's output schema

## Consequences

- `server/routes/files.ts` is replaced by an oRPC router implementing the contract
- The old Hono file routes (`/api/files/*`) are removed
- Frontend-only display fields (`starred`, `tags`, `items`, `ext`) are dropped for now — they have no backing storage
- `modified` field renamed to `modifiedAt` (ISO 8601, consistent naming)
- `POST /api/files/folder` renamed to `POST /api/files/folders` (REST plural noun convention)
