# Handoff: oRPC SDK wiring

## What was decided (grill-with-docs session, 2026-05-16)

### Canonical type: VaultEntry
Defined once in `packages/sdk/src/index.ts` as a Zod schema output:
```ts
{ name, path, type: "file"|"folder", size, contentType, modifiedAt }
```
Frontend-only fields (`starred`, `tags`, `items`, `ext`, `created`) are dropped — no backing storage. Deferred feature.

### SDK package
- Location: `packages/sdk/`
- Package name: `@vault/sdk`
- Deps: `@orpc/contract`, `zod` (shared via workspace)
- Exports: contract + inferred types only

### API contract (procedures)
| Procedure | HTTP | Path |
|---|---|---|
| `files.list` | GET | `/api/rpc/files/list` |
| `files.createFolder` | POST | `/api/rpc/files/createFolder` |
| `files.upload` | POST | `/api/rpc/files/upload` |
| `files.download` | GET | `/api/rpc/files/download` |
| `files.rename` | PATCH | `/api/rpc/files/rename` |
| `files.delete` | DELETE | `/api/rpc/files/delete` |

Note: oRPC RPC protocol uses its own path convention under the `/api/rpc` prefix.

### Server changes
- Add deps: `@orpc/server`
- Replace `server/routes/files.ts` with `server/routes/files.orpc.ts` implementing the contract
- Mount via `RPCHandler` at `/api/rpc` in `server/index.ts`
- Remove old `app.route("/api/files", files)` and `@hono/zod-validator` import

### Frontend changes
- Add deps: `@orpc/client`, `@vault/sdk`
- Create `src/lib/client.ts` — `createORPCClient(new RPCLink({ url: '/api/rpc' }))`
- Create `src/composables/useFiles.ts` — replaces `src/data/files.ts` mock
- Update `App.vue` to use `useFiles(path)` composable
- Update `FileList.vue` props to accept `VaultEntry[]` instead of `FileNode[]`
- Update `DetailsPanel.vue` props to accept `VaultEntry | null`
- Delete `src/data/files.ts`

## Task list (in order)

1. ✅ `pnpm-workspace.yaml` — add `packages/*`
2. ⬜ Create `packages/sdk/` — `package.json`, `tsconfig.json`, `src/index.ts` (contract)
3. ⬜ Rewrite `server/routes/files.ts` as oRPC router implementing the contract
4. ⬜ Update `server/index.ts` — mount oRPC, remove old Hono file routes; add `@orpc/server` dep to root `package.json`
5. ⬜ Create `src/lib/client.ts` — typed oRPC client; add `@orpc/client` dep
6. ⬜ Create `src/composables/useFiles.ts` — reactive composable wrapping `client.files.list`
7. ⬜ Wire `App.vue` + `FileList.vue` + `DetailsPanel.vue` to real data; delete `src/data/files.ts`
8. ⬜ Run `pnpm install` and verify build

## Key files to read before implementing

- `server/lib/azure.ts` — `getContainer()`, `env`
- `server/lib/paths.ts` — `normalizePath`, `toPrefix`, `joinName`, `isSafeName`, `FOLDER_KEEP`
- `server/routes/files.ts` — existing logic to port to oRPC handlers
- `src/components/FileList.vue` — props to update (`FileNode[]` → `VaultEntry[]`)
- `src/components/DetailsPanel.vue` — props to update
