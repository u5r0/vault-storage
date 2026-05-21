import { ref } from "vue"
import { defineStore } from "pinia"

export const useSettingsStore = defineStore("settings", () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  return { loading, error, account, notifications, security, storage }
})
