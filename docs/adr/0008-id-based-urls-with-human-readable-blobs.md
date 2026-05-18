# ADR 0008: ID-Based URLs with Human-Readable Blob Names

**Status:** Proposed
**Date:** 2026-05-18

## Context

ADR 0003 deferred the move from path-based to ID-based identifiers until metadata features were needed. ADR 0007 began the migration by adding `parentId` and `blobPath` fields to the schema. We now need to complete the migration with a specific approach for URLs and blob storage.

The challenge: How do we provide stable, shareable URLs while maintaining storage that's debuggable and human-friendly?

## Decision

We will adopt **ID-based URLs with human-readable blob names**, inspired by [Twenty](https://github.com/twentyhq/twenty)'s approach to file storage.

### 1. URL Structure

All API endpoints will use **UUID-based IDs** as the primary identifier:

```
GET /api/files/:id
PATCH /api/files/:id/rename
DELETE /api/files/:id
GET /api/files/:id/download
```

The `path` field becomes a **derived, computed property** used only for:
- Display in the UI (breadcrumbs, file tree)
- Optional backward compatibility for legacy clients
- Human-readable share links (e.g., `/share/:slug` can map to `:id`)

### 2. Blob Storage Strategy

Blobs will be stored with **human-readable names that include the original filename**, not opaque IDs:

```
vault/blobs/{uuid}/{original-filename}
# Example: vault/blobs/abc123-def456/movie.mp4
```

**Rationale:**
- **Debuggability**: When inspecting Azure Storage/Azurite, you can see what each blob actually contains
- **Recovery**: If the database is lost, blob names provide context for manual recovery
- **CDN/Edge caching**: Human-readable URLs work better with CDN caching and browser caching
- **Twenty's approach**: Twenty uses similar patterns where storage retains semantic meaning while application uses stable IDs

**Blob naming format:**
```
{container}/{uuid}/{sanitized-original-name}
```

Where:
- `uuid` = the entry's primary key (stable identifier)
- `sanitized-original-name` = original filename, sanitized for Azure blob naming rules

### 3. Database Schema Updates

The `vaultEntries` table already has the necessary fields from ADR 0007:

```sql
CREATE TABLE vault_entries (
  id TEXT PRIMARY KEY,              -- UUID, stable identifier
  owner_id TEXT,                    -- User ownership (multi-tenancy)
  parent_id TEXT,                   -- Hierarchical structure
  name TEXT NOT NULL,               -- Display name (original filename)
  path TEXT,                        -- Computed virtual path (for UI/compatibility)
  type TEXT NOT NULL,               -- 'file' or 'folder'
  size INTEGER DEFAULT 0,
  content_type TEXT,
  blob_path TEXT,                   -- Full blob path: "vault/blobs/{uuid}/{name}"
  blob_name TEXT,                   -- Legacy field, maps to blob_path
  created_at TEXT NOT NULL,
  modified_at TEXT
);
```

### 4. Path Computation

The `path` field is computed from the `parentId` hierarchy:

```typescript
function computePath(entry: VaultEntry, allEntries: VaultEntry[]): string {
  if (!entry.parentId) return entry.name
  
  const parent = allEntries.find(e => e.id === entry.parentId)
  if (!parent) return entry.name
  
  const parentPath = computePath(parent, allEntries)
  return `${parentPath}/${entry.name}`
}
```

This is computed on-demand and cached, or maintained via triggers.

### 5. API Contract Changes

**Request/Response changes:**

```typescript
// Before: path-based
GET /api/files/download?path=Movies/Action/movie.mp4

// After: ID-based
GET /api/files/abc123-def456/download
```

**SDK updates:**
- `VaultEntry` always includes `id` as required field
- `path` becomes optional/computed
- All write operations require `id`
- Navigation operations can accept either `id` or `path` for transition period

### 6. Migration Strategy

**Phase 1: Schema & Backend (Current)**
- ✅ Add `parentId`, `blobPath` fields (ADR 0007)
- ✅ Keep `path`, `blobName` for compatibility
- Update all DB queries to use `eq()` from drizzle-orm
- Implement `computePath()` function

**Phase 2: API Transition**
- Add `:id` parameter support to all endpoints
- Maintain `?path=` parameter support for backward compatibility
- Update responses to always include `id`
- Begin using `blob_path` format for new uploads

**Phase 3: Data Migration**
- For existing blobs:
  1. Generate UUID for each entry (if not present)
  2. Compute new blob path: `vault/blobs/{uuid}/{original-name}`
  3. Copy blob to new location
  4. Update `blob_path` in database
  5. Delete old blob after verification
- Compute and populate `path` field from hierarchy

**Phase 4: Frontend Migration**
- Update routing to use `:id` instead of `:path`
- Update component state to use `id` as key
- Update URL generation to use IDs
- Maintain pretty URLs via optional slug mapping

**Phase 5: Cleanup**
- Remove deprecated `?path=` parameter support
- Remove deprecated `blobName` field
- Consider adding indexes for `parentId` hierarchy queries

## Consequences

### Positive

- **Stable URLs**: Renaming/moving files no longer breaks links
- **Debuggable storage**: Blob inspection reveals actual content
- **Multi-tenancy ready**: UUID-based IDs prevent collisions
- **Metadata-friendly**: Stars, tags, share links work against stable IDs
- **CDN-friendly**: Human-readable blob names improve caching

### Negative

- **Increased complexity**: Path computation adds logic layer
- **Migration cost**: Existing blobs must be moved
- **Listing overhead**: Hierarchical listing requires DB queries (mitigated by indexes)
- **Storage overhead**: UUID adds to blob path length

### Neutral

- `path` remains in the API as a computed property for UI display
- Blob storage uses more characters (UUID + name vs just name)
- Requires database for all operations (already required by ADR 0007)

## References

- [ADR 0003](0003-path-as-identifier.md) - Original path-as-ID decision
- [ADR 0007](0007-auth-and-identity-migration.md) - Schema foundation (parentId, blobPath)
- [Twenty](https://github.com/twentyhq/twenty) - Inspiration for ID-based URLs with semantic storage
- [Dropbox API](https://www.dropbox.com/developers/documentation/http/documentation) - Dual addressing pattern (id + path)
