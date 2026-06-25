import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import type { Context, Next } from "hono"
import { loadConfig } from "../lib/config"

export function authenticate(required = true) {
  return async (c: Context, next: Next) => {
    const token = getCookie(c, "access")
    if (!token) {
      if (required) return c.json({ error: "Unauthenticated" }, 401)
      ;(c as any).set("userId", null)
      return next()
    }
    try {
      const { JWT_SECRET } = loadConfig()
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
