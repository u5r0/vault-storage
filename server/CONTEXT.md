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
All request bodies, query schemas, and response shapes are defined as Zod schemas in `@vault/sdk` and imported by routes. The server does not redefine `VaultEntry` or any DTO locally. See [ADR 0001](../docs/adr/0001-sdk-as-shared-contract.md).
