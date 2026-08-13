import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createVaultClient, VaultClient } from "./client"

/**
 * Tests for the SDK's transparent 429 + Retry-After handling.
 *
 * The server returns `Retry-After` (seconds) on every rate-limit
 * rejection — see apps/server/src/middleware/rate-limit.ts. The client
 * honors that header up to `maxRetries` so callers don't need their own
 * backoff loop for the common case.
 */

const BASE_URL = "https://vault.test"

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  })
}

function tooManyResponse(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
    },
  })
}

describe("VaultClient — 429 with Retry-After", () => {
  let client: VaultClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    client = createVaultClient(BASE_URL)
    // Keep the test fast — `setTimeout` is mocked anyway, but small
    // delays keep the assertion easier to reason about.
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("retries on 429 and returns the eventual success response", async () => {
    fetchMock
      .mockResolvedValueOnce(tooManyResponse(1))
      .mockResolvedValueOnce(tooManyResponse(2))
      .mockResolvedValueOnce(jsonResponse({ user: { id: "u1" } }))

    const promise = client.me()
    // Drain the two scheduled retries.
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(2_000)

    await expect(promise).resolves.toEqual({ user: { id: "u1" } })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("waits the full Retry-After interval before retrying", async () => {
    fetchMock
      .mockResolvedValueOnce(tooManyResponse(5))
      .mockResolvedValueOnce(jsonResponse({ user: { id: "u1" } }))

    const promise = client.me()
    // After 4 seconds the retry must NOT have fired yet.
    await vi.advanceTimersByTimeAsync(4_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Cross the 5-second boundary; the second fetch fires.
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(promise).resolves.toEqual({ user: { id: "u1" } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("gives up and surfaces an error after exhausting maxRetries", async () => {
    client.maxRetries = 2
    fetchMock.mockResolvedValue(tooManyResponse(1))

    const promise = client.me().catch((e) => e as Error)
    // Drain both retries (no more after that — error propagates).
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(1_000)

    const err = await promise
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("Too many requests")
    expect(fetchMock).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it("does not retry a 429 without Retry-After (no signal to wait on)", async () => {
    const noHeader429 = new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })
    fetchMock.mockResolvedValueOnce(noHeader429)

    await expect(client.me()).rejects.toThrow("Too many requests")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("caps the wait time at 30s for absurd Retry-After values", async () => {
    fetchMock
      .mockResolvedValueOnce(tooManyResponse(99_999))
      .mockResolvedValueOnce(jsonResponse({ user: { id: "u1" } }))

    const promise = client.me()
    // Capped to 30s — at 30s the retry has fired.
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(promise).resolves.toEqual({ user: { id: "u1" } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry non-429 errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Boom" }, { status: 500 }),
    )
    await expect(client.me()).rejects.toThrow("Boom")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
