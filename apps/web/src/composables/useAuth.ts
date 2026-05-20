import { computed } from "vue"
// @ts-ignore - Vuex types issue with package.json exports
import { useStore } from "vuex"
import { key } from "../store"

export function useAuth() {
  const store = useStore(key)

  return {
    isAuthenticated: computed(() => store.getters["auth/isAuthenticated"]),
    user: computed(() => store.getters["auth/user"]),
    userEmail: computed(() => store.getters["auth/userEmail"]),
    userId: computed(() => store.getters["auth/userId"]),
    loading: computed(() => store.getters["auth/loading"]),
    error: computed(() => store.getters["auth/error"]),
    checkAuth: () => store.dispatch("auth/checkAuth"),
    signUp: (email: string, password: string) => store.dispatch("auth/signUp", { email, password }),
    signIn: (email: string, password: string) => store.dispatch("auth/signIn", { email, password }),
    signOut: () => store.dispatch("auth/signOut"),
    requestMagicLink: (email: string) => store.dispatch("auth/requestMagicLink", email),
    verifyToken: (token: string) => store.dispatch("auth/verifyToken", token),
    forgotPassword: (email: string) => store.dispatch("auth/forgotPassword", email),
    resetPassword: (token: string, password: string) => store.dispatch("auth/resetPassword", { token, password }),
  }
}
