import { storeToRefs } from "pinia"
import { useAuthStore } from "../stores/auth"

export function useAuth() {
  const store = useAuthStore()
  const { user, loading, error, isAuthenticated, userEmail, userId } = storeToRefs(store)
  return {
    user,
    loading,
    error,
    isAuthenticated,
    userEmail,
    userId,
    checkAuth: store.checkAuth,
    signUp: store.signUp,
    signIn: store.signIn,
    signOut: store.signOut,
    requestMagicLink: store.requestMagicLink,
    verifyToken: store.verifyToken,
    forgotPassword: store.forgotPassword,
    resetPassword: store.resetPassword,
  }
}
