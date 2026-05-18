import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { HTTPException } from "hono/http-exception"
import { env, isConfigured } from "./lib/azure"
import files from "./routes/files"
import auth from "./routes/auth"

/**
 * Build the Hono app. Kept separate from `index.ts` so tests can
 * `app.request(...)` without binding to a port.
 *
 * `withLogger` is opt-out so tests stay quiet by default; the runtime
 * entry passes `{ withLogger: true }`.
 */
export function createApp(opts: { withLogger?: boolean } = {}) {
  const app = new Hono()

  if (opts.withLogger) app.use("*", logger())

  app.use(
    "*",
    cors({
      origin: env.allowedOrigin,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      azureConfigured: isConfigured(),
      container: env.containerName,
    }),
  )
  app.route("/api/auth", auth)

  app.route("/api/files", files)

  app.notFound((c) => c.json({ error: "Not found" }, 404))

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }
    console.error("[server] unexpected error:", err)
    return c.json({ error: "Internal server error" }, 500)
  })

  return app
}
