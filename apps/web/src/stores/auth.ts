import { ref, computed } from "vue"
import { defineStore } from "pinia"

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000"

interface User {
  id: string
  email: string
  createdAt: string
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)
  const userEmail = computed(() => user.value?.email ?? null)
  const userId = computed(() => user.value?.id ?? null)

  function clearAuth() {
    user.value = null
    error.value = null
  }

  async function checkAuth() {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        user.value = data.user
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  async function signUp(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Signup failed")
      }
      return await res.json()
    } finally {
      loading.value = false
    }
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Login failed")
      }
      const data = await res.json()
      user.value = data.user
      return data
    } catch (err: any) {
      error.value = err.message || "Login failed"
      throw err
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" })
    } finally {
      clearAuth()
    }
  }

  async function requestMagicLink(email: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to send magic link")
      }
      return await res.json()
    } finally {
      loading.value = false
    }
  }

  async function verifyToken(token: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify?token=${token}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Verification failed")
      }
      const data = await res.json()
      user.value = data.user
      return data
    } finally {
      loading.value = false
    }
  }

  async function forgotPassword(email: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to send reset email")
      }
      return await res.json()
    } finally {
      loading.value = false
    }
  }

  async function resetPassword(token: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Password reset failed")
      }
      return await res.json()
    } finally {
      loading.value = false
    }
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    userEmail,
    userId,
    checkAuth,
    signUp,
    signIn,
    signOut,
    requestMagicLink,
    verifyToken,
    forgotPassword,
    resetPassword,
  }
})
