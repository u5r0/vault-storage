const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000"

interface AuthState {
  isAuthenticated: boolean
  user: { id: string; email: string; createdAt: string } | null
  loading: boolean
  error: string | null
}

const state: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
}

const mutations = {
  SET_AUTHENTICATED(state: AuthState, value: boolean) {
    state.isAuthenticated = value
  },
  SET_USER(state: AuthState, user: AuthState["user"]) {
    state.user = user
  },
  SET_LOADING(state: AuthState, value: boolean) {
    state.loading = value
  },
  SET_ERROR(state: AuthState, error: string | null) {
    state.error = error
  },
  CLEAR_AUTH(state: AuthState) {
    state.isAuthenticated = false
    state.user = null
    state.error = null
  },
}

const actions = {
  async checkAuth({ commit }: any) {
    commit("SET_LOADING", true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        commit("SET_AUTHENTICATED", true)
        commit("SET_USER", data.user)
      } else {
        commit("SET_AUTHENTICATED", false)
        commit("SET_USER", null)
      }
    } catch {
      commit("SET_AUTHENTICATED", false)
      commit("SET_USER", null)
    } finally {
      commit("SET_LOADING", false)
    }
  },

  async signUp({ commit }: any, { email, password }: { email: string; password: string }) {
    commit("SET_LOADING", true)
    commit("SET_ERROR", null)
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
      commit("SET_LOADING", false)
    }
  },

  async signIn({ commit }: any, { email, password }: { email: string; password: string }) {
    commit("SET_LOADING", true)
    commit("SET_ERROR", null)
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
      commit("SET_AUTHENTICATED", true)
      commit("SET_USER", data.user)
      return data
    } catch (error: any) {
      commit("SET_ERROR", error.message || "Login failed")
      throw error
    } finally {
      commit("SET_LOADING", false)
    }
  },

  async signOut({ commit }: any) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      })
    } finally {
      commit("CLEAR_AUTH")
    }
  },

  async requestMagicLink({ commit }: any, email: string) {
    commit("SET_LOADING", true)
    commit("SET_ERROR", null)
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
      commit("SET_LOADING", false)
    }
  },

  async verifyToken({ commit }: any, token: string) {
    commit("SET_LOADING", true)
    commit("SET_ERROR", null)
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify?token=${token}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Verification failed")
      }
      const data = await res.json()
      commit("SET_AUTHENTICATED", true)
      commit("SET_USER", data.user)
      return data
    } finally {
      commit("SET_LOADING", false)
    }
  },

  async forgotPassword({ commit }: any, email: string) {
    commit("SET_LOADING", true)
    commit("SET_ERROR", null)
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
      commit("SET_LOADING", false)
    }
  },

  async resetPassword({ commit }: any, { token, password }: { token: string; password: string }) {
    commit("SET_LOADING", true)
    commit("SET_ERROR", null)
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
      commit("SET_LOADING", false)
    }
  },
}

const getters = {
  isAuthenticated: (state: AuthState) => state.isAuthenticated,
  user: (state: AuthState) => state.user,
  userEmail: (state: AuthState) => state.user?.email || null,
  userId: (state: AuthState) => state.user?.id || null,
  loading: (state: AuthState) => state.loading,
  error: (state: AuthState) => state.error,
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
}
