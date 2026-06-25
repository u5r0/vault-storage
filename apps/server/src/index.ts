import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { isBlobConfigured, getProvider } from "./lib/blob-provider"
import { ensureCorsForBrowserUploads } from "./lib/cors-bootstrap"
import { initializeDatabase } from "./db"
import { hydrateFromInfisical } from "./lib/infisical"
import { loadConfig } from "./lib/config"

const app = createApp({ withLogger: true })

async function start() {
  // 1. Fetch secrets from Infisical via managed identity (production).
  //    No-op in local dev when INFISICAL_IDENTITY_ID is not set — process.env
  //    is already populated by dotenv/config from .env above.
  await hydrateFromInfisical()

  // 2. Validate all environment variables against the Zod schema.
  //    Throws with clear field-level messages on missing / invalid config.
  const config = loadConfig()

  // 3. Initialize Cosmos DB database and container.
  await initializeDatabase()

  // 4. Configure CORS on the local blob backend for browser direct-uploads.
  //    No-op against production storage (R2/Azure managed externally).
  await ensureCorsForBrowserUploads()

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.log(`[server] Vault API running on http://localhost:${info.port}`)
    console.log(`[server] Blob provider: ${getProvider()}`)
    if (!isBlobConfigured()) {
      console.warn(
        "[server] Blob storage credentials are NOT set. " +
        "Check BLOB_PROVIDER and related env vars in .env",
      )
    }
  })
}

start().catch((err) => {
  console.error("[server] Failed to start:", err)
  process.exit(1)
})
