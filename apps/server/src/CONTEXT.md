# Backend Context

## Glossary

**VaultEntry**
A single item returned by the files API. Represents either a file or a virtual folder stored in Azure Blob Storage. Shape:
```ts
{
  name: string        // bare filename or folder name (no path prefix)
  path: string        // full blob path, e.g. "Movies/Action/movie.mp4"
  type: "file" | "folder"
  size: number        // bytes (0 for folders)
  contentType: string | null
  modifiedAt: string | null  // ISO 8601
}
```

**Virtual Folder**
A folder that exists only as a blob name prefix. Materialised by a zero-byte `.vault-keep` placeholder blob. Never surfaced to the client.

**Container**
The Azure Blob Storage container that holds all vault blobs. Configured via `AZURE_STORAGE_CONTAINER_NAME`.

**Prefix**
The folder path with a trailing slash used as a delimiter when listing blobs, e.g. `"Movies/Action/"`.

**Wire contract**
All request bodies, query schemas, and response shapes are defined as Zod schemas in `@vault/sdk` and imported by routes. The server does not redefine `VaultEntry` or any DTO locally. See [ADR 0001](../../../docs/adr/0001-sdk-as-shared-contract.md).

**Local dev backend (Azurite)**
The `AzureBlobStore` adapter is exercised locally against [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite), Microsoft's official Azure Blob emulator. Started by `pnpm azurite` (auto-launched by `pnpm dev`). Same REST API as production Azure — switching deploy targets is one env var. See [ADR 0004](../../../docs/adr/0004-azurite-for-local-dev.md). Seed sample data with `pnpm seed`.

**Test app (`createApp`)**
`apps/server/src/app.ts` exports `createApp({ withLogger? })` returning a fresh Hono instance. The runtime entry (`apps/server/src/index.ts`) calls it with `{ withLogger: true }` and wraps with `serve()`. Tests call it without args and dispatch via `app.request(...)` — no port binding.

**Integration test harness**
Vitest's `integration` project boots a single Azurite child process in `--inMemoryPersistence` mode on a random free port (see `tests/setup/azurite.global.ts`), `provide()`s a connection string + unique container name, and per-worker `tests/setup/azurite.env.ts` sets `AZURE_STORAGE_*` before any server module loads. `beforeEach` calls `store.deletePrefix("")` to reset state. See [ADR 0005](../../../docs/adr/0005-testing-strategy.md).
