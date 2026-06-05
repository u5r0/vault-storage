import { computed, toValue, type MaybeRefOrGetter } from "vue"
import { useInfiniteQuery } from "@tanstack/vue-query"
import { client as defaultClient } from "@/lib/client"
import type { ListFilesResult, VaultEntry, VaultStore } from "@vault/sdk"
import { filesKeys } from "../lib/queryKeys"

export function useFiles(
  entityId: MaybeRefOrGetter<string | null>,
  client: VaultStore = defaultClient,
) {
  const query = useInfiniteQuery({
    queryKey: computed(() => filesKeys.list(toValue(entityId))),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      client.listFiles({
        entityId: toValue(entityId) ?? undefined,
        cursor: pageParam,
        pageSize: 100,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListFilesResult) => last.cursor ?? undefined,
    staleTime: 60_000,
  })

  const entries = computed<VaultEntry[]>(
    () => query.data.value?.pages.flatMap((p) => p.entries) ?? [],
  )

  return {
    entries,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
    query,
  }
}
