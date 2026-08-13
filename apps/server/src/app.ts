import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { HTTPException } from "hono/http-exception"
import { getServerConfig } from "./lib/env.js"
import { createIpLimiter, rateLimitsDisabled } from "./lib/rate-limiter.js"
import type { RateLimiterRes } from "rate-limiter-flexible"
import files from "./controllers/files.js"
import auth from "./controllers/auth.js"
import settings from "./controllers/settings.js"

const serverConfig = getServerConfig()

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

  const ipLimiter = createIpLimiter()
  app.use("*", async (c, next) => {
    if (rateLimitsDisabled()) return next()
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown"
    try {
      await ipLimiter.consume(ip)
    } catch (rejection) {
      const ms = (rejection as RateLimiterRes | undefined)?.msBeforeNext ?? 1000
      c.header("Retry-After", String(Math.max(1, Math.ceil(ms / 1000))))
      return c.json({ error: "Too many requests" }, 429)
    }
    await next()
  })

  app.use(
    "*",
    cors({
      origin: serverConfig.ALLOWED_ORIGIN,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.0.0",
    }),
  )

  app.get("/api/config", (c) =>
    c.json({
      maxUploadMb: serverConfig.MAX_UPLOAD_MB,
    }),
  )

  app.route("/api/auth", auth)

  app.route("/api/files", files)

  app.route("/api/settings", settings)

  app.notFound((c) => c.json({ error: "Not found" }, 404))

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      // Honor a custom Response if the thrower attached one (e.g. structured
      // error codes like { error: "email_not_verified" }). Otherwise fall back
      // to the default `{ error: <message> }` JSON shape the rest of the app
      // relies on.
      if (err.res) return err.res
      return c.json({ error: err.message }, err.status)
    }
    console.error("[server] unexpected error:", err)
    return c.json({ error: "Internal server error" }, 500)
  })

  return app
}
