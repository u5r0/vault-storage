import { shallowRef, readonly } from "vue"
import MiniSearch from "minisearch"
import { useInfiniteQuery } from "@tanstack/vue-query"
import { client as defaultClient } from "@/lib/client"
import { normalizeSearchText } from "@vault/sdk"
import type { VaultEntry, VaultStore } from "@vault/sdk"
import { filesKeys } from "../lib/queryKeys"

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
// Personal vaults are expected in the hundreds–thousands range. If a hydration
// batch returns more than INDEX_HARD_LIMIT total documents the index is
// considered "too large" and the composable sets `indexTooLarge = true` so
// `useSearch` can fall back to the server for every query.

const INDEX_HARD_LIMIT = 10_000
const BATCH_SIZE = 100

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
  // Hydrate: drain all pages of the root listing to seed the index.
  // `enabled` is false once hydrated so this query never re-runs automatically.
  // Re-hydration is triggered only by `invalidateQueries(filesKeys.all)` from
  // mutations — which TanStack Query will honour automatically because this
  // query key begins with `["files"]`.
  const hydrateQuery = useInfiniteQuery({
    queryKey: [...filesKeys.all, "__index__"] as const,
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      return client.listFiles({
        entityId: undefined,
        cursor: pageParam,
        pageSize: BATCH_SIZE,
      })
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.cursor ?? undefined,
    enabled: !hydrated.value && !indexTooLarge.value,
    staleTime: Infinity,
  })

  // Watch the query pages as they arrive and ingest them into MiniSearch.
  // We can't use `watchEffect` on `hydrateQuery.data` directly for the first
  // load because TanStack Query batches pages — instead, wire into `onSuccess`
  // via a watcher on `data`.
  //
  // Pattern: whenever the page list grows, ingest only the newest page to
  // avoid re-adding already-indexed documents.
  let lastPageCount = 0

  function ingestNewPages() {
    const pages = hydrateQuery.data.value?.pages ?? []
    if (pages.length <= lastPageCount) return

    for (let i = lastPageCount; i < pages.length; i++) {
      const entries = pages[i].entries
      for (const e of entries) {
        if (ms.has(e.id)) {
          ms.replace(e)
        } else {
          ms.add(e)
        }
      }
    }
    lastPageCount = pages.length

    const total = pages.reduce((acc, p) => acc + p.entries.length, 0)
    if (total >= INDEX_HARD_LIMIT) {
      indexTooLarge.value = true
    }

    // All pages loaded (no next page cursor) → mark hydrated
    const lastPage = pages[pages.length - 1]
    if (!lastPage?.cursor && !hydrateQuery.hasNextPage.value) {
      hydrated.value = true
      hydrating.value = false
    }
  }

  // Kick off page fetching and watch for new pages arriving
  if (!hydrated.value && !indexTooLarge.value) {
    hydrating.value = true
    // Watch data changes — fires as each page arrives
    import("vue").then(({ watch }) => {
      watch(() => hydrateQuery.data.value, () => {
        ingestNewPages()
        if (hydrateQuery.hasNextPage.value && !hydrateQuery.isFetchingNextPage.value) {
          hydrateQuery.fetchNextPage()
        }
      }, { immediate: true, deep: false })

      watch(() => hydrateQuery.error.value, (err) => {
        if (err) {
          hydrateError.value = err as Error
          hydrating.value = false
        }
      })
    })
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
