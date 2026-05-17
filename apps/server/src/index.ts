import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { env, isConfigured } from "./lib/azure"

const app = createApp({ withLogger: true })

const port = env.port
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] Vault API running on http://localhost:${info.port}`)
  if (!isConfigured()) {
    console.warn(
      "[server] Azure credentials are NOT set. Fill in AZURE_STORAGE_* in .env",
    )
  }
})
