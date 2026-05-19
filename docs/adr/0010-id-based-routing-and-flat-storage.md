# ADR 0010: ID-based routing and flat storage implementation

**Status:** Implemented
**Date:** 2026-05-19
**Supersedes:** ADR 0003 (path-as-identifier)

## Context

ADR 0003 deferred the migration to ID-based routing until metadata persistence (gap #3) was implemented. However, with the decision to use Azure Cosmos DB with a document model (ADR 0007), we now have the metadata infrastructure in place to support ID-based routing.

The previous path-based system had these limitations:
- Rename or move breaks identity (URLs change, bookmarks rot)
- Metadata attached by path orphans on rename
- No history or versioning tracking
- Path collisions in multi-tenant systems

## Decision

**Implement ID-based routing with flat blob storage.**

### Storage Layer Design

**Azure Blob Storage**: Flat structure with blobs stored at `vault/blobs/{nanoid}`
- Blob name is ONLY the ID (e.g., `vault/blobs/V1StGXR8_Z5jdHi6B-myT`)
- No hierarchical folder structure in blob storage
- Rename/move is a single DB update (no blob copy)

**CosmosDB/SQLite**: Stores ID-to-name relationship and hierarchy
- `id`: The nanoid (primary identifier)
- `name`: Original filename (human-readable)
- `blobName`: Azure blob path (`vault/blobs/{id}`)
- `parentId`: Hierarchy reference for folder structure
- `isFavorite`, `tags`, `deletedAt`: Metadata for Quick Links

### API Changes

**Router**: Changed from `/files/:path(.*)*` to `/content/:entityId?`
- All navigation uses entity IDs (UUID/nanoid)
- URLs are now ID-based (e.g., `/content/V1StGXR8_Z5jdHi6B-myT`)

**Endpoints**: Updated to accept `entityId` instead of `path`
- `GET /api/files?entityId=uuid` - list children of folder
- `POST /api/files/upload` - upload with `parentId`
- `GET /api/files/download?id=uuid` - download by ID
- `PATCH /api/files/rename` - rename by ID
- `PATCH /api/files/move` - move by ID
- `DELETE /api/files` - delete by ID

**Removed**: Legacy `GET /api/files/sas?path=...` endpoint (SAS-based uploads replaced with direct POST)

### Database Schema Changes

Added to `vaultEntries` table:
- `isFavorite`: Text field ("0" or "1") for starred items
- `tags`: Text field (JSON array) for tags
- `deletedAt`: Text field (timestamp) for soft delete (trash)

### Frontend Changes

- Removed path-based breadcrumbs navigation
- Updated all components to use `file.id` instead of `file.path`
- Updated upload flow to use `POST /api/files/upload` with `parentId` instead of SAS URLs
- Quick Links now fetch real data from `GET /api/files/quick-links` endpoint
- Sidebar tree removed (will be loaded from CosmosDB hierarchy in future)

## Consequences

### Positive

- Identity survives rename, move, re-parenting
- Metadata (stars, tags, trash) keys cleanly against stable identifiers
- Rename is O(1) DB update instead of blob copy
- Multi-tenancy is straightforward
- Storage layer is decoupled from application structure

### Negative

- URLs are opaque (not human-readable paths)
- Requires database for all operations (no pure blob scan listing)
- Migration effort (completed)

### Neutral

- The `path` field remains in the database schema for potential backward compatibility
- Could be recomputed from `parentId` hierarchy if needed

## Migration

The migration was completed in a single step:
1. Updated database schema to add `isFavorite`, `tags`, `deletedAt`
2. Updated all API endpoints to use ID-based parameters
3. Updated frontend routing and components to use IDs
4. Removed legacy path-based endpoints
5. Updated upload flow from SAS-based to direct POST

No data migration was needed since the system was already using nanoid IDs internally.

## References

- [ADR 0003](0003-path-as-identifier.md) - Path as identifier (superseded)
- [ADR 0007](0007-auth-and-identity-migration.md) - Cosmos DB metadata architecture
- [ADR 0001](0001-sdk-as-shared-contract.md) - SDK as shared contract
