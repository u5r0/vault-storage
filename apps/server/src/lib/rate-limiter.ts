/**
 * Rate-limiter factories. All buckets currently use `RateLimiterMemory`,
 * which keeps state in-process. This is fine for single-instance dev and
 * small deployments, but for any multi-instance production deploy these
 * should be swapped to `RateLimiterRedis` so users can't get N× their
 * limit by hitting different replicas. The interface is identical — just
 * the constructor changes.
 *
 * Per-user limits are split into reads vs writes per ADR-style guidance:
 * listing/searching/downloading is cheap and idempotent, so it gets a
 * larger budget than mutations, which are stateful and more expensive.
 *
 * The volumetric limiter is intended to cap bytes-per-window, not calls;
 * it is consumed inside the upload handler with the parsed body size,
 * not as a generic per-request middleware.
 */
import { RateLimiterMemory } from "rate-limiter-flexible"
import { getServerConfig } from "./env.js"

export const createRegisterLimiter      = () => new RateLimiterMemory({ points: 5,                 duration: 900  })
export const createLoginLimiter         = () => new RateLimiterMemory({ points: 10,                duration: 900  })
export const createMagicLinkLimiter     = () => new RateLimiterMemory({ points: 5,                 duration: 900  })
export const createPasswordResetLimiter = () => new RateLimiterMemory({ points: 5,                 duration: 3600 })

/** Reads (list, search, download, quick-links): generous, idempotent. */
export const createUserReadLimiter      = () => new RateLimiterMemory({ points: 600,               duration: 60   })
/** Writes (folder, upload, rename, move, delete): tighter. */
export const createUserWriteLimiter     = () => new RateLimiterMemory({ points: 120,               duration: 60   })

/** Bytes-per-window upload quota. Consumed by total payload size. */
export const createVolumetricLimiter    = () => new RateLimiterMemory({ points: 500 * 1024 * 1024, duration: 900  })

export const createIpLimiter            = () => new RateLimiterMemory({ points: 1000,              duration: 60   })

/**
 * Dev-only escape hatch so bulk tools (scripts/seed.ts) can hit the API
 * without tripping the user limiter. Honored only when NODE_ENV is not
 * "production"; in production it is a no-op regardless of value.
 */
export const rateLimitsDisabled = () => {
  const config = getServerConfig()
  return config.NODE_ENV !== "production" && config.RATE_LIMIT_DISABLED === "1"
}

if (rateLimitsDisabled()) {
  // eslint-disable-next-line no-console
  console.warn("[rate-limit] RATE_LIMIT_DISABLED=1 — all rate limits bypassed (dev only)")
}
