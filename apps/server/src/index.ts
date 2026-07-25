import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { getServerConfig } from "./lib/env"
import { isBlobConfigured, getProvider } from "./lib/blob-provider"
import { ensureCorsForBrowserUploads } from "./lib/cors-bootstrap"
import { initializeDatabase } from "./db"
import { validateProductionSecrets } from "./lib/config"

const app = createApp({ withLogger: true })

const serverConfig = getServerConfig()
const port = serverConfig.PORT

async function start() {
  // Refuse to boot in production with missing or default secrets.
  if (serverConfig.NODE_ENV === "production") {
    const DEV_FALLBACK = "dev-secret-change-me"
    const missing: string[] = []
    if (serverConfig.JWT_SECRET === DEV_FALLBACK) missing.push("JWT_SECRET")
    if (serverConfig.AUTH_SECRET === DEV_FALLBACK) missing.push("AUTH_SECRET")
    if (missing.length > 0) {
      throw new Error(
        `[config] Missing or insecure production secrets: ${missing.join(", ")}. ` +
          `Set each to a strong random value (e.g. openssl rand -hex 32) before starting.`,
      )
    }
  }

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
