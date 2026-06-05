import { RateLimiterMemory, type RateLimiterRes } from "rate-limiter-flexible"
import type { Context, Next } from "hono"
import { rateLimitsDisabled } from "../lib/rate-limiter"

/**
 * Convert ms-until-refill into the integer seconds expected by HTTP's
 * `Retry-After` header. We round up so clients never retry too eagerly.
 */
function retryAfterSeconds(rejection: unknown): number {
  const ms = (rejection as RateLimiterRes | undefined)?.msBeforeNext ?? 1000
  return Math.max(1, Math.ceil(ms / 1000))
}

function tooManyResponse(c: Context, rejection: unknown) {
  c.header("Retry-After", String(retryAfterSeconds(rejection)))
  return c.json({ error: "Too many requests" }, 429)
}

/**
 * Per-user request limiter. No-ops if `userId` isn't set yet (i.e. the
 * route is unauthenticated, or this runs before `authenticate()`).
 *
 * Bypassed entirely when `RATE_LIMIT_DISABLED=1` and not in production.
 */
export function userRateLimit(limiter: RateLimiterMemory) {
  return async (c: Context, next: Next) => {
    if (rateLimitsDisabled) return next()
    const userId = (c as any).get("userId")
    if (userId) {
      try {
        await limiter.consume(userId)
      } catch (rejection) {
        return tooManyResponse(c, rejection)
      }
    }
    await next()
  }
}

/**
 * Charge an arbitrary number of points (typically bytes) against a
 * limiter for the current user. Returned response, when non-null, must
 * be returned by the caller — the request must not proceed.
 */
export async function consumeUserPoints(
  limiter: RateLimiterMemory,
  c: Context,
  points: number,
) {
  if (rateLimitsDisabled) return null
  const userId = (c as any).get("userId")
  if (!userId) return null
  try {
    await limiter.consume(userId, Math.max(1, Math.ceil(points)))
    return null
  } catch (rejection) {
    return tooManyResponse(c, rejection)
  }
}

export async function consumeEmailLimit(
  limiter: RateLimiterMemory,
  email: string,
  c: Context,
) {
  if (rateLimitsDisabled) return null
  try {
    await limiter.consume(email)
  } catch (rejection) {
    c.header("Retry-After", String(retryAfterSeconds(rejection)))
    return c.json(
      { error: "Too many attempts for this email. Please try again later." },
      429,
    )
  }
  return null
}
