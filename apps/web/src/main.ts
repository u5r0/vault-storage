import { createApp } from "vue"
import { createPinia } from "pinia"
import { router } from "./router"
import App from "./App.vue"
import { registerGlobals } from "./components/register"
import { useAuthStore } from "./stores/auth"
import { useUIStore } from "./stores/ui"
import "./style.css"

const app = createApp(App)
const pinia = createPinia()

app.use(pinia).use(router)
registerGlobals(app)

const authStore = useAuthStore()
useUIStore()

await authStore.checkAuth()

app.mount("#app")
