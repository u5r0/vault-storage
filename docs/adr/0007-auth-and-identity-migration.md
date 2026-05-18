# ADR 0007: Authentication, Identity, and Database Introduction

**Status:** Proposed
**Date:** 2026-05-17
**Amended:** 2026-05-18 — DB choice consolidated to PostgreSQL in both dev and prod (was SQLite for dev).

## Context

The application currently has no authentication (Gap #2) and uses path-as-identifier for files (ADR 0003). As identified in ADR 0003, adding authentication and per-user state is the trigger to migrate to stable opaque identifiers and introduce a metadata database (Gap #3).

We need a secure way to:
1. Register and authenticate users.
2. Manage long-lived sessions (Refresh Tokens).
3. Link storage blobs to specific users (Multi-tenancy).
4. Store metadata that survives renames and moves.

## Decision

We will introduce a centralized Authentication and Identity system coupled with a SQL database.

### 1. Technology Stack
- **Database:** **PostgreSQL** in both local development and production. A single engine eliminates SQL dialect drift, lets us rely on Postgres-specific features (JSONB, partial indexes, `gen_random_uuid()`, `LISTEN/NOTIFY`, full-text search) without conditional code, and keeps migrations identical across environments.
- **Local install:** A **natively-installed PostgreSQL** instance on the contributor's machine (e.g., via `apt`, `brew`, `pacman`, or the official installer) — **not** Docker. Rationale: avoids container overhead for an always-on service, sidesteps Docker-on-Linux UID/permission friction, and Postgres is widely available in OS package managers. Azurite remains the only Docker dependency. `CONTRIBUTING.md` will document the install + `createdb vault_dev` bootstrap.
- **ORM:** **Drizzle ORM** via `drizzle-orm/node-postgres`.
- **Driver:** **`pg` (node-postgres)** — chosen over `postgres.js` for its larger ecosystem footprint, mature pooling (`pg.Pool`), and first-class Drizzle support. Connection pool initialised once in `db.ts` from `DATABASE_URL`.
- **Migrations:** `drizzle-kit` generating SQL migrations against the Postgres dialect; checked into the repo under `apps/server/drizzle/`.
- **Hashing:** **Argon2id** for password hashing.
- **Tokens:** **JWT** (JSON Web Tokens) for stateless authentication.

### 2. Session Management (JWT + Cookies)
To balance security and developer experience:
- **Access Token:** Short-lived (e.g., 15 min), stored in an **HttpOnly, Secure, SameSite=Lax** cookie.
- **Refresh Token:** Long-lived (e.g., 7 days), stored in an **HttpOnly, Secure, SameSite=Strict** cookie.
- **Rotational Refresh:** Refresh tokens will be rotated on every use to mitigate theft.
- **Storage:** Cookies are preferred over LocalStorage to prevent XSS-based token theft.

### 3. Identity Migration (Executing ADR 0003)
We will move from `path` to `uuid` as the primary identifier for all entities.
- **User Entity:** `id (uuid)`, `email`, `password_hash`, `created_at`.
- **VaultEntry Entity:** `id (uuid)`, `owner_id (fk)`, `name`, `parent_id (fk)`, `type`, `size`, `content_type`, `blob_path`.
- **Storage Layout:** Blobs will be stored in Azure using their `id` as the blob name (e.g., `vault/blobs/<uuid>`). The `blob_path` in the DB maps the virtual hierarchy. This makes renames/moves a simple DB update.

### 4. Wire Contract Changes (@vault/sdk)
The SDK will be expanded to include:
- `LoginBody`, `RegisterBody` schemas.
- `User` entity schema.
- `VaultEntry` will gain `id` and `ownerId`.

## Consequences

### Positive
- **Security:** API is protected; user data is isolated.
- **Stability:** Renaming a folder no longer breaks links or orphans metadata.
- **Scalability:** The system is now truly multi-tenant.
- **Foundation:** This enables Stars, Tags, and Sharing (Gap #3).

### Negative
- **Complexity:** Increased backend complexity (DB migrations, auth middleware).
- **Dependency:** The server now requires a running PostgreSQL instance in addition to Azure/Azurite. Contributors must install Postgres natively and create the dev database before `pnpm dev` works.
- **Performance:** Listing files now requires a DB query (mitigated by indexing).
- **Heavier local setup vs. SQLite:** No single-file `:memory:` fallback; native Postgres install required. Justified by metadata volume expectations and dev/prod parity.

### Neutral
- The `path` field in the API becomes a "virtual" property computed or stored for UI display, rather than the physical storage key.
- `better-sqlite3` and any SQLite-specific code are removed from the server; the existing `db.ts` boot path will be replaced by a Postgres connection pool initialised from `DATABASE_URL`.
- Test strategy (ADR 0005) updates: integration tests run against an ephemeral Postgres (Docker container per test run, or `pg-mem` if it proves sufficient — TBD at implementation time).

## Future Work
- **OAuth2/Social Login:** Integration with GitHub/Google.
- **Invitations:** Allowing users to invite others to their vault.
- **Storage Quotas:** Enforcing limits per user.

## References
- [ADR 0003: Path as identifier](0003-path-as-identifier.md) (The trigger for this migration)
- [Gap Analysis](../gap-analysis.md) (Gaps #2 and #3)
