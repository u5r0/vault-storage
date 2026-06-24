# Roadmap

Last reviewed: 2026-06-24. Items ordered by priority within each tier.

---

## Critical

### 1. Metadata mutations not yet exposed

The backend stores `isFavorite`, `tags`, and `deletedAt` on every Cosmos entry and `quickLinks` counts them, but there are no mutation endpoints for starring, tagging, or soft-deleting.

**Needs:**
- `PATCH /api/files/star` — toggle `isFavorite`
- `PATCH /api/files/tag` — add/remove tags
- `DELETE /api/files` (soft) — set `deletedAt` instead of hard delete, plus `/trash` and `/restore` endpoints
- Frontend views for starred, recent, tagged, and trash (sidebar links go nowhere today)

---

## Functional

### 2. Context menu / actions

Toolbar buttons (Properties, Tags, Star, Delete) have no click handlers. No right-click context menu.

**Needs:**
- Wire toolbar buttons to call the corresponding API endpoint
- Context menu component (right-click or long-press on mobile)
- Confirmation dialog for destructive actions (delete)

### 3. Share links

No public or token-gated share links. `GET /api/files/download-url` mints short-lived (15 min) presigned URLs for the authenticated owner — that is not a shareable link.

**Needs:**
- Backend: durable share-link generation (signed token or separate `share` document in Cosmos)
- Permission model (read-only link vs. collaborator access)
- Frontend: modal with generated link + copy button

### 4. Storage stats

AppSidebar shows hardcoded storage usage.

**Needs:**
- `GET /api/files/stats` endpoint — total bytes stored, file count
- Frontend: display real values in sidebar

### 5. Mobile responsiveness

No hamburger menu or responsive sidebar. Desktop-only layout.

**Needs:**
- Sidebar toggle (hamburger icon in AppHeader on small screens)
- Responsive grid breakpoints for FileGridItem
- Touch-friendly context actions

### 6. Loading states

Only a `<v-spinner>` during initial load. No skeleton placeholders.

**Needs:**
- Skeleton screens for file list rows/grid cards
- Optimistic UI for rename/move/delete (update local state, revert on error)

---

## Nice-to-Have

### 7. Keyboard shortcuts

No global shortcuts.

**Candidates:** `/` for search focus, `Ctrl+U` for upload, `Delete` for selected file, arrow keys for navigation.

### 8. Breadcrumb navigation

Currently only a "Home" button. No path breadcrumbs showing folder hierarchy.

### 9. File preview

No in-app preview for images, PDFs, or text files. Downloads are the only option.

### 10. Drag-to-move

Files can be dragged in to upload but cannot be dragged between folders within the app.

### 11. Multi-select

No shift-click or ctrl-click selection for bulk actions.

---

## Technical Debt

- **`tough-cookie` in SDK** — Only needed for the Node.js `VaultClient` (cookie persistence in tests and server-side consumers). Consider making it a peer/optional dependency or splitting `VaultClient` into browser and Node variants.
- **Test coverage gaps** — Error-path tests not yet written: invalid tokens, password reset flow, unauthenticated access to file routes.
