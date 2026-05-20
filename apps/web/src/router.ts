import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import FilesView from "./views/FilesView.vue"
import LoginView from "./views/LoginView.vue"
import SignupView from "./views/SignupView.vue"
import ForgotPasswordView from "./views/ForgotPasswordView.vue"
import ResetPasswordView from "./views/ResetPasswordView.vue"
import ProfileView from "./views/ProfileView.vue"
import SettingsView from "./views/SettingsView.vue"
import store from "./store"

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: LoginView },
  { path: "/signup", name: "signup", component: SignupView },
  { path: "/forgot-password", name: "forgot-password", component: ForgotPasswordView },
  { path: "/reset-password", name: "reset-password", component: ResetPasswordView },
  { path: "/verify", name: "verify", component: FilesView }, // Will redirect after token verification
  { path: "/", redirect: "/contents" },
  { path: "/contents/:entityId?", name: "content", component: FilesView, props: true },
  { path: "/profile", name: "profile", component: ProfileView },
  { path: "/settings", name: "settings", component: SettingsView },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Route guard: redirect to login if not authenticated
router.beforeEach(async (to, from, next) => {
  const isAuthenticated = store.getters["auth/isAuthenticated"]
  const loading = store.getters["auth/loading"]
  
  const publicRoutes = ["login", "signup", "forgot-password", "reset-password", "verify"]
  
  // If auth check is in progress, wait for it
  if (loading) {
    await store.dispatch("auth/checkAuth")
    return next(to)
  }
  
  if (!publicRoutes.includes(to.name as string) && !isAuthenticated) {
    next({ name: "login" })
  } else if (to.name === "login" && isAuthenticated) {
    next({ name: "content" })
  } else {
    next()
  }
})

/**
 * Helpers to translate between route state and app state.
 * Entity ID is a route param (applies to both folders and files).
 */
export function routeToEntityId(entityId: unknown): string | null {
  if (!entityId || entityId === "root") return null
  return entityId as string
}
