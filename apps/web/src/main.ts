import { createApp } from "vue"
import { createPinia } from "pinia"
import { VueQueryPlugin, type VueQueryPluginOptions } from "@tanstack/vue-query"
import { router } from "./router"
import App from "./App.vue"
import { registerGlobals } from "./components/register"
import { useAuthStore } from "./stores/auth"
import { useUIStore } from "./stores/ui"
import { useConfigStore } from "./stores/config"
import { useSettingsStore } from "./stores/settings"
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
app.use(router)

const authStore = useAuthStore()
useUIStore()
useConfigStore().load()

authStore.checkAuth().then(() => {
  if (authStore.isAuthenticated) useSettingsStore().load()
})

app.mount("#app")
