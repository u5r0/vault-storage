# ADR 0003: Path as identifier (for now), unique IDs deferred

**Status:** Accepted, time-bound (revisit when ADR-0001-style metadata lands)
**Date:** 2026-05-17

## Context

A `VaultEntry` is identified today by its `path` field — the full blob name
inside the Azure container (e.g., `Movies/Action/movie.mp4`). Every API
endpoint accepts a `path`, and the frontend uses `path` as the row key, the
selection key, and the URL segment.

The question raised: should we move to opaque unique IDs (UUID / nanoid /
ULID) for files and folders instead?

This is a real architectural decision. It is coupled to:

- [ADR 0001](0001-sdk-as-shared-contract.md) — wire contract shape.
- Gap #3 — metadata persistence (stars, tags, trash, recents).
- Gap #2 — auth and multi-tenancy.

## Options considered

### A. Path as ID (current)

Identity is the path. No translation layer.

**Pros**

- Matches Azure Blob Storage natively. The blob name *is* the path. No
  mapping table needed.
- No database required for basic CRUD.
- URLs are human-readable: `/files/Movies/Action/movie.mp4`.
- Listing a folder is a single prefix scan.
- Migration cost is zero — we already have it.

**Cons**

- **Rename or move breaks identity.** A file's URL changes when renamed.
  Old links 404. Bookmarks rot.
- **Metadata attached by path orphans on rename.** If "user starred
  `Movies/foo.mp4`" is keyed by path, renaming `Movies` → `Films` orphans
  the star. Same for tags, trash, share links, audit log.
- **No history or versioning.** Can't track "this file used to be at X".
- **Path collisions in multi-tenant systems.** Two users with the same
  folder name need a discriminator anyway.

### B. Unique opaque IDs (UUID / nanoid)

Identity is a stable opaque key. `path` becomes a derived attribute.

**Pros**

- Identity survives rename, move, re-parenting.
- Metadata (stars, tags, ACLs, share links, version history) keys cleanly
  against a stable identifier.
- Sharing links don't break.
- Multi-tenancy is straightforward.

**Cons**

- **Requires a metadata database.** Mapping ID ↔ path lives somewhere.
  This is gap #3 anyway — they are linked decisions.
- **Listing now needs DB query plus blob scan**, or DB-only with eventual
  consistency.
- **URLs become opaque:** `/files/abc123` instead of
  `/files/Movies/Action/movie.mp4`. Discoverable URLs are valuable.
- **Storage layout decision becomes harder.** Do we store blobs at
  `/${id}` (rename is free, listing requires DB) or at `/${path}` (rename
  is a blob copy, listing is free)? Each has trade-offs.

### C. Hybrid: storage path-based, application ID-based

The pattern most large-scale file systems converge on. Storage layer (S3,
Azure Blob, FS) is path-based because that's its primitive. Application
layer wraps storage with stable IDs.

**Pros**

- Best of both worlds *eventually*.
- Public URLs can stay pretty (rendered from path) while internal
  references stay stable (via ID).
- Aligns with what Dropbox, Google Drive, OneDrive, iCloud actually do.

**Cons**

- The most complex. Requires DB, mapping logic, and a clear convention for
  which API endpoints accept which.
- Premature complexity if we don't yet need rename-stable metadata.

## What real systems do

For reference, since the question was raised:

- **S3 / Azure Blob:** pure path-based. They are storage primitives, not
  application layers.
- **Dropbox API:** dual addressing. Endpoints accept `path` or `id:abc123`.
  Internal stable IDs survive rename. Most operations work either way.
- **Google Drive:** ID-based. Path is a derived view via `parents`
  references. Files can have multiple parents (or used to).
- **OneDrive / iCloud:** ID-based with path as a secondary lookup.

The pattern: **storage layer is path-based; application layer is ID-based.**
Storage doesn't care about identity stability. Applications do.

## Decision

**Stay on Option A (path as ID). Plan the move to Option C when gap #3
(metadata persistence) is implemented. Do not adopt Option B in isolation.**

The two decisions — "introduce stable IDs" and "introduce a metadata DB" —
are the same decision. Doing one without the other is a half-measure with
none of the durability benefits and most of the cost.

## Triggers for revisiting

We will revisit this ADR — and execute the migration to Option C — when
**any** of the following are true:

- Star, tag, trash, recents, or share-link features are being implemented
  (gap #3).
- Auth and per-user state are being added (gap #2). Multi-tenancy makes
  path-only identity untenable.
- A consumer reports rotted bookmarks or share links from a rename event.
- We need version history or audit log keyed against a file.

## Migration plan (when triggered)

When the trigger fires, the migration looks like:

1. Add a metadata table: `files (id uuid pk, owner_id, current_path,
   created_at, deleted_at, ...)`. DB is source of truth for identity and
   per-user metadata.
2. Decide blob storage layout. Two viable options:
   - **By ID:** blob stored at `${id}`. Rename is a single DB row update,
     no blob copy. Listing requires DB query. Pretty paths are derived.
   - **By path:** blob stored at `${current_path}`. Rename is a blob copy
     plus DB update. Listing can use blob prefix scan. Pretty paths are
     native.
   Recommendation at decision time: **by ID**, because rename-as-DB-update
   is the whole reason to move off path-as-ID. Make rename free; pay the
   cost on listing where DB indexes help.
3. Extend the SDK contract:
   - `VaultEntrySchema` gains `id: string` (uuid) alongside `path`.
   - `path` remains in responses as the rendered, current path. It is no
     longer the identifier.
   - Endpoints accept `id` for write operations (rename, delete, star,
     tag) and `path` for navigation/discovery (list, search).
4. Migrate existing blobs: scan the container, for each file create a
   metadata row with `id = uuid(), current_path = blob.name`, optionally
   move blob to `${id}` if going with by-ID storage.
5. Update frontend: row key, URL routing, and cache use `id`. URLs
   continue rendering by path for shareability (`/files/Movies/Action`),
   but the canonical handle is `id`.

## Consequences of staying on A for now

### Positive

- Zero migration cost today.
- Frontend and SDK ship as-is.
- The wire contract from [ADR 0001](0001-sdk-as-shared-contract.md) is
  already in the right shape for the future migration — when `id` is
  added, it joins `path` in `VaultEntrySchema` and both sides update
  atomically through the SDK.

### Negative — explicit known limitations

- Renaming a blob breaks any URL or external reference to it.
- We must not implement star/tag/trash/share features until this ADR is
  revisited. Doing so on top of path-keyed metadata creates technical
  debt that compounds.
- Folder rename is intentionally not implemented in the API today
  (`server/routes/files.ts` only renames files). This sidesteps the worst
  case — folder rename invalidating every descendant's path — but is a
  known gap users may demand.

### Neutral

- The `path` field stays in the public contract. After migration it
  remains in the contract as the rendered current path; only its role
  changes from "identifier" to "current rendered location".

## References

- [ADR 0001](0001-sdk-as-shared-contract.md) — SDK as shared contract.
- Gap analysis: gap #3 (metadata persistence) is the linked work.
- Pattern reference: Dropbox API dual-addressing
  (`{".tag": "id", "id": "id:abc123"}` vs `{".tag": "path", "path": "/foo"}`).
