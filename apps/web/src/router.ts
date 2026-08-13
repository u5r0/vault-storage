import { createRouter, createWebHistory } from "vue-router"
import { authRoutes }     from "./modules/auth"
import { filesRoutes }    from "./modules/files"
import { settingsRoutes } from "./modules/settings"
import { profileRoutes }  from "./modules/profile"
import { useAuthStore }   from "./stores/auth"
import AppLayout from "./layouts/AppLayout.vue"
import AuthLayout from "./layouts/AuthLayout.vue"
import AccountLayout from "./layouts/AccountLayout.vue"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/contents" },
    ...authRoutes.map(route => ({
      ...route,
      meta: { ...route.meta, layout: AuthLayout, requiresAuth: false }
    })),
    ...filesRoutes.map(route => ({
      ...route,
      meta: { ...route.meta, layout: AppLayout, requiresAuth: true }
    })),
    ...settingsRoutes.map(route => ({
      ...route,
      meta: { ...route.meta, layout: AccountLayout, requiresAuth: true }
    })),
    ...profileRoutes.map(route => ({
      ...route,
      meta: { ...route.meta, layout: AccountLayout, requiresAuth: true }
    })),
  ],
})

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()
  
  if (auth.isInitializing) {
    await auth.waitForInitialization()
  }
  
  const requiresAuth = to.meta.requiresAuth ?? true
  if (requiresAuth && !auth.isAuthenticated) {
    next({ name: "login" })
  } else if (to.name === "login" && auth.isAuthenticated) {
    next({ name: "content" })
  } else {
    next()
  }
})

/** Coerce a route param to a nullable entity ID. */
export function routeToEntityId(entityId: unknown): string | null {
  if (!entityId || entityId === "root") return null
  return entityId as string
}