# Storage Abstraction

## Overview

The storage layer is abstracted through the `BlobStore` interface, allowing you to swap storage backends without changing route logic.

## Architecture

```
Routes (files.ts)
    ↓
BlobStore Interface (storage.ts)
    ↓
AzureBlobStore Adapter (azure-blob-store.ts)
    ↓
Azure Blob Storage SDK
```

## Files

### `storage.ts`
Defines the `BlobStore` interface with methods for:
- `list(prefix)` - List files and folders
- `exists(path)` - Check if a blob exists
- `upload(path, data, options)` - Upload a file
- `download(path)` - Download a file as a stream
- `copy(from, to)` - Copy a file
- `delete(path)` - Delete a file
- `deletePrefix(prefix)` - Delete all files with a prefix (folder deletion)

### `azure-blob-store.ts`
Azure Blob Storage implementation of `BlobStore`:
- Uses `@azure/storage-blob` SDK
- Handles folder emulation with `.vault-keep` files
- Converts Azure-specific types to generic `BlobStore` types

### `azure.ts`
Configuration and initialization:
- Loads Azure credentials from environment
- Creates and caches container client
- Exports `getBlobStore()` factory function

## Usage

```typescript
import { getBlobStore } from '../lib/azure'

// In your route handler
const store = await getBlobStore()

// List files
for await (const item of store.list('documents/')) {
  if (item.kind === 'folder') {
    console.log('Folder:', item.path)
  } else {
    console.log('File:', item.metadata.name, item.metadata.size)
  }
}

// Upload
await store.upload('path/to/file.txt', buffer, {
  contentType: 'text/plain'
})

// Download
const { stream, metadata } = await store.download('path/to/file.txt')

// Copy/rename
await store.copy('old/path.txt', 'new/path.txt')

// Delete
await store.delete('path/to/file.txt')

// Delete folder
const deleted = await store.deletePrefix('folder/')
```

## Adding New Storage Backends

To add support for S3, local filesystem, or other storage:

1. **Create adapter** (e.g., `s3-blob-store.ts`):
```typescript
import type { BlobStore } from './storage'

export class S3BlobStore implements BlobStore {
  // Implement all BlobStore methods
  async list(prefix: string) { /* ... */ }
  async exists(path: string) { /* ... */ }
  // ... etc
}
```

2. **Update factory** in `azure.ts` (or create new config file):
```typescript
export async function getBlobStore(): Promise<BlobStore> {
  if (env.storageType === 's3') {
    return new S3BlobStore(/* config */)
  }
  return new AzureBlobStore(await getContainer())
}
```

3. **Routes stay unchanged** - they only depend on the `BlobStore` interface

## Benefits

✅ **Testable** - Mock `BlobStore` for unit tests  
✅ **Flexible** - Swap storage backends easily  
✅ **Clean** - Routes don't know about Azure specifics  
✅ **Type-safe** - Interface enforces consistent behavior  
✅ **Maintainable** - Storage logic isolated from business logic
