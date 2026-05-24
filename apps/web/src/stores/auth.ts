import { ref, computed } from "vue"
import { defineStore } from "pinia"

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000"

interface User {
  id: string
  email: string
  name: string | null
  verified: boolean
  lockedUntil: string | null
  createdAt: string
}

/**
 * Error thrown by `signIn` so callers can branch on a stable code instead of
 * parsing the message. Mirrors the server's structured 403 body
 * `{ "error": "email_not_verified" }` (ADR 0019 §B1, §D4).
 */
export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "AuthError"
  }
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

  /**
   * Privacy-preserving register (ADR 0019 §B4). The server responds 200 with
   * `{ ok, message }` regardless of whether the email is new; the SPA
   * navigates to /check-email and lets the user finish via the email link.
   */
  async function signUp(email: string, password: string, name?: string) {
    loading.value = true
    error.value = null
    try {
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
        const data = await res.json().catch(() => ({}))
        // Structured error code from the server (e.g. "email_not_verified").
        if (data.error === "email_not_verified") {
          throw new AuthError("email_not_verified", "Email not verified")
        }
        throw new AuthError(data.error || "login_failed", data.error || "Login failed")
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
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to send magic link")
      }
      return await res.json()
    } finally {
      loading.value = false
    }
  }

  /**
   * Resend the verification link to an unverified user (ADR 0019 §B5).
   * Server is privacy-preserving: always 200, even if the email is unknown
   * or already verified.
   */
  async function resendVerification(email: string) {
    loading.value = true
    error.value = null
    try {
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
    } finally {
      loading.value = false
    }
  }

  /**
   * Consume a magic-link token. Per ADR 0019 §B6 the server now sets cookies
   * for both `email-verification` and `login` token branches, so on success
   * the user is fully authenticated.
   */
  async function verifyToken(token: string) {
    loading.value = true
    error.value = null
    try {
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
        const data = await res.json().catch(() => ({}))
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
        const data = await res.json().catch(() => ({}))
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
    resendVerification,
    verifyToken,
    forgotPassword,
    resetPassword,
  }
})
