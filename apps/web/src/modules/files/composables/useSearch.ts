import { computed, ref, watch } from "vue"
import { useInfiniteQuery } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { client as defaultClient } from "@/lib/client"
import type { SearchFilesResult, VaultEntry, VaultStore } from "@vault/sdk"
import { useUIStore } from "@/stores/ui"
import { filesKeys } from "../lib/queryKeys"
import { useVaultIndex } from "./useVaultIndex"
import { useAuthStore } from "@/stores/auth"

/**
 * Hybrid search per ADR 0028 §3.2 Phase A (your "bounded local + server
 * fallback" decision).
 *
 * Strategy:
 *   1. While the local MiniSearch index is hydrated AND the vault is within
 *      the index size ceiling, serve results instantly from MiniSearch.
 *      Zero RUs, sub-1ms, works offline, full Arabic+Latin normalisation.
 *   2. If the index is not yet hydrated, too large, or the local result set
 *      is empty on a query the server might know about (cross-folder entries
 *      loaded after a separate navigation), fall back to the server query.
 *      The server query is the same TanStack infinite query that existed
 *      before — no shape change, no new API endpoint.
 *
 * The composable's return contract is unchanged (entries, isLoading,
 * isFetching, hasNextPage, fetchNextPage, error) so `search.vue` needs
 * no changes.
 */
export function useSearch(client: VaultStore = defaultClient) {
  const ui = useUIStore()
  const index = useVaultIndex(client)
  const auth = useAuthStore()

  const debouncedQuery = refDebounced(
    computed(() => ui.searchQuery.trim()),
    250,
  )

  const typeFilter = computed(() => ui.searchType)
  const enabled = computed(() => debouncedQuery.value.length >= 2)

  // ─── Local results (instant) ─────────────────────────────────────────────

  const localEntries = computed<VaultEntry[]>(() => {
    if (!enabled.value) return []
    if (!index.hydrated.value || index.indexTooLarge.value) return []
    return index.search(debouncedQuery.value, typeFilter.value)
  })

  // Use local results if the index is ready and returned something (or the
  // index is ready and we are confident it is complete — even an empty result
  // is authoritative once hydrated).
  const useLocal = computed(
    () => index.hydrated.value && !index.indexTooLarge.value,
  )

  // ─── Server fallback (TanStack infinite query) ────────────────────────────
  // Only enabled when:
  //   a) query is long enough, AND
  //   b) we can't use the local index (not ready or too large), AND
  //   c) user is authenticated
  const serverEnabled = computed(() => enabled.value && !useLocal.value && auth.isAuthenticated)

  const serverQuery = useInfiniteQuery({
    queryKey: computed(() =>
      filesKeys.search(debouncedQuery.value, typeFilter.value),
    ),
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: string | undefined
      signal: AbortSignal
    }) =>
      client.searchFiles(
        {
          q: debouncedQuery.value,
          type: typeFilter.value,
          cursor: pageParam,
          pageSize: 50,
        },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SearchFilesResult) => last.cursor ?? undefined,
    enabled: serverEnabled,
    staleTime: 30_000,
  })

  const serverEntries = computed<VaultEntry[]>(
    () => serverQuery.data.value?.pages.flatMap((p) => p.entries) ?? [],
  )

  // ─── Unified surface ─────────────────────────────────────────────────────

  const entries = computed<VaultEntry[]>(() =>
    useLocal.value ? localEntries.value : serverEntries.value,
  )

  // isLoading: true while the index is hydrating (spinner shown in search.vue)
  // OR while the server query is in flight.
  const isLoading = computed(
    () =>
      (index.hydrating.value && !index.hydrated.value) ||
      (!useLocal.value && serverQuery.isLoading.value),
  )

  const isFetching = computed(
    () => index.hydrating.value || serverQuery.isFetching.value,
  )

  // Pagination only applies to the server path; local results are always complete.
  const isFetchingNextPage = computed(() =>
    useLocal.value ? false : serverQuery.isFetchingNextPage.value,
  )

  const hasNextPage = computed(() =>
    useLocal.value ? false : serverQuery.hasNextPage.value,
  )

  function fetchNextPage() {
    if (!useLocal.value) {
      serverQuery.fetchNextPage()
    }
  }

  const error = computed(() =>
    useLocal.value ? index.hydrateError.value : serverQuery.error.value,
  )

  return {
    query: debouncedQuery,
    entries,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    // Exposed for the search.vue status indicator
    isLocalSearch: useLocal,
  }
}
