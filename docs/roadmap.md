# Roadmap

Last reviewed: 2026-06-05. Items ordered by priority within each tier.

---

## Critical

### 1. Pagination

`GET /api/files` returns all entries in a folder. No limit.

**Needs:**
- Continuation token-based pagination (Cosmos DB native pattern)
- Frontend: infinite scroll or "load more" in FileList
- Reasonable default page size (50–100 entries)

### 2. Metadata features are read-only stubs

The backend serves `quickLinks` counts and stores `isFavorite`/`tags`/`deletedAt` fields, but there are no mutation endpoints for starring, tagging, or soft-deleting.

**Needs:**
- `PATCH /api/files/star` — toggle `isFavorite`
- `PATCH /api/files/tag` — add/remove tags
- `DELETE /api/files` (soft) — set `deletedAt` instead of hard delete (or add `/trash` and `/restore` endpoints)
- Frontend views for starred, recent, tagged, and trash (sidebar links go nowhere today)

---

## Functional

### 3. Context menu / actions

Toolbar buttons (Properties, Tags, Star, Delete) have no click handlers. No right-click context menu.

**Needs:**
- Wire toolbar buttons to call the corresponding API endpoint
- Context menu component (right-click or long-press on mobile)
- Confirmation dialog for destructive actions (delete)

### 4. Share

Share button in DetailsPanel has no handler.

**Needs:**
- Backend: share link generation (signed URL or token-gated access)
- Permission model (read-only link vs. collaborator access)
- Frontend: modal with generated link + copy button

### 5. Storage stats

AppSidebar shows hardcoded storage usage.

**Needs:**
- `GET /api/files/stats` endpoint — total bytes stored, file count
- Frontend: display real values in sidebar

### 6. Mobile responsiveness

No hamburger menu or responsive sidebar. Desktop-only layout.

**Needs:**
- Sidebar toggle (hamburger icon in AppHeader on small screens)
- Responsive grid breakpoints for FileGridItem
- Touch-friendly context actions

### 7. Loading states

Only a `<v-spinner>` during initial load. No skeleton placeholders.

**Needs:**
- Skeleton screens for file list rows/grid cards
- Optimistic UI for rename/move/delete (update local state, revert on error)

---

## Nice-to-Have

### 8. Keyboard shortcuts

No global shortcuts.

**Candidates:** `/` for search focus, `Ctrl+U` for upload, `Delete` for selected file, arrow keys for navigation.

### 9. Breadcrumb navigation

Currently only a "Home" button. No path breadcrumbs showing folder hierarchy.

### 10. File preview

No in-app preview for images, PDFs, or text files. Downloads are the only option.

### 11. Drag-to-move

Files can be dragged in to upload but cannot be dragged between folders within the app.

### 12. Multi-select

No shift-click or ctrl-click selection for bulk actions.

---

## Technical Debt

- **`tough-cookie` in SDK** — Only needed for Node.js test client. Consider making it a peer/optional dependency or moving VaultClient out of the shared SDK.
- **Test coverage gaps** — Phase B error-path tests not yet written (invalid tokens, password reset flow, unauthenticated access).
