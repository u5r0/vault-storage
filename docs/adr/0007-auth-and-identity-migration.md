# ADR 0007: Authentication, Identity, and Database Introduction

**Status:** Proposed
**Date:** 2026-05-17
**Amended:** 2026-05-18 — DB choice consolidated to PostgreSQL in both dev and prod (was SQLite for dev).
**Amended:** 2026-05-19 — DB choice changed from PostgreSQL to Azure Cosmos DB (NoSQL document model) for optimal nested folder performance and metadata querying.

## Context

The application currently has no authentication (Gap #2) and uses path-as-identifier for files (ADR 0003). As identified in ADR 0003, adding authentication and per-user state is the trigger to migrate to stable opaque identifiers and introduce a metadata database (Gap #3).

We need a secure way to:
1. Register and authenticate users.
2. Manage long-lived sessions (Refresh Tokens).
3. Link storage blobs to specific users (Multi-tenancy).
4. Store metadata that survives renames and moves.
5. Enable instant folder navigation, favorites, and tag searching across nested hierarchies.

## Decision

We will introduce a centralized Authentication and Identity system coupled with Azure Cosmos DB using a document model.

### 1. Technology Stack
- **Database:** **Azure Cosmos DB** (NoSQL API for MongoDB or Core SQL API) using a document model. A single collection stores both folders and files with a `parentId` field for hierarchy. This enables O(1) folder moves, instant directory rendering via single queries, and powerful metadata filtering (favorites, tags, search) without recursive scans.
- **Local development:** **Cosmos DB Emulator** for local development (Docker-based, similar to Azurite). This provides the full Cosmos DB feature set locally without requiring cloud resources.
- **SDK:** **@azure/cosmos** (Node.js SDK) for database operations.
- **Storage Layout:** Blobs stored in Azure Blob Storage using unique IDs (GUIDs) as blob names. The database holds all metadata including hierarchy, names, tags, favorites, and custom metadata.
- **Hashing:** **Argon2id** for password hashing.
- **Tokens:** **JWT** (JSON Web Tokens) for stateless authentication.

### 2. Session Management (JWT + Cookies)
To balance security and developer experience:
- **Access Token:** Short-lived (e.g., 15 min), stored in an **HttpOnly, Secure, SameSite=Lax** cookie.
- **Refresh Token:** Long-lived (e.g., 7 days), stored in an **HttpOnly, Secure, SameSite=Strict** cookie.
- **Rotational Refresh:** Refresh tokens will be rotated on every use to mitigate theft.
- **Storage:** Cookies are preferred over LocalStorage to prevent XSS-based token theft.

### 3. Identity Migration (Executing ADR 0003)
We will move from `path` to `uuid` as the primary identifier for all entities using a document model.

#### Document Model Schema (Cosmos DB)
A single collection stores both folders and files with a `parentId` field for hierarchy:

**Folder Document:**
```json
{
  "id": "folder_123",
  "userId": "user_abc",
  "type": "folder",
  "name": "Marketing Campaign 2026",
  "parentId": "folder_root",
  "createdAt": "2026-05-19T10:50:00Z"
}
```

**File Document:**
```json
{
  "id": "file_987",
  "userId": "user_abc",
  "type": "file",
  "name": "q3_budget.pdf",
  "parentId": "folder_123",
  "blobUrl": "https://mystorage.blob.core.windows.net/uploads/raw_file_unique_id.dat",
  "size": 5242880,
  "contentType": "application/pdf",
  "isFavorite": true,
  "metadata": {
    "Department": "Marketing",
    "Status": "Approved"
  },
  "tags": ["2026", "Budget", "PDF"],
  "createdAt": "2026-05-19T10:50:00Z",
  "modifiedAt": "2026-05-19T11:00:00Z"
}
```

**User Document:**
```json
{
  "id": "user_abc",
  "email": "user@example.com",
  "passwordHash": "argon2id_hash",
  "verified": true,
  "createdAt": "2026-05-19T10:00:00Z"
}
```

#### Storage Layout
- **Blob Storage:** Files stored in Azure Blob Storage using unique IDs (GUIDs) as blob names (e.g., `vault/blobs/<guid>`). No folder hierarchy in blob storage.
- **Database:** All metadata including hierarchy, names, tags, favorites, and custom metadata stored in Cosmos DB.
- **Hierarchy:** Implemented via `parentId` field. Root folder has `parentId: null` or `parentId: "folder_root"`.

#### Key Benefits
1. **Instant Directory Rendering:** Single query `SELECT * FROM c WHERE c.userId = 'user_abc' AND c.parentId = 'folder_123'` returns all subfolders and files.
2. **Instant Favorites/Search:** Single query across entire collection: `SELECT * FROM c WHERE c.userId = 'user_abc' AND c.isFavorite = true`.
3. **O(1) Folder Moves:** Moving a folder with 10,000 files requires updating exactly one record—the target folder's `parentId`.

### 4. Wire Contract Changes (@vault/sdk)
The SDK will be expanded to include:
- `LoginBody`, `RegisterBody` schemas.
- `User` entity schema.
- `VaultEntry` will gain `id`, `ownerId`, `parentId`, `isFavorite`, `tags`, and `metadata` fields.
- API routes will use IDs instead of paths for all operations (list, create, rename, delete).
- New route: `/content/:entityId?` for browsing by entity ID (folder or file).

### 5. Routing Changes (Web App)
The Vue Router configuration will change from path-based to ID-based routing:
- **Old:** `/files/:path(.*)*` — path parameter for nested folders
- **New:** `/content/:entityId?` — optional entity ID parameter (null = root folder)

This eliminates path-based URL encoding issues and aligns with the document model's ID-based hierarchy. The parameter is called `entityId` (not `folderId`) since it can represent either a folder or a file.

## Consequences

### Positive
- **Security:** API is protected; user data is isolated.
- **Stability:** Renaming a folder no longer breaks links or orphans metadata.
- **Scalability:** The system is now truly multi-tenant.
- **Foundation:** This enables Stars, Tags, and Sharing (Gap #3).
- **Performance:** Instant directory rendering via single Cosmos DB query with indexed `userId` and `parentId`.
- **Folder Operations:** O(1) cost for moving folders regardless of nested file count.
- **Metadata Power:** Instant favorites, tag search, and custom metadata filtering across entire hierarchy.
- **Azure Native:** Cosmos DB is fully managed, auto-scaling, and integrates with Azure ecosystem.

### Negative
- **Complexity:** Increased backend complexity (Cosmos DB SDK, document model, auth middleware).
- **Dependency:** The server now requires Azure Cosmos DB (cloud or emulator) in addition to Azure Blob Storage. Contributors must run Cosmos DB Emulator for local development.
- **Learning Curve:** Document model requires different mental model vs relational SQL.
- **Cost:** Cosmos DB has different pricing model than PostgreSQL (RU-based consumption).

### Neutral
- The `path` field in the API becomes a "virtual" property computed from the hierarchy for UI display, rather than the physical storage key.
- `better-sqlite3` and any SQLite-specific code are removed from the server; the existing `db.ts` boot path will be replaced by Cosmos DB client initialised from `COSMOS_DB_CONNECTION_STRING`.
- Test strategy (ADR 0005) updates: integration tests run against Cosmos DB Emulator (Docker-based, similar to Azurite).

## Future Work
- **OAuth2/Social Login:** Integration with GitHub/Google.
- **Invitations:** Allowing users to invite others to their vault.
- **Storage Quotas:** Enforcing limits per user.

## References
- [ADR 0003: Path as identifier](0003-path-as-identifier.md) (The trigger for this migration)
- [Gap Analysis](../gap-analysis.md) (Gaps #2 and #3)
