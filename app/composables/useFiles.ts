import { computed, type Ref } from "vue"
import { useAsync } from "./useAsync"
import { client as defaultClient } from "@/lib/client"
import type { VaultStore, VaultEntry } from "@vault/sdk"

export function useFiles(
  path: Ref<string> | string,
  client: VaultStore = defaultClient,
) {
  const p = () => (typeof path === "string" ? path : path.value)

  const { data, loading, error, refresh } = useAsync(
    () => client.listFiles({ path: p() }),
    p,
  )

  const entries = computed<VaultEntry[]>(() => data.value?.entries ?? [])

  return { entries, loading, error, refresh }
}
