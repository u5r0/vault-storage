import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { env, isConfigured } from "./lib/azure"
import { initializeDatabase } from "./db"

const app = createApp({ withLogger: true })

const port = env.port

async function start() {
  // Initialize Cosmos DB database and container
  await initializeDatabase()

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] Vault API running on http://localhost:${info.port}`)
    if (!isConfigured()) {
      console.warn(
        "[server] Azure credentials are NOT set. Fill in AZURE_STORAGE_* in .env",
      )
    }
  })
}

start().catch((err) => {
  console.error("[server] Failed to start:", err)
  process.exit(1)
})
