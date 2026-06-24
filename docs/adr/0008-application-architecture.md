# ADR 0008: Application Architecture

**Status:** Accepted  
**Date:** 2026-05-21
**Amended:** 2026-06-24 (rate-limit table updated to read/write split; VueQueryPlugin noted in bootstrap; blob-provider ADR reference added)

## Context

This ADR documents the current architecture of both the backend API and the frontend application. It serves as the primary reference for contributors and supersedes the scattered structural notes in earlier ADRs.

---

## Backend — `apps/server/`

### Layer model

The backend follows a three-layer model inspired by Directus `api/src/`:

```
controllers/   HTTP layer — parse request, call service, return response. No business logic.
services/      Business logic — owns one domain each. Co-located unit tests.
middleware/    Reusable Hono middleware (authenticate, rate-limit).
lib/           Pure utilities with no HTTP or DB dependencies.
db.ts          Cosmos DB client (no side effects at import time).
app.ts         createApp() factory — mounts controllers and global middleware.
index.ts       Runtime entry point only — calls createApp() and serve().
```

### Controllers (`controllers/`)

Thin HTTP adapters. Each controller:
- Parses and validates the request (using Zod schemas from `@vault/sdk`)
- Calls the relevant service method
- Returns the HTTP response

Controllers contain no business logic. They do not query the database directly.

**Files:** `auth.ts`, `files.ts`  
**Tests:** `auth.test.ts`, `files.test.ts` (integration tests — full HTTP stack against real Azurite + Cosmos emulator)

### Services (`services/`)

Business logic layer. Each service owns one domain:

- `AuthService` — registration, login, magic links, password reset, token rotation
- `FilesService` — list, create folder, upload, download, rename, move, delete, quick links

Services receive `ownerId` on every method call (set by the auth middleware) to enforce owner isolation. They interact with Cosmos DB via `db.ts` and Azure Blob Storage via `lib/azure.ts`.

**Tests:** `auth.test.ts`, `files.test.ts` (unit tests — mock `db` and `getBlobStore`)

### Middleware (`middleware/`)

- `authenticate.ts` — verifies the `access` JWT cookie, sets `c.get("userId")`. Applied globally to all file routes.
- `rate-limiter.ts` — `createUserReadLimiter()`, `createUserWriteLimiter()`, and `consumeEmailLimit()` helpers. Factory functions allow reset between tests.

### Rate limiting strategy (three layers)

| Layer | Key | Scope |
|---|---|---|
| 1 — primary | email (auth) / userId (files) | Per-endpoint quotas |
| 2 — volumetric | userId | Upload bytes per window |
| 3 — emergency brake | IP | All routes, global in `app.ts` |

Per-user file operations are split into two budgets:

| Operation class | Limit |
|---|---|
| Reads (list, download, quick-links) | 600 per minute per userId |
| Writes (upload, folder, rename, move, delete) | 120 per minute per userId |

Reads and writes are split because listing and downloading are idempotent and cheap; mutations are stateful and more expensive. Factory functions in `lib/rate-limiter.ts`: `createUserReadLimiter`, `createUserWriteLimiter`.

### Auth flow

1. Register → Argon2id password hash stored in Cosmos, verification email sent via magic link
2. Verify email → `spent_token` document created (one-time-use enforcement)
3. Login → access JWT (15 min) + refresh JWT (7 days) set as `HttpOnly` cookies
4. Refresh → old refresh token consumed, new pair issued
5. Logout → refresh token deleted from Cosmos, cookies cleared

### Test infrastructure (`__setup__/`)

- `blob.global.ts` / `blob.env.ts` — boots Azurite in-memory, provides connection string
- `cosmos.global.ts` / `cosmos.env.ts` — creates an isolated Cosmos DB database per test run
- `mailpit.global.ts` / `mailpit.env.ts` — starts Mailpit SMTP for email assertions
- `fixtures.ts` — `useAuthFixture()`, `useFilesFixture()`, `parseCookies()`

Vitest runs three projects: `unit` (no infrastructure), `integration` (Azurite + Cosmos + Mailpit), and `web-browser` (Playwright).

---

## Frontend — `apps/web/`

### Layer model

The frontend follows a vertical slice architecture inspired by Directus `app/src/`:

```
modules/       Feature slices — each owns its routes, components, and composables
components/    Global v-* primitives registered via register.ts
stores/        Global Pinia stores — one file per concern
layouts/       Page layout shells (AppLayout, AuthLayout)
composables/   Shared composables (useAsync)
lib/           client.ts (VaultClient instance), format.ts
router.ts      Thin aggregator — spreads routes from each module
main.ts        App bootstrap — Pinia → checkAuth() → router → mount
```

### Modules (`modules/`)

Each module is self-contained. A module may have:

```
modules/<name>/
  components/    Module-specific components (PascalCase)
  composables/   Module-specific composables
  routes/        Route-level .vue files (kebab-case, ≤ 40 lines each)
  lib/           Module-specific pure utilities
  index.ts       Exports RouteRecordRaw[] for router.ts
```

**Cross-module imports are forbidden.** Modules may only import from `components/`, `stores/`, `composables/`, and `lib/`. Shared logic must be promoted to one of those global layers.

**Current modules:**

| Module | Routes | Notes |
|---|---|---|
| `files` | `/contents/:entityId?` | FileList, DetailsPanel, FolderModal; sort/view state in `useFilesStore` |
| `upload` | — (no routes) | `useUploadStore` wraps SDK `UploadManager`; files added via store, not provide/inject |
| `auth` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify` | `passwordRules.ts` for ADR 0002 validation |
| `settings` | `/settings` | Section-based layout; theme via `useUIStore` |
| `profile` | `/profile` | Edit buffer pattern — draft committed on save |

### Global primitives (`components/`)

All global components use the `v-` prefix and are registered globally via `register.ts`. They never need to be imported in individual SFCs.

| Component | Purpose |
|---|---|
| `<v-button>` | Primary, outline, ghost variants; loading state |
| `<v-input>` | Text input with optional prefix slot |
| `<v-spinner>` | Animated loading indicator |
| `<v-empty-state>` | Empty folder / no results state |
| `<v-badge>` | Status badge (default, primary, accent, destructive) |

`AppHeader` and `AppSidebar` also live in `components/` but are not `v-` prefixed — they are layout partials, not primitives.

### Stores (`stores/`)

Global Pinia stores using the composition API style (`defineStore('id', () => { ... })`):

| Store | State |
|---|---|
| `useAuthStore` | `user`, `loading`, `error`; all auth actions |
| `useFilesStore` | `viewMode`, `sortKey`, `sortAsc`, `selectedId`; `viewMode` persisted to `localStorage` |
| `useSettingsStore` | `account`, `notifications`, `security`, `storage` |
| `useUIStore` | `theme`, `sidebarCollapsed`; theme persisted to `localStorage` and applied to `<html>` |
| `useUploadStore` | `files`, `hasPending`, `isUploading`, `currentEntityId`, `lastCompletedAt`; wraps SDK `UploadManager` |

**Never destructure Pinia actions** — they lose their `this` binding. Call them directly on the store instance: `auth.signOut()` not `const { signOut } = auth`.

### Upload architecture

`useUploadStore` (in `stores/upload.ts`) wraps the SDK's framework-agnostic `UploadManager` in a Pinia store so Vue components can react to queue changes reactively. The store is intentionally thin — all upload semantics (concurrency, restrictions, retry, cancel) live in the SDK's `UploadManager`.

- Concurrency: 3 simultaneous uploads
- Max files: 20 per batch
- Max file size: `VITE_MAX_UPLOAD_MB` (default 100 MB)
- `addFiles()` enqueues items using `currentEntityId` as the target folder
- On `completed`, the handle is removed from the queue and `lastCompletedAt` is bumped — the file-list view watches that timestamp to invalidate its TanStack Query cache and refetch

Components import `useUploadStore` directly — no `provide/inject` indirection.

### Theme system

All components use CSS custom property tokens (`var(--color-*)`, `var(--radius-*)`). Never use hardcoded hex or oklch values in component markup. The `dark` class on `<html>` toggles the dark palette. Utility classes `glass`, `grain`, and `ring-soft` are defined in `style.css`.

### App bootstrap order

```ts
// main.ts
app.use(pinia)          // 1. Pinia must be first
app.use(VueQueryPlugin) // 2. TanStack Query (staleTime 30s, no refetch on focus)
registerGlobals(app)    // 3. Register v-* components
await checkAuth()       // 4. Resolve auth state BEFORE router fires
app.use(router)         // 5. Router registered after auth is known
app.mount("#app")       // 6. Mount
```

Step 4 is critical — registering the router before `checkAuth()` resolves causes the route guard to see `isAuthenticated = false` on every hard refresh and redirect to login.

---

## SDK — `packages/sdk/`

Single entry point `@vault/sdk`. Owns:
- All Zod schemas for request bodies and response shapes
- `VaultClient` — works in both browser (uses `credentials: "include"`) and Node.js (uses `tough-cookie` for cookie persistence)
- `VaultStore` interface — the contract both `VaultClient` and test mocks implement

The backend imports schemas from the SDK for request validation. The frontend imports `VaultClient` and all entity types from the SDK. No type definitions are duplicated.

See [ADR 0005](0005-sdk-as-shared-contract.md) for the rationale.

---

## References

- [ADR 0001: Authentication](0001-authentication.md)
- [ADR 0004: Testing Strategy](0004-testing-strategy.md)
- [ADR 0005: SDK as Shared Contract](0005-sdk-as-shared-contract.md)
- [ADR 0006: Cosmos DB and ID-Based Routing](0006-cosmos-db-and-id-based-routing.md)
- [ADR 0007: Monorepo Layout](0007-monorepo-layout.md)
- [ADR 0009: Blob Storage Multi-Provider](0009-blob-storage-multi-provider.md)
- Private ADR: `docs/adr-private/0015-frontend-vertical-slice-rearchitecture.md`
- Private ADR: `docs/adr-private/0016-backend-rearchitecture-and-testing.md`
- Private ADR: `docs/adr-private/0017-test-layout-co-location.md`
