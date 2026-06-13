import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { env } from "./lib/azure"
import { isBlobConfigured, getProvider } from "./lib/blob-provider"
import { initializeDatabase } from "./db"

const app = createApp({ withLogger: true })

const port = env.port

async function start() {
  // Initialize Cosmos DB database and container
  await initializeDatabase()

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] Vault API running on http://localhost:${info.port}`)
    console.log(`[server] Blob provider: ${getProvider()}`)
    if (!isBlobConfigured()) {
      console.warn(
        `[server] Blob storage credentials are NOT set. Check BLOB_PROVIDER and related env vars in .env`,
      )
    }
  })
}

start().catch((err) => {
  console.error("[server] Failed to start:", err)
  process.exit(1)
})
