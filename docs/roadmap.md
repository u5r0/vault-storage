# Roadmap

Codebase review conducted 2026-05-17. Updated 2026-05-20 for test status, auth implementation, and Vuex state management. Items ordered by priority.


## Critical

### 1. Tests — Phase B pending
EpicWeb-based testing strategy with Vitest. Phase A complete (18 integration tests green). Phase B error path tests needed: password reset, invalid credentials, invalid tokens, unauthenticated access, file/auth API error paths. See [ADR 0004](adr/0004-testing-strategy.md) and [ADR 0012b (private)](adr-private/0012b-testing-refactoring-epic-web-patterns.md).

**Status:** Auth tests partially complete. Need to add password reset flow and error path tests.

### 2. Metadata persistence not implemented
Azure Cosmos DB architecture decided but not implemented. No user metadata (stars, tags, trash, recents). See [ADR 0006](adr/0006-cosmos-db-and-id-based-routing.md).

**Status:** Cosmos DB connection configured in backend but metadata schema and CRUD operations not implemented. Need to design metadata entity schema, create endpoints, and add integration tests for Cosmos DB operations.

### 3. Search is dead UI
`AppHeader.vue` has `v-model="query"` but `query` is never consumed. No search API endpoint or filtering logic.

**Status:** UI exists but no backend implementation. Need to implement search API with Cosmos DB queries and wire up frontend.

## Functional

### 4. No pagination on list endpoint
`GET /api/files` returns all entries. No pagination.

**Status:** Returns all entities without limit. Need to implement cursor-based or offset-based pagination for large datasets.

### 5. Upload implementation needs review
Uppy components integrated. May be over-engineered. Consider simplifying to native file input + progress tracking.

**Status:** Working but complex. Need to evaluate if simplification is needed or if current implementation is acceptable.

### 6. No context menu / right-click
Toolbar buttons have no handlers. No right-click menu.

**Status:** UI buttons exist but no functionality. Need to implement context menu with actions (rename, delete, share, download).

### 7. Share button does nothing
Share button has no handler.

**Status:** UI exists but no backend. Need to implement share link generation and access control.

### 8. Storage stats are hardcoded
No API endpoint for actual usage.

**Status:** Hardcoded values in AppSidebar. Need to implement storage usage calculation from Azure Blob Storage.

### 9. No keyboard shortcuts
No global keyboard shortcut handler.

**Status:** No implementation. Need to add keyboard shortcuts for common actions (upload, search, navigation).

### 10. No mobile sidebar toggle
No hamburger menu or mobile drawer.

**Status:** Desktop-only layout. Need responsive design with mobile sidebar toggle.

### 11. No loading skeletons
Only "Loading…" text, no skeleton placeholders.

**Status:** Basic loading state. Need to implement skeleton screens for better UX during data loading.

## Completed

### 12. Authentication system ✅
Email/password login, magic links, password reset, email verification implemented. Vuex store for state management. See [ADR 0001](adr/0001-authentication.md) and [ADR 0014 (private)](adr-private/0014-frontend-state-management.md).

**Status:** Fully implemented with httpOnly cookie-based session security.

### 13. ID-based routing ✅
Entity ID-based URLs implemented per ADR 0006. Frontend uses `/contents/:entityId` routing.

**Status:** Complete. Backend and frontend both use UUID-based entity identifiers.

### 14. Monorepo layout ✅
pnpm workspace structure implemented. See [ADR 0007](adr/0007-monorepo-layout.md).

**Status:** Complete with apps/server, apps/web, and packages/sdk.
