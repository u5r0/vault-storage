import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useAuthStore } from "./auth"

const user = { id: "u1", email: "a@b.c", name: null, verified: true, lockedUntil: null, createdAt: "2026-01-01" }

function okResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("auth store checkAuth", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("resolves an authenticated session from a fast /auth/me", async () => {
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>().mockResolvedValue(okResponse({ user })))
    const store = useAuthStore()

    await store.checkAuth()

    expect(store.isInitializing).toBe(false)
    expect(store.isAuthenticated).toBe(true)
    expect(store.userEmail).toBe("a@b.c")
  })

  it("resolves unauthenticated from a fast 401", async () => {
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>().mockResolvedValue(okResponse({ error: "Unauthenticated" }, 401)))
    const store = useAuthStore()

    await store.checkAuth()

    expect(store.isInitializing).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it("dedupes concurrent checks into a single fetch", async () => {
    const fetchMock = vi.fn<() => Promise<Response>>().mockResolvedValue(okResponse({ user }))
    vi.stubGlobal("fetch", fetchMock)
    const store = useAuthStore()

    await Promise.all([store.checkAuth(), store.checkAuth(), store.waitForInitialization()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("gives up after the timeout without aborting, then applies a late result", async () => {
    const me = deferred<Response>()
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>().mockReturnValue(me.promise))
    const store = useAuthStore()

    await store.checkAuth(5)

    // Timeout won: we stop blocking the UI but the request is still in flight.
    expect(store.isInitializing).toBe(false)
    expect(store.isAuthenticated).toBe(false)

    // The late response eventually lands and is still applied.
    me.resolve(okResponse({ user }))
    await flush()

    expect(store.isAuthenticated).toBe(true)
    expect(store.userEmail).toBe("a@b.c")
  })

  it("does not let a stale 401 clobber a session established while the check was in flight", async () => {
    const me = deferred<Response>()
    const fetchMock = vi.fn<(url: string) => Promise<Response>>((url) => {
      if (url === "/api/auth/me") return me.promise
      if (url === "/api/auth/login") return Promise.resolve(okResponse({ user }))
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)
    const store = useAuthStore()

    await store.checkAuth(5)
    expect(store.isAuthenticated).toBe(false)

    // User logs in while the boot check is still pending.
    await store.signIn("a@b.c", "password")
    expect(store.isAuthenticated).toBe(true)

    // The stale boot check now resolves with 401 — it must not wipe the session.
    me.resolve(okResponse({ error: "Unauthenticated" }, 401))
    await flush()

    expect(store.isAuthenticated).toBe(true)
  })
})
