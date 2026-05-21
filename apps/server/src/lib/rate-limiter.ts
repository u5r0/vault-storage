import { RateLimiterMemory } from "rate-limiter-flexible"

export const createRegisterLimiter      = () => new RateLimiterMemory({ points: 5,               duration: 900  })
export const createLoginLimiter         = () => new RateLimiterMemory({ points: 10,              duration: 900  })
export const createMagicLinkLimiter     = () => new RateLimiterMemory({ points: 5,               duration: 900  })
export const createPasswordResetLimiter = () => new RateLimiterMemory({ points: 5,               duration: 3600 })
export const createUserRequestLimiter   = () => new RateLimiterMemory({ points: 200,             duration: 60   })
export const createVolumetricLimiter    = () => new RateLimiterMemory({ points: 500 * 1024 * 1024, duration: 900 })
export const createIpLimiter            = () => new RateLimiterMemory({ points: 1000,            duration: 60   })
