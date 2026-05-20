# ADR 0006: Cosmos DB and ID-Based Routing

**Status:** Accepted
**Date:** 2026-05-19

## Decision

Use Azure Cosmos DB as the primary database with ID-based entity identifiers for all resources (users, files, folders).

## Technical Details

**Database:**
- Azure Cosmos DB with SQL API
- Single collection for all entities with `type` field for discrimination
- Document model with `id` as primary key
- Hierarchical relationships via `parentId` field

**Entity Schema:**
- Files: `{ id, type: "file", name, parentId, size, contentType, ... }`
- Folders: `{ id, type: "folder", name, parentId, ... }`
- Users: `{ id, type: "user", email, passwordHash, ... }`

**Routing:**
- Frontend routes use entity IDs: `/contents/:entityId`
- Path is a derived field, not the identifier
- Enables instant directory rendering via single query
- O(1) folder moves (just update parentId)

## Consequences

**Positive:**
- Instant directory rendering
- Efficient folder moves
- Rich metadata support
- Scalable to millions of entities

**Negative:**
- Requires Cosmos DB (cost in production)
- More complex than path-based storage
- Migration from path-based to ID-based required

## References

- Private ADR: `docs/adr-private/0007-auth-and-identity-migration.md`
