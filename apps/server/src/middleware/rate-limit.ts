import { RateLimiterMemory } from "rate-limiter-flexible"
import type { Context, Next } from "hono"

export function userRateLimit(limiter: RateLimiterMemory) {
  return async (c: Context, next: Next) => {
    const userId = (c as any).get("userId")
    if (userId) {
      try {
        await limiter.consume(userId)
      } catch {
        return c.json({ error: "Too many requests" }, 429)
      }
    }
    await next()
  }
}

export async function consumeEmailLimit(
  limiter: RateLimiterMemory,
  email: string,
  c: Context,
) {
  try {
    await limiter.consume(email)
  } catch {
    return c.json({ error: "Too many attempts for this email. Please try again later." }, 429)
  }
  return null
}
