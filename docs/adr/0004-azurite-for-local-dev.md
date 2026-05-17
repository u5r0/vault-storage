# ADR 0004: Azurite as the local dev storage backend

**Status:** Accepted
**Date:** 2026-05-17

## Context

The `AzureBlobStore` adapter has not been exercised end-to-end against any
real Azure backend. The team has no Azure credentials configured locally,
and there is no sample dataset to drive the UI during development.

We need a way to:

1. Validate that `AzureBlobStore` actually works against the Azure REST API.
2. Develop UI features against realistic data without paying for or
   configuring a real Azure Storage account.
3. Avoid coupling local dev to network availability or external accounts.

The risk of building local-only alternatives (a filesystem adapter, an
in-memory store) before validating the Azure code path is that bugs in
`AzureBlobStore` stay hidden behind a working local adapter, surface in
production only, and erode trust in the `BlobStore` abstraction.

## Options considered

### A. Public API or someone else's Azure container

Point at a shared remote container.

**Rejected** — security risk, network dependency, no write surface,
doesn't test our own code path.

### B. `LocalFsBlobStore` adapter

Implement `BlobStore` against the local filesystem. The architecture
explicitly supports this (`server/lib/README.md`).

**Rejected for now** — adds ~100 lines of code that bypass the very code
path we need to validate. Useful later as a self-hosting / offline option,
but not the right first step.

### C. `InMemoryBlobStore`

Map-backed `BlobStore` for tests.

**Rejected for dev** — data evaporates on restart. Will be revisited when
gap #1 (no tests) is implemented; in-memory is the right fixture for unit
tests of route handlers.

### D. Azurite (Microsoft's official Azure Blob emulator)

Run Azurite locally. Point `AZURE_STORAGE_CONNECTION_STRING` at it. The
existing `AzureBlobStore` code runs unchanged.

**Accepted.**

## Decision

**Use Azurite as the local dev storage backend.**

Azurite exposes the same REST API as production Azure Blob Storage on
`localhost:10000`. Our existing code — `BlobServiceClient.fromConnectionString`,
`listBlobsByHierarchy`, `uploadData`, `download`, `beginCopyFromURL`,
`deleteBlob` — all run against it without modification.

### Setup

Use the npm distribution (no Docker requirement):

```bash
pnpm add -D -w azurite
```

Root script:

```json
"azurite": "azurite --silent --location ./.azurite-data --debug ./.azurite-data/debug.log"
```

Add `.azurite-data/` to `.gitignore`.

### Connection string

Azurite ships with fixed dev credentials. The connection string is:

```
DefaultEndpointsProtocol=http;
AccountName=devstoreaccount1;
AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;
BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;
```

These are publicly documented Azurite well-known credentials, safe to
commit to `.env.example` / `.env.development`.

### Seed script

Write a small script that uses the existing API (POST `/api/files/folder`
and POST `/api/files/upload`) to create a realistic sample tree:

```
Movies/
  Action/
  Documentary/
Documents/
  Notes.txt
Music/
```

This doubles as an end-to-end smoke test of the Azure code path.

## Consequences

### Positive

- The Azure code path is exercised every time we run the dev server.
- A real connection-string-driven backend is validated without an Azure
  account.
- No code changes — pure infra + configuration.
- The seed script produces the same data structure a real user would
  create, so UI work is realistic.
- Switching to production Azure is one env var change.

### Negative

- Adds a dev dep (~10 MB).
- Slightly slower dev start (Azurite needs ~1s warmup before API calls
  succeed).
- Azurite's emulation is *almost* complete but a few edge cases differ
  from production Azure (e.g., some lease and snapshot behaviours). For
  our current API surface (list, upload, download, copy, delete) this is
  not a concern.

### Neutral

- The `BlobStore` abstraction stays unimplemented for non-Azure backends.
  That's fine — the abstraction's value is contractual, not in shipping
  multiple adapters today.

## Triggers for revisiting

- We need self-hosting without Azure: implement `LocalFsBlobStore` against
  the existing interface.
- We need fast unit tests of route handlers: implement
  `InMemoryBlobStore` (gap #1).
- We outgrow Azurite emulation gaps: switch to a real Azure dev account.

## References

- [Azurite docs](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
- `server/lib/README.md` — describes the `BlobStore` abstraction.
- Gap analysis: "No local dev data" (new entry).
