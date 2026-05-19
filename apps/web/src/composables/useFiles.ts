import { computed, type Ref } from "vue"
import { useAsync } from "./useAsync"
import { client as defaultClient } from "@/lib/client"
import type { VaultStore, VaultEntry } from "@vault/sdk"

export function useFiles(
  entityId: Ref<string | null> | string | null,
  client: VaultStore = defaultClient,
) {
  const id = () => (typeof entityId === "string" ? entityId : entityId?.value ?? null)

  const { data, loading, error, refresh } = useAsync(
    () => client.listFiles({ entityId: id() ?? undefined }),
    id,
  )

  const entries = computed<VaultEntry[]>(() => data.value?.entries ?? [])

  return { entries, loading, error, refresh }
}
