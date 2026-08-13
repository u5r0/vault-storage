import { ref } from "vue"
import { defineStore } from "pinia"
import { client } from "@/lib/client"

const DEFAULT_MAX_UPLOAD_MB = 500

export const useConfigStore = defineStore("config", () => {
  const maxUploadMb = ref(DEFAULT_MAX_UPLOAD_MB)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const config = await client.getConfig()
      maxUploadMb.value = config.maxUploadMb
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { maxUploadMb, loading, error, load }
})
