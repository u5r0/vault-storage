import { shallowRef, ref } from "vue"
import { defineStore } from "pinia"
import { client } from "@/lib/client"

export const useSettingsStore = defineStore("settings", () => {
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)

  const maxUploadMb = ref<number | null>(null)

  const account = ref({
    email: "",
    name: "",
    bio: "",
    location: "",
    website: "",
    company: "",
    avatarUrl: "",
  })

  const notifications = ref({
    emailNotifications: true,
    pushNotifications: false,
    uploadAlerts: true,
    shareAlerts: true,
  })

  const security = ref({
    twoFactorEnabled: false,
    loginAlerts: true,
    sessionTimeout: 30,
  })

  const storage = ref({
    used: 0,
    total: 0,
    files: 0,
  })

  async function load() {
    loading.value = true
    error.value = null
    try {
      const settings = await client.getSettings()
      maxUploadMb.value = settings.maxUploadMb
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function save() {
    loading.value = true
    error.value = null
    try {
      const settings = await client.updateSettings({ maxUploadMb: maxUploadMb.value })
      maxUploadMb.value = settings.maxUploadMb
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return { loading, error, maxUploadMb, load, save, account, notifications, security, storage }
})
