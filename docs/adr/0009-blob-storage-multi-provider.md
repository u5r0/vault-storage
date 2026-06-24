# ADR 0009: Blob Storage Multi-Provider Abstraction

**Status:** Accepted  
**Date:** 2026-06-24

## Context

The initial implementation used Azure Blob Storage exclusively. As the project matured, two needs emerged:

1. **Cost flexibility** — Cloudflare R2 has no egress fees and competitive storage pricing; supporting it as an alternative to Azure Blob avoids lock-in.
2. **Local dev parity for S3-compatible stores** — RustFS (an S3-compatible store) can be used locally alongside Azurite, enabling offline development without Azure credentials and providing a realistic test bed for the R2 code path.

## Decision

Introduce a `BlobStore` interface (`lib/storage.ts`) and a `BLOB_PROVIDER` environment variable that selects between two implementations at runtime. The HTTP layer never references a concrete adapter — all file operations go through `getBlobStore()` from `lib/blob-provider.ts`.

## Architecture

```
Files controller
    ↓
FilesService (calls getBlobStore())
    ↓
blob-provider.ts  ← dispatches on BLOB_PROVIDER env var
    ├── AzureBlobStore  (azure-blob-store.ts)  — default, Azure / Azurite
    └── R2BlobStore     (r2-blob-store.ts)     — Cloudflare R2 / RustFS / MinIO
```

### BlobStore Interface (`lib/storage.ts`)

All adapters implement:

| Method | Description |
|---|---|
| `list(prefix)` | Hierarchical listing (folders + files) |
| `exists(path)` | Check blob presence |
| `stat(path)` | Head metadata without downloading body |
| `upload(path, data, opts)` | Upload from Buffer, ReadableStream, or AsyncIterable |
| `download(path)` | Download as stream with metadata |
| `copy(from, to)` | Server-side copy |
| `delete(path)` | Delete single blob |
| `deletePrefix(prefix)` | Batch delete (folder deletion) |
| `createUploadUrl(path, opts)` | Presigned PUT URL for direct client upload |
| `createDownloadUrl(path, opts)` | Presigned GET URL for direct client download |

`PresignedUrl` includes an optional `requiredHeaders` map — Azure requires `x-ms-blob-type: BlockBlob` on PUT; S3/R2 does not. The SDK transparently forwards these headers so no provider-specific branching is needed in the frontend.

### Provider Selection (`lib/blob-provider.ts`)

```ts
// BLOB_PROVIDER defaults to "azure" — preserves current behavior
const provider = process.env.BLOB_PROVIDER ?? "azure"  // "azure" | "r2"
```

The store is lazy-initialized and cached on first call to `getBlobStore()`.

### Environment Variables

**Azure (`BLOB_PROVIDER=azure` or unset):**

| Variable | Purpose |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Preferred — full connection string |
| `AZURE_STORAGE_ACCOUNT_NAME` | Alternative to connection string |
| `AZURE_STORAGE_ACCOUNT_KEY` | Alternative to connection string |
| `AZURE_STORAGE_CONTAINER_NAME` | Container name (default: `vault`) |

**R2 / S3-compatible (`BLOB_PROVIDER=r2`):**

| Variable | Purpose |
|---|---|
| `R2_ACCESS_KEY_ID` | S3 access key |
| `R2_SECRET_ACCESS_KEY` | S3 secret key |
| `R2_ACCOUNT_ID` | Cloudflare account ID (omit when using `R2_ENDPOINT`) |
| `R2_ENDPOINT` | Override for local stores (RustFS, MinIO) |
| `R2_BUCKET_NAME` | Bucket name (default: `vault`) |

### Local Dev

`docker-compose.yml` runs both emulators so either provider can be exercised locally:

| Service | Provider | Port |
|---|---|---|
| `azurite` | Azure (`BLOB_PROVIDER=azure`) | 10000 |
| `rustfs` | R2 (`BLOB_PROVIDER=r2`) | 9000 (API), 9001 (console) |

### Testing

Integration tests run against Azurite by default (the `integration` Vitest project). The R2 adapter has its own adapter-level integration test (`lib/r2-blob-store.integration.test.ts`) verified against RustFS via a separate test project inclusion. Cross-provider confidence at the HTTP layer is provided by the unit test on `blob-provider.ts` (provider selection logic).

Root `package.json` exposes `test:integration:r2` (`BLOB_PROVIDER=r2 vitest run --project integration`) for optional full-stack R2 verification.

## Consequences

**Positive:**
- No storage lock-in — switching providers is one env var
- `BlobStore` interface is mock-friendly for unit tests
- `stat()` method enables server-side validation after presigned upload without re-downloading
- Presigned URL support (`createUploadUrl` / `createDownloadUrl`) enables direct browser-to-storage transfers, offloading bandwidth from the API server

**Negative:**
- Two adapters to maintain; each S3-compatible quirk (e.g. `forcePathStyle`, streaming checksums) must be handled in `R2BlobStore`
- R2 `ListObjectsV2` does not return `Content-Type` — files listed under R2 have `contentType: null` until a subsequent `stat()` call
- Azure virtual folders (``.vault-keep` marker blobs) are an Azure-specific detail not needed on R2; adapter-level divergence must not leak upward

## References

- [ADR 0008: Application Architecture](0008-application-architecture.md)
- `apps/server/src/lib/storage.ts` — BlobStore interface
- `apps/server/src/lib/blob-provider.ts` — provider dispatcher
- `apps/server/src/lib/azure-blob-store.ts` — Azure adapter
- `apps/server/src/lib/r2-blob-store.ts` — R2/S3 adapter
