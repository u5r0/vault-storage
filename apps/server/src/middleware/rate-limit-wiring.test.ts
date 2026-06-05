import { describe, it, expect, vi, beforeEach } from "vitest"
import type { RateLimiterMemory } from "rate-limiter-flexible"

/**
 * Structural test for the per-route limiter wiring in the files controller.
 *
 * The runtime behavior of the limiter (429, Retry-After, bypass flag) is
 * covered by `rate-limit.test.ts`. Here we pin the *wiring* — read routes
 * use the read limiter, write routes use the write limiter, and the
 * upload route additionally charges the volumetric limiter by total
 * payload bytes. Wiring tests catch the easy regression of accidentally
 * swapping the buckets, without needing to exhaust real budgets.
 */

const userRateLimitCalls: RateLimiterMemory[] = []
const consumePointsCalls: { limiter: RateLimiterMemory; points: number }[] = []

vi.mock("./rate-limit", () => ({
  // Record which limiter each route is wired to in the order the
  // controller registers them. The middleware itself is a no-op.
  userRateLimit: (limiter: RateLimiterMemory) => {
    userRateLimitCalls.push(limiter)
    return async (_c: any, next: any) => next()
  },
  consumeUserPoints: async (
    limiter: RateLimiterMemory,
    _c: any,
    points: number,
  ) => {
    consumePointsCalls.push({ limiter, points })
    return null
  },
}))

vi.mock("./authenticate", () => ({
  authenticate: () => async (c: any, next: any) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001")
    await next()
  },
}))

vi.mock("../services/files", () => ({
  filesService: {
    list: vi.fn().mockResolvedValue({ entries: [], cursor: null }),
    search: vi.fn().mockResolvedValue({ entries: [], cursor: null }),
    createFolder: vi.fn().mockResolvedValue({ id: "folder-id" }),
    upload: vi.fn().mockResolvedValue([]),
    download: vi.fn().mockResolvedValue({
      stream: (async function* () {})(),
      metadata: { contentType: "text/plain", size: 0 },
      name: "x.txt",
    }),
    rename: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue({ deleted: 1 }),
    quickLinks: vi.fn().mockResolvedValue({ starred: 0, recent: 0, tags: 0, trash: 0 }),
  },
}))

/**
 * Route declaration order in `controllers/files.ts`. Keep this in sync
 * with the controller; if a route is added or reordered, this test
 * needs to be updated to reflect the new wiring.
 */
const ROUTE_ORDER = [
  "GET /",
  "GET /search",
  "GET /download",
  "GET /quick-links",
  "POST /folder",
  "POST /upload",
  "PATCH /rename",
  "PATCH /move",
  "DELETE /",
] as const

describe("files controller — limiter wiring", () => {
  let app: any
  let readLimiter: RateLimiterMemory
  let writeLimiter: RateLimiterMemory
  let volumetricLimiter: RateLimiterMemory

  beforeEach(async () => {
    vi.resetModules()
    userRateLimitCalls.length = 0
    consumePointsCalls.length = 0

    const rl = await import("../lib/rate-limiter")
    readLimiter = rl.createUserReadLimiter()
    writeLimiter = rl.createUserWriteLimiter()
    volumetricLimiter = rl.createVolumetricLimiter()
    vi.spyOn(rl, "createUserReadLimiter").mockReturnValue(readLimiter)
    vi.spyOn(rl, "createUserWriteLimiter").mockReturnValue(writeLimiter)
    vi.spyOn(rl, "createVolumetricLimiter").mockReturnValue(volumetricLimiter)

    const { Hono } = await import("hono")
    const { default: files } = await import("../controllers/files")
    app = new Hono()
    app.route("/api/files", files)
  })

  it("each route is wired to the expected limiter, in declaration order", () => {
    expect(userRateLimitCalls).toHaveLength(ROUTE_ORDER.length)

    const expected: Record<(typeof ROUTE_ORDER)[number], RateLimiterMemory> = {
      "GET /":            readLimiter,
      "GET /search":      readLimiter,
      "GET /download":    readLimiter,
      "GET /quick-links": readLimiter,
      "POST /folder":     writeLimiter,
      "POST /upload":     writeLimiter,
      "PATCH /rename":    writeLimiter,
      "PATCH /move":      writeLimiter,
      "DELETE /":         writeLimiter,
    }

    for (let i = 0; i < ROUTE_ORDER.length; i++) {
      const route = ROUTE_ORDER[i]
      expect(userRateLimitCalls[i], `route ${route} got the wrong limiter`).toBe(
        expected[route],
      )
    }
  })

  it("read and write limiter are distinct instances", () => {
    expect(readLimiter).not.toBe(writeLimiter)
  })

  it("upload charges the volumetric limiter by total bytes", async () => {
    const fd = new FormData()
    const payload = "x".repeat(2048)
    fd.set("files", new File([payload], "x.txt", { type: "text/plain" }))

    const r = await app.request("/api/files/upload", { method: "POST", body: fd })
    expect(r.status).toBe(201)

    expect(consumePointsCalls).toHaveLength(1)
    expect(consumePointsCalls[0].limiter).toBe(volumetricLimiter)
    expect(consumePointsCalls[0].points).toBe(payload.length)
  })

  it("upload skips the volumetric charge when total bytes is 0", async () => {
    const fd = new FormData()
    fd.set("parentId", "00000000-0000-0000-0000-000000000abc")
    const r = await app.request("/api/files/upload", { method: "POST", body: fd })
    expect(r.status).toBe(201)
    expect(consumePointsCalls).toHaveLength(0)
  })

  it("upload sums bytes across multiple files in one call", async () => {
    const fd = new FormData()
    const a = "a".repeat(100)
    const b = "b".repeat(250)
    fd.append("files", new File([a], "a.txt", { type: "text/plain" }))
    fd.append("files", new File([b], "b.txt", { type: "text/plain" }))

    const r = await app.request("/api/files/upload", { method: "POST", body: fd })
    expect(r.status).toBe(201)

    expect(consumePointsCalls).toHaveLength(1)
    expect(consumePointsCalls[0].points).toBe(a.length + b.length)
  })
})
