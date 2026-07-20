import { toValue, type MaybeRefOrGetter } from "vue"
import { useMutation, useQueryClient } from "@tanstack/vue-query"
import { client as defaultClient } from "@/lib/client"
import type { VaultStore } from "@vault/sdk"
import { filesKeys } from "../lib/queryKeys"
import { useVaultIndex } from "./useVaultIndex"

/**
 * File mutation hooks. Each hook invalidates the relevant TanStack Query
 * cache key AND updates the local MiniSearch index incrementally so search
 * results reflect writes immediately, without waiting for a re-hydration.
 */

export function useCreateFolder(
  parentId: MaybeRefOrGetter<string | null>,
  client: VaultStore = defaultClient,
) {
  const queryClient = useQueryClient()
  const index = useVaultIndex(client)

  return useMutation({
    mutationFn: (name: string) =>
      client.createFolder({ parentId: toValue(parentId), name }),
    onSuccess: (result, name) => {
      // Add the new folder to the local index immediately so it appears in
      // search results before the list query re-fetches. CreateFolderResult
      // has no name, so use the name the caller just submitted.
      index.addEntry({
        id: result.id,
        name,
        type: "folder",
        parentId: toValue(parentId),
        createdAt: new Date().toISOString(),
        modifiedAt: null,
        size: 0,
        contentType: null,
        blobName: null,
        deletedAt: null,
      } as any)
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
  const index = useVaultIndex(client)

  return useMutation({
    mutationFn: (entryId: string) => client.deleteFile({ id: entryId }),
    onSuccess: (_result, entryId) => {
      index.removeEntry(entryId)
      queryClient.invalidateQueries({
        queryKey: filesKeys.list(toValue(parentId)),
      })
    },
  })
}

export function useRenameEntry(client: VaultStore = defaultClient) {
  const queryClient = useQueryClient()
  const index = useVaultIndex(client)

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      client.renameFile({ id, name }),
    onSuccess: (_result, { id, name }) => {
      // RenameResult is { id, name } — patch only the name in the index.
      // The list re-fetch will reconcile all other fields.
      index.patchEntry(id, { name })
      queryClient.invalidateQueries({ queryKey: filesKeys.lists() })
    },
  })
}

export function useMoveEntry(client: VaultStore = defaultClient) {
  const queryClient = useQueryClient()
  const index = useVaultIndex(client)

  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      client.moveFile({ id, parentId }),
    onSuccess: (_result, { id, parentId }) => {
      // MoveResult is { id, parentId } — patch only parentId in the index.
      index.patchEntry(id, { parentId })
      queryClient.invalidateQueries({ queryKey: filesKeys.lists() })
    },
  })
}
