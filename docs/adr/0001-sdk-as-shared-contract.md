# ADR 0001: SDK as the shared wire contract

**Status:** Accepted
**Date:** 2026-05-17

## Context

We had a duplicated `Entry` type in `server/routes/files.ts` that mirrored
`VaultEntrySchema` in `packages/sdk`. Request body schemas (`folderBody`,
`renameBody`, `deleteBody`) lived only in the server, while the SDK's
`VaultClient` defined matching parameter types by hand. Two separate sources
of truth for the same wire contract meant drift was inevitable: rename a field
in one place and the other side breaks silently at runtime.

Three approaches were considered:

### A. Directus-style — independent types, no shared schemas

Each side owns its own types. Drift caught by contract tests.

The Directus SDK does this because Directus is a generic CMS — schemas are
*user-defined at runtime per collection*. They literally cannot share static
schemas.

### B. SDK shares only entity types

Server imports `VaultEntrySchema` for response entities, but request body
schemas stay in the server, duplicated implicitly through `VaultClient`
parameter types.

### C. SDK owns the entire wire contract

Every request body, every response shape, every entity is defined as a Zod
schema in the SDK. Server imports them and uses them for validation. Client
derives its parameter and return types from the same schemas.

## Decision

**We chose C.**

The Directus constraint (dynamic schemas) does not apply to this app. Our
schemas are fixed and known at build time. We are in a pnpm monorepo with
`workspace:*` deps, so cross-package imports cost nothing. Drift bugs cost
real time.

### What lives in `@vault/sdk`

- **Entity schemas:** `VaultEntrySchema` and inferred `VaultEntry`.
- **Request schemas:** `ListFilesQuery`, `CreateFolderBody`, `RenameBody`,
  `DeleteBody` plus their inferred `*Input` types.
- **Response schemas:** `ListFilesResponse`, `CreateFolderResponse`,
  `UploadResponse`, `RenameResponse`, `DeleteResponse` plus their inferred
  `*Result` types.
- **Client:** `VaultStore` interface, `VaultClient` class, `createVaultClient`
  factory. All method signatures are typed against the schemas above.

### What the server does

- Imports request schemas from `@vault/sdk` and passes them straight to
  `zValidator` from `@hono/zod-validator`.
- Uses `VaultEntry` as the type for entries it builds.
- Does not import the response schemas at runtime today — they exist for the
  client and for future response-shape validation (see Future Work).

### What the frontend does

Unchanged. It already used `VaultEntry` from the SDK; the new schemas are
behind the same `VaultClient` it was already calling.

## Consequences

### Positive

- **Single source of truth.** A schema change is a single-file edit and both
  sides recompile against the new shape.
- **Server gains type-checked request validation.** `zValidator` infers
  parameter types from the imported Zod schemas, no manual typing required.
- **Future API surfaces are cheap.** When auth is added (gap #2), `LoginBody`,
  `Session`, `User` schemas live in the SDK from day one. When per-user
  metadata lands (gap #3), same story.
- **OpenAPI for free, eventually.** The schemas are runtime objects that can
  be fed to `zod-to-openapi`, generating Swagger UI without hand-written
  specs.

### Negative

- **Server depends on a package conventionally seen as "the client SDK."**
  Mitigation: the SDK package contains zero browser-only code at the schema
  level; the `VaultClient` class uses `fetch` and `FormData` which exist in
  Node 18+ as well. Schemas import only from `zod`.
- **Schema changes cannot diverge between server-internal and public.** This
  is arguably a feature: anything internal that needs to differ should live
  in the server, not in the wire contract.

### Neutral

- The SDK now exports more public symbols. Tree-shaking handles unused ones
  in the browser bundle.

## Future work

- **Outgoing response validation in dev.** Wrap each route's `c.json(...)`
  with the matching response schema's `.parse()` behind a `NODE_ENV=development`
  flag. This catches drift between the schema and what handlers actually
  return.
- **Generate OpenAPI from the schemas.** Use `@asteasolutions/zod-to-openapi`
  or similar.
- **Move auth and metadata schemas here when those gaps are addressed.**

## References

- Gap analysis item: `docs/gap-analysis.md` — "VaultEntry vs Entry duplication"
- Pattern inspiration: Directus SDK (`@directus/sdk`) — chose to deviate
  because their dynamic-schema constraint does not apply here.
