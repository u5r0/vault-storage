import { toValue, type MaybeRefOrGetter } from "vue"
import { useMutation, useQueryClient } from "@tanstack/vue-query"
import { client as defaultClient } from "@/lib/client"
import type { VaultStore } from "@vault/sdk"
import { filesKeys } from "../lib/queryKeys"

export function useCreateFolder(
  parentId: MaybeRefOrGetter<string | null>,
  client: VaultStore = defaultClient,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) =>
      client.createFolder({ parentId: toValue(parentId), name }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: filesKeys.list(toValue(parentId)),
      })
    },
  })
}

export function useDeleteEntry(
  parentId: MaybeRefOrGetter<string | null>,
  client: VaultStore = defaultClient,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entryId: string) => client.deleteFile({ id: entryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: filesKeys.list(toValue(parentId)),
      })
    },
  })
}
