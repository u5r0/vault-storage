import { ref, computed } from "vue"
import { defineStore } from "pinia"
import { getClientConfig } from "../lib/env"

const API_BASE = getClientConfig().VITE_API_URL || ""

interface User {
  id: string
  email: string
  name: string | null
  verified: boolean
  lockedUntil: string | null
  createdAt: string
}

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export const useAuthStore = defineStore("auth", () => {
  const isInitializing = ref(true)
  const user = ref<User | null>(null)
  let checkAuthPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => user.value !== null)
  const userEmail = computed(() => user.value?.email ?? null)
  const userId = computed(() => user.value?.id ?? null)

  function clearAuth() {
    user.value = null
  }

  async function checkAuth() {
    if (checkAuthPromise) {
      return checkAuthPromise
    }
    checkAuthPromise = (async () => {
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
        isInitializing.value = false
        checkAuthPromise = null
      }
    })()
    return checkAuthPromise
  }

  function waitForInitialization(): Promise<void> {
    return checkAuth()
  }

  async function signUp(email: string, password: string, name?: string) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Signup failed")
    }
    return await res.json()
  }

  async function signIn(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.error === "email_not_verified") {
        throw new AuthError("email_not_verified", "Email not verified")
      }
      throw new AuthError(data.error || "login_failed", data.error || "Login failed")
    }
    const data = await res.json()
    user.value = data.user
    return data
  }

  async function signOut() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" })
    } finally {
      clearAuth()
    }
  }

  async function requestMagicLink(email: string) {
    const res = await fetch(`${API_BASE}/api/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to send magic link")
    }
    return await res.json()
  }

  async function resendVerification(email: string) {
    const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to resend verification email")
    }
    return await res.json()
  }

  async function verifyToken(token: string) {
    const res = await fetch(
      `${API_BASE}/api/auth/verify?token=${encodeURIComponent(token)}`,
      { credentials: "include" },
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Verification failed")
    }
    const data = await res.json()
    user.value = data.user
    return data
  }

  async function forgotPassword(email: string) {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to send reset email")
    }
    return await res.json()
  }

  async function resetPassword(token: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Password reset failed")
    }
    return await res.json()
  }

  return {
    isInitializing,
    user,
    isAuthenticated,
    userEmail,
    userId,
    checkAuth,
    waitForInitialization,
    signUp,
    signIn,
    signOut,
    requestMagicLink,
    resendVerification,
    verifyToken,
    forgotPassword,
    resetPassword,
  }
})
