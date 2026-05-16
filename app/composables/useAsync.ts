import { ref, watchEffect, type Ref } from "vue"

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: () => unknown = () => undefined,
) {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      data.value = await fn()
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      // Keep previous data on error - don't clear it
    } finally {
      loading.value = false
    }
  }

  watchEffect(() => {
    deps()
    refresh()
  })

  return { data, loading, error, refresh }
}
