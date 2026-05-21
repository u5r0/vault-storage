import { createApp } from "vue"
import { router } from "./router"
import App from "./App.vue"
import store, { key } from "./store"
import "./style.css"

const app = createApp(App)
app.use(router).use(store, key)

// Check auth state on app mount (await to ensure auth is verified before routing)
await store.dispatch("auth/checkAuth")

app.mount("#app")
