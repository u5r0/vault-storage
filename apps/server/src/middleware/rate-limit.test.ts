import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { RateLimiterMemory } from "rate-limiter-flexible"

/**
 * Unit tests for the rate-limit middleware.
 *
 * The bypass flag (`rateLimitsDisabled`) is captured at module-load time
 * from `process.env`, so each variant of the bypass test owns its own
 * module copy via `vi.resetModules()` + a scoped dynamic import. Tests
 * for the non-bypass paths share a single import to keep the suite fast.
 */

vi.mock("../lib/env", () => ({
  getServerConfig: vi.fn(),
  resetConfigs: vi.fn(),
}))

function makeApp(setUserId: (c: any) => string | undefined, mw: any) {
  const app = new Hono()
  app.use("*", async (c, next) => {
    const id = setUserId(c)
    if (id) (c as any).set("userId", id)
    await next()
  })
  app.use("*", mw)
  app.get("/", (c) => c.json({ ok: true }))
  return app
}

async function loadFresh(env: Record<string, string | undefined>) {
  vi.resetModules()
  
  const { getServerConfig } = await import("../lib/env")
  vi.mocked(getServerConfig).mockReturnValue({
    NODE_ENV: env.NODE_ENV ?? "test",
    RATE_LIMIT_DISABLED: env.RATE_LIMIT_DISABLED,
    AUTH_SECRET: "test-secret",
    JWT_SECRET: "test-jwt-secret",
  })
  
  const original: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env)) {
    original[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    const limiter = await import("../lib/rate-limiter")
    const mw = await import("./rate-limit")
    return { limiter, mw }
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe("userRateLimit middleware", () => {
  let userRateLimit: typeof import("./rate-limit").userRateLimit
  let bucket: RateLimiterMemory

  beforeEach(async () => {
    // Load with bypass off (and not in production, so the env check is meaningful).
    const { mw } = await loadFresh({ NODE_ENV: "test", RATE_LIMIT_DISABLED: undefined })
    userRateLimit = mw.userRateLimit
    bucket = new RateLimiterMemory({ points: 2, duration: 60 })
  })

  it("allows requests under budget", async () => {
    const app = makeApp(() => "user-1", userRateLimit(bucket))
    const r1 = await app.request("/")
    expect(r1.status).toBe(200)
    const r2 = await app.request("/")
    expect(r2.status).toBe(200)
  })

  it("returns 429 with Retry-After once the bucket is empty", async () => {
    const app = makeApp(() => "user-2", userRateLimit(bucket))
    await app.request("/")
    await app.request("/")
    const blocked = await app.request("/")
    expect(blocked.status).toBe(429)
    const retryAfter = blocked.headers.get("Retry-After")
    expect(retryAfter).toBeTruthy()
    // Header is integer seconds; with 60s duration we expect a positive int ≤ 60.
    const seconds = Number(retryAfter)
    expect(Number.isInteger(seconds)).toBe(true)
    expect(seconds).toBeGreaterThanOrEqual(1)
    expect(seconds).toBeLessThanOrEqual(60)
    const body = (await blocked.json()) as { error: string }
    expect(body.error).toBe("Too many requests")
  })

  it("no-ops when no userId is set on the context", async () => {
    const app = makeApp(() => undefined, userRateLimit(bucket))
    // Hit it more than `points` times — limiter must not engage without a userId.
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/")
      expect(r.status).toBe(200)
    }
  })

  it("scopes budgets per userId", async () => {
    let user = "alice"
    const app = makeApp(() => user, userRateLimit(bucket))
    await app.request("/") // alice 1/2
    await app.request("/") // alice 2/2
    user = "bob"
    const r = await app.request("/")
    expect(r.status).toBe(200) // bob's bucket is fresh
  })
})

describe("consumeUserPoints", () => {
  let consumeUserPoints: typeof import("./rate-limit").consumeUserPoints

  beforeEach(async () => {
    const { mw } = await loadFresh({ NODE_ENV: "test", RATE_LIMIT_DISABLED: undefined })
    consumeUserPoints = mw.consumeUserPoints
  })

  it("returns null when the cost fits the budget", async () => {
    const bucket = new RateLimiterMemory({ points: 100, duration: 60 })
    const app = new Hono()
    app.use("*", async (c, next) => {
      ;(c as any).set("userId", "user-pts")
      await next()
    })
    app.post("/", async (c) => {
      const reject = await consumeUserPoints(bucket, c, 50)
      if (reject) return reject
      return c.json({ ok: true })
    })
    const r = await app.request("/", { method: "POST" })
    expect(r.status).toBe(200)
  })

  it("returns 429 with Retry-After when the cost exceeds the budget", async () => {
    const bucket = new RateLimiterMemory({ points: 10, duration: 60 })
    const app = new Hono()
    app.use("*", async (c, next) => {
      ;(c as any).set("userId", "user-overflow")
      await next()
    })
    app.post("/", async (c) => {
      const reject = await consumeUserPoints(bucket, c, 1_000_000)
      if (reject) return reject
      return c.json({ ok: true })
    })
    const r = await app.request("/", { method: "POST" })
    expect(r.status).toBe(429)
    expect(r.headers.get("Retry-After")).toBeTruthy()
  })

  it("no-ops when no userId is on the context (anonymous routes)", async () => {
    const bucket = new RateLimiterMemory({ points: 10, duration: 60 })
    const app = new Hono()
    app.post("/", async (c) => {
      const reject = await consumeUserPoints(bucket, c, 1_000_000)
      if (reject) return reject
      return c.json({ ok: true })
    })
    const r = await app.request("/", { method: "POST" })
    expect(r.status).toBe(200)
  })
})

describe("consumeEmailLimit", () => {
  it("returns 429 with Retry-After when the email's bucket is empty", async () => {
    const { mw } = await loadFresh({ NODE_ENV: "test", RATE_LIMIT_DISABLED: undefined })
    const bucket = new RateLimiterMemory({ points: 1, duration: 60 })
    const app = new Hono()
    app.post("/", async (c) => {
      const blocked = await mw.consumeEmailLimit(bucket, "u@example.com", c)
      if (blocked) return blocked
      return c.json({ ok: true })
    })
    const ok = await app.request("/", { method: "POST" })
    expect(ok.status).toBe(200)
    const blocked = await app.request("/", { method: "POST" })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get("Retry-After")).toBeTruthy()
  })
})

describe("RATE_LIMIT_DISABLED bypass flag", () => {
  it("bypasses userRateLimit when set in non-production envs", async () => {
    const { mw } = await loadFresh({ NODE_ENV: "test", RATE_LIMIT_DISABLED: "1" })
    const bucket = new RateLimiterMemory({ points: 1, duration: 60 })
    const app = makeApp(() => "user-bypass", mw.userRateLimit(bucket))
    // Hit it many more times than `points` — must all pass.
    for (let i = 0; i < 10; i++) {
      const r = await app.request("/")
      expect(r.status).toBe(200)
    }
  })

  it("does NOT bypass when NODE_ENV=production, even with the flag set", async () => {
    const { mw } = await loadFresh({ NODE_ENV: "production", RATE_LIMIT_DISABLED: "1" })
    const bucket = new RateLimiterMemory({ points: 1, duration: 60 })
    const app = makeApp(() => "user-prod", mw.userRateLimit(bucket))
    const ok = await app.request("/")
    expect(ok.status).toBe(200)
    const blocked = await app.request("/")
    expect(blocked.status).toBe(429)
  })

  it("bypasses consumeEmailLimit too", async () => {
    const { mw } = await loadFresh({ NODE_ENV: "test", RATE_LIMIT_DISABLED: "1" })
    const bucket = new RateLimiterMemory({ points: 1, duration: 60 })
    const app = new Hono()
    app.post("/", async (c) => {
      const blocked = await mw.consumeEmailLimit(bucket, "x@example.com", c)
      if (blocked) return blocked
      return c.json({ ok: true })
    })
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/", { method: "POST" })
      expect(r.status).toBe(200)
    }
  })
})
