import { computed } from "vue"
import { useInfiniteQuery } from "@tanstack/vue-query"
import { refDebounced } from "@vueuse/core"
import { client as defaultClient } from "@/lib/client"
import type { SearchFilesResult, VaultEntry, VaultStore } from "@vault/sdk"
import { useUIStore } from "@/stores/ui"
import { filesKeys } from "../lib/queryKeys"

/**
 * Server-side search per ADR 0018 §C.
 *
 * - Reads the live query from the `ui` store (cross-page widget).
 * - Debounces 250ms via `refDebounced`.
 * - Skips queries shorter than 2 characters.
 * - Cancels in-flight requests automatically when the key changes (handled
 *   by TanStack Query's built-in AbortSignal plumbing through the SDK).
 */
export function useSearch(client: VaultStore = defaultClient) {
  const ui = useUIStore()

  const debouncedQuery = refDebounced(
    computed(() => ui.searchQuery.trim()),
    250,
  )

  const typeFilter = computed(() => ui.searchType)

  const enabled = computed(() => debouncedQuery.value.length >= 2)

  const query = useInfiniteQuery({
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
    enabled,
    staleTime: 30_000,
  })

  const entries = computed<VaultEntry[]>(
    () => query.data.value?.pages.flatMap((p) => p.entries) ?? [],
  )

  return {
    query: debouncedQuery,
    entries,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  }
}
