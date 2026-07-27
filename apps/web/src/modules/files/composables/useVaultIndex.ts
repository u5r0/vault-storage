import { shallowRef, readonly, watch } from "vue"
import MiniSearch from "minisearch"
import { useQuery } from "@tanstack/vue-query"
import { client as defaultClient } from "@/lib/client"
import { normalizeSearchText } from "@vault/sdk"
import type { VaultEntry, VaultStore } from "@vault/sdk"
import { filesKeys } from "../lib/queryKeys"
import { useAuthStore } from "@/stores/auth"

// ─── MiniSearch configuration ────────────────────────────────────────────────
//
// The index is shared across the app — one instance per session, never
// recreated. Callers obtain it via `useVaultIndex()` and call `search()` or
// the incremental helpers (add/update/remove).
//
// Field config (ADR 0028 §3.2):
//   - Only `name` is searched. Tags are indexed for future use but excluded
//     from the default query fields so they don't pollute name results.
//   - `processTerm` runs `normalizeSearchText` so Arabic/Latin normalisation
//     is identical on the client, the server write path, and the server query.
//   - `prefix: true` + `fuzzy: 0.2` gives autocomplete + 1-edit typo tolerance
//     without a full server round-trip.
//
// Index ceiling (ADR 0028 §3.2): MiniSearch is practical up to ~50k documents.
// Personal vaults are expected in the hundreds–thousands range. The server caps
// the flat listing at its own INDEX_HARD_LIMIT (10 000) and reports
// `truncated: true` when the vault exceeds it; the composable then sets
// `indexTooLarge = true` so `useSearch` falls back to the server for every
// query.

function makeMiniSearch() {
  return new MiniSearch<VaultEntry>({
    idField: "id",
    fields: ["name"],
    storeFields: ["id", "name", "type", "parentId", "createdAt", "modifiedAt", "size", "contentType", "deletedAt"],
    processTerm: (term) => normalizeSearchText(term) || null,
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { name: 2 },
    },
  })
}

// ─── Module-level singletons ──────────────────────────────────────────────────
// Kept outside the composable so the index survives component unmounts.
const ms = makeMiniSearch()
const hydrated = shallowRef(false)
const indexTooLarge = shallowRef(false)
const hydrating = shallowRef(false)
const hydrateError = shallowRef<Error | null>(null)

// ─── Composable ───────────────────────────────────────────────────────────────

export function useVaultIndex(client: VaultStore = defaultClient) {
  const auth = useAuthStore()

  // Hydrate: a single flat listing of the whole vault seeds the index.
  // `enabled` is false once hydrated so this query never re-runs automatically.
  // Re-hydration is triggered only by `invalidateQueries(filesKeys.all)` from
  // mutations — which TanStack Query will honour automatically because this
  // query key begins with `["files"]`.
  const hydrateQuery = useQuery({
    queryKey: [...filesKeys.all, "__index__"] as const,
    queryFn: () => client.listAllEntries(),
    enabled: auth.isAuthenticated && !hydrated.value && !indexTooLarge.value,
    staleTime: Infinity,
  })

  // Ingest the flat listing into MiniSearch once it resolves. A `truncated`
  // response means the vault is too large to index locally, so we flag
  // `indexTooLarge` and let `useSearch` fall back to the server.
  if (!hydrated.value && !indexTooLarge.value) {
    hydrating.value = true

    watch(
      () => hydrateQuery.data.value,
      (data) => {
        if (!data) return
        for (const e of data.entries) {
          if (ms.has(e.id)) {
            ms.replace(e)
          } else {
            ms.add(e)
          }
        }
        if (data.truncated) {
          indexTooLarge.value = true
        }
        hydrated.value = true
        hydrating.value = false
      },
      { immediate: true },
    )

    watch(
      () => hydrateQuery.error.value,
      (err) => {
        if (err) {
          hydrateError.value = err as Error
          hydrating.value = false
        }
      },
    )
  }

  // ─── Public search ───────────────────────────────────────────────────────

  function search(q: string, type?: "file" | "folder"): VaultEntry[] {
    if (!q || q.length < 2) return []
    const normalized = normalizeSearchText(q)
    if (!normalized) return []

    const results = ms.search(normalized, {
      prefix: true,
      fuzzy: 0.2,
    }) as unknown as (VaultEntry & { score: number })[]

    return type ? results.filter((r) => r.type === type) : results
  }

  // ─── Incremental update helpers (called by mutations) ───────────────────

  function addEntry(entry: VaultEntry) {
    if (ms.has(entry.id)) {
      ms.replace(entry)
    } else {
      ms.add(entry)
    }
  }

  function updateEntry(entry: VaultEntry) {
    if (ms.has(entry.id)) {
      ms.replace(entry)
    } else {
      ms.add(entry)
    }
  }

  function removeEntry(id: string) {
    if (ms.has(id)) {
      ms.remove({ id } as VaultEntry)
    }
  }

  // Patch a subset of fields on an existing entry (e.g. rename only updates
  // `name`; move only updates `parentId`). If the entry is not in the index
  // yet the patch is silently dropped — the next hydration will include it.
  function patchEntry(id: string, patch: Partial<VaultEntry>) {
    if (!ms.has(id)) return
    // MiniSearch doesn't expose a read-by-id API; we replace via discard+re-add
    // using the stored fields we already have. `getStoredFields` is public API
    // (documented in MiniSearch docs as `getStoredFields(id)`).
    const stored = (ms as any).getStoredFields?.(id)
    if (!stored) return
    const updated: VaultEntry = { ...stored, ...patch } as VaultEntry
    ms.replace(updated)
  }

  return {
    hydrated: readonly(hydrated),
    hydrating: readonly(hydrating),
    indexTooLarge: readonly(indexTooLarge),
    hydrateError: readonly(hydrateError),
    search,
    addEntry,
    updateEntry,
    removeEntry,
    patchEntry,
  }
}
