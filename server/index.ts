import "dotenv/config"
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { HTTPException } from "hono/http-exception"
import { env, isConfigured } from "./lib/azure"
import files from "./routes/files"

const app = new Hono()

app.use("*", logger())
app.use(
  "*",
  cors({
    origin: env.allowedOrigin,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
)

/** Health probe */
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    azureConfigured: isConfigured(),
    container: env.containerName,
  }),
)

/** Mount files routes */
app.route("/api/files", files)

app.notFound((c) => c.json({ error: "Not found" }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error("[server] unexpected error:", err)
  return c.json({ error: "Internal server error" }, 500)
})

const port = env.port
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] Vault API running on http://localhost:${info.port}`)
  if (!isConfigured()) {
    console.warn(
      "[server] Azure credentials are NOT set. Fill in AZURE_STORAGE_* in .env",
    )
  }
})
