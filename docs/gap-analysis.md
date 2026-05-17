# Gap Analysis

Codebase review conducted 2026-05-17. Items ordered by priority.

## Current milestone

**~~Validate Azure code path with Azurite + seed sample data~~** ✅ done ([ADR 0004](adr/0004-azurite-for-local-dev.md)).

- [x] Install Azurite as workspace dev dep
- [x] Add `azurite` script and `.azurite-data/` to `.gitignore`
- [x] Document Azurite connection string in `.env.example`
- [x] Verify dev server boots and `/api/health` reports `azureConfigured: true`
- [x] Write seed script (`scripts/seed.ts`) that creates sample folder tree via the API
- [x] Smoke-test list / upload / download / rename / delete end-to-end
- [x] Reference Azurite in `server/CONTEXT.md` and `server/lib/README.md`

## Next milestone

**API-level e2e tests against Azurite** ([ADR 0005](adr/0005-testing-strategy.md)).

Following the Epic Web testing trophy — "write tests, not too many, mostly integration." Skip mocked route tests in favour of real Azurite-backed integration tests; add unit tests selectively for gnarly utilities; defer browser e2e until UI stabilises.

- [ ] Add Vitest to devDeps, `vitest.config.ts`, `pnpm test` script
- [ ] Global setup spawns Azurite in in-memory mode on a random port
- [ ] `tests/integration/files.test.ts` covering happy paths of all routes
- [ ] `server/lib/paths.test.ts` for path-helper edge cases
- [ ] (Later) error-path coverage + `format.test.ts`
- [ ] (Later) one Playwright happy-path spec once UI stabilises

## Critical

### 1. No tests — in progress
No unit, integration, or e2e tests yet. Strategy documented in [ADR 0005](adr/0005-testing-strategy.md): Epic Web testing trophy — integration tests through the HTTP API against real Azurite, unit tests selectively for utilities, browser e2e deferred. Tracked in the **Next milestone** above.

### 2. No authentication / authorization
`.env.example` hints at JWT but no auth middleware, login/signup routes, or user concept. API is wide open.

### 3. No metadata persistence
Sidebar counts (Starred, Recent, Tags, Trash) are hardcoded. No database for user-specific metadata — stars, tags, trash state, recents. Backend only handles raw blob CRUD. **Coupled with the path-vs-ID decision** ([ADR 0003](adr/0003-path-as-identifier.md)) — adopting metadata persistence is the trigger for migrating off path-as-identifier.

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

### 15. ~~No rich empty states~~ — fixed
`FileList.vue` now renders a centered empty state (icon + message) in the body when a folder has no files, instead of repurposing the toolbar title. Mirrors the `DetailsPanel` "Nothing selected" pattern.

## Infrastructure

### 16. No CI/CD
No GitHub Actions workflows, Dockerfile, or deployment config.

### 17. No root README.md
No top-level project README.

### 18. ~~Missing `.env.example` entry~~ — fixed
Added `VITE_API_URL` to `.env.example`.

### 20. Hybrid monorepo layout — deferred
Root `package.json` mixes frontend and server deps. `app/` and `server/` are not their own packages; only `packages/sdk` is. Decision and migration plan documented in [ADR 0002](adr/0002-monorepo-layout.md). Move to `apps/web` + `apps/server` + `packages/*` after higher-priority gaps land.

### 21. ~~No local dev storage backend~~ — fixed
Azurite installed as dev dep, auto-started by `pnpm dev`. `pnpm seed` populates a sample folder tree. List/upload/download/rename/delete confirmed working end-to-end against the emulator. See [ADR 0004](adr/0004-azurite-for-local-dev.md).
