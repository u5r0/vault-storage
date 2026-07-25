import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import type { Context, Next } from "hono"
import { getServerConfig } from "../lib/env"

const serverConfig = getServerConfig()
const JWT_SECRET = serverConfig.JWT_SECRET

export function authenticate(required = true) {
  return async (c: Context, next: Next) => {
    const token = getCookie(c, "access")
    if (!token) {
      if (required) return c.json({ error: "Unauthenticated" }, 401)
      ;(c as any).set("userId", null)
      return next()
    }
    try {
      const decoded = (await verify(token, JWT_SECRET, "HS256")) as any
      ;(c as any).set("userId", decoded.sub ?? decoded.id ?? null)
      await next()
    } catch {
      if (required) return c.json({ error: "Unauthenticated" }, 401)
      ;(c as any).set("userId", null)
      await next()
    }
  }
}
