import { ref, watchEffect, type Ref } from "vue"
import { client } from "@/lib/client"
import type { VaultEntry } from "@vault/sdk"

export function useFiles(path: Ref<string> | string) {
  const entries = ref<VaultEntry[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const p = typeof path === "string" ? path : path.value
      const result = await client.listFiles({ path: p })
      entries.value = result.entries
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
    }
  }

  watchEffect(() => {
    // re-run when path changes
    void (typeof path === "string" ? path : path.value)
    refresh()
  })

  return { entries, loading, error, refresh }
}
