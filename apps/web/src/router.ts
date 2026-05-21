import { createRouter, createWebHistory } from "vue-router"
import { authRoutes }     from "./modules/auth"
import { filesRoutes }    from "./modules/files"
import { settingsRoutes } from "./modules/settings"
import { profileRoutes }  from "./modules/profile"
import { useAuthStore }   from "./stores/auth"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/contents" },
    ...authRoutes,
    ...filesRoutes,
    ...settingsRoutes,
    ...profileRoutes,
  ],
})

const publicRoutes = new Set(["login", "signup", "forgot-password", "reset-password", "verify"])

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  if (!publicRoutes.has(to.name as string) && !auth.isAuthenticated) {
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
