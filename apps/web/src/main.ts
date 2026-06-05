import { createApp } from "vue"
import { createPinia } from "pinia"
import { VueQueryPlugin, type VueQueryPluginOptions } from "@tanstack/vue-query"
import { router } from "./router"
import App from "./App.vue"
import { registerGlobals } from "./components/register"
import { useAuthStore } from "./stores/auth"
import { useUIStore } from "./stores/ui"
import "./style.css"

const app = createApp(App)
const pinia = createPinia()

const vueQueryOptions: VueQueryPluginOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  },
}

app.use(pinia)
app.use(VueQueryPlugin, vueQueryOptions)
registerGlobals(app)

// Initialize auth and theme before the router fires its first navigation.
// The router guard reads authStore.isAuthenticated — if we mount before
// checkAuth() resolves, the guard sees isAuthenticated=false and redirects
// to /login on every hard refresh.
const authStore = useAuthStore()
useUIStore()

await authStore.checkAuth()

// Register router only after auth state is known so the initial navigation
// guard has accurate isAuthenticated state.
app.use(router)
app.mount("#app")
