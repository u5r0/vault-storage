import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { env } from "./lib/azure"
import { isBlobConfigured, getProvider } from "./lib/blob-provider"
import { ensureCorsForBrowserUploads } from "./lib/cors-bootstrap"
import { initializeDatabase } from "./db"
import { validateProductionSecrets } from "./lib/config"

const app = createApp({ withLogger: true })

const port = env.port

async function start() {
  // Refuse to boot in production with missing or default secrets.
  validateProductionSecrets()

  // Initialize Cosmos DB database and container
  await initializeDatabase()

  // Configure CORS on the local blob backend so the SPA can PUT directly
  // to presigned URLs. No-op when running against production storage.
  await ensureCorsForBrowserUploads()

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
