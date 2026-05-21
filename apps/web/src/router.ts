import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import FilesView from "./views/FilesView.vue"
import LoginView from "./views/LoginView.vue"
import SignupView from "./views/SignupView.vue"
import ForgotPasswordView from "./views/ForgotPasswordView.vue"
import ResetPasswordView from "./views/ResetPasswordView.vue"
import ProfileView from "./views/ProfileView.vue"
import SettingsView from "./views/SettingsView.vue"
import AppLayout from "./layouts/AppLayout.vue"
import AuthLayout from "./layouts/AuthLayout.vue"
import { useAuthStore } from "./stores/auth"

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: LoginView, meta: { layout: AuthLayout } },
  { path: "/signup", name: "signup", component: SignupView, meta: { layout: AuthLayout } },
  { path: "/forgot-password", name: "forgot-password", component: ForgotPasswordView, meta: { layout: AuthLayout } },
  { path: "/reset-password", name: "reset-password", component: ResetPasswordView, meta: { layout: AuthLayout } },
  { path: "/verify", name: "verify", component: FilesView, meta: { layout: AuthLayout } },
  { path: "/", redirect: "/contents" },
  { path: "/contents/:entityId?", name: "content", component: FilesView, props: true, meta: { layout: AppLayout } },
  { path: "/profile", name: "profile", component: ProfileView, meta: { layout: AppLayout } },
  { path: "/settings", name: "settings", component: SettingsView, meta: { layout: AppLayout } },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Route guard: redirect to login if not authenticated
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  const publicRoutes = ["login", "signup", "forgot-password", "reset-password", "verify"]

  if (!publicRoutes.includes(to.name as string) && !authStore.isAuthenticated) {
    next({ name: "login" })
  } else if (to.name === "login" && authStore.isAuthenticated) {
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
