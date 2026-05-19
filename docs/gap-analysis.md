# Gap Analysis

Codebase review conducted 2026-05-17. Updated 2026-05-19 for Cosmos DB and ID-based routing migration. Items ordered by priority.


## Critical

### 1. No tests — Phase A done
Strategy documented in [ADR 0005](adr/0005-testing-strategy.md). Vitest installed with two projects: `unit` and `integration`. Integration tests boot Azurite in `--inMemoryPersistence` on a random port via global setup and call the Hono app through `app.request(...)` — no mocks. 26 tests green:

- `server/lib/paths.test.ts` — 18 tests covering `normalizePath` / `toPrefix` / `joinName` / `isSafeName` edge cases.
- `tests/integration/files.test.ts` — 8 tests covering happy paths of `GET /api/files`, `POST /api/files/folder`, `POST /api/files/upload`, `GET /api/files/download`, `PATCH /api/files/rename`, and `DELETE /api/files` (file + folder).

Phase B (error paths, `format.test.ts`) and Phase C (Playwright) tracked in [ADR 0005](adr/0005-testing-strategy.md).

### 2. No authentication / authorization
`.env.example` hints at JWT but no auth middleware, login/signup routes, or user concept. API is wide open.

### 3. ~~No metadata persistence~~ — Architecture decided
**Status:** Architecture decided (ADR 0007 amended 2026-05-19).

Sidebar counts (Starred, Recent, Tags, Trash) are hardcoded. No database for user-specific metadata — stars, tags, trash state, recents. Backend only handles raw blob CRUD.

**Decision:** Azure Cosmos DB with document model. Single collection stores both folders and files with `parentId` field for hierarchy. This enables:
- Instant directory rendering via single query
- Instant favorites/tag searching across entire hierarchy
- O(1) folder moves (just update parentId)
- Rich metadata support (tags, custom metadata, favorites)

See [ADR 0007](adr/0007-auth-and-identity-migration.md) for full details.

### 4. Search is dead UI
`AppHeader.vue` has `v-model="query"` but `query` is never consumed. No search API endpoint or filtering logic.

### 5. ~~Folder navigation doesn't work~~ — fixed
Clicking a folder navigates into it. Breadcrumbs added with Home button and clickable path segments.

### 5b. ~~No client-side routing~~ — fixed
Added `vue-router` with path-based routes (`/files/:path(.*)*`) and `?selected=` query param for selected file. URL now reflects state — bookmarkable, shareable, browser back/forward works. App split into `App.vue` (shell) + `views/FilesView.vue` (route).

### 5c. ~~`VaultEntry` (SDK) vs `Entry` (server) duplication~~ — fixed
SDK now owns the full wire contract: every request body, response shape, and entity is a Zod schema in `@vault/sdk`. Server imports them for `zValidator` and uses `VaultEntry` directly. See [ADR 0001](adr/0001-sdk-as-shared-contract.md) for the full reasoning, including why we deviated from the Directus SDK pattern.

### 5d. Path as identifier — accepted, time-bound
Files and folders are identified by `path` today. Renames break URLs, bookmarks, and any future path-keyed metadata. Decision documented in [ADR 0003](adr/0003-path-as-identifier.md): stay on path-as-ID until gap #3 (metadata persistence) is implemented, then migrate to opaque IDs at the application layer with path retained as a rendered/derived field. Do not implement star/tag/trash/share features until this is revisited.

## Functional

### 6. ~~File type detection is broken~~ — fixed
Added `fileIconType()` in `format.ts` mapping `contentType` → icon type. `FileList.vue` and `DetailsPanel.vue` now use it.

### 7. No pagination on list endpoint
`GET /api/files` returns all entries. No `limit`/`offset` or cursor pagination.

### 8. No drag-and-drop upload
Upload button exists but no drop zone on the file list.

### 9. No context menu / right-click
Toolbar action buttons (Properties, Tags, Star, Delete) have no handlers. No right-click context menu.

### 10. Share button does nothing
`DetailsPanel.vue` Share button has no handler.

### 11. Storage stats are hardcoded
`AppSidebar.vue`: `usedGB = 624, totalGB = 1200`. No API endpoint for actual usage.

### 12. No keyboard shortcuts
Search bar shows `⌘K` hint but no global keyboard shortcut handler.

### 13. No mobile sidebar toggle
Sidebar is `hidden md:flex` with no hamburger menu or mobile drawer.

### 14. No loading skeletons
Only "Loading…" text, no skeleton placeholders.
