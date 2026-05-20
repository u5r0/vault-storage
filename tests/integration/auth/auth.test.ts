import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { useAuthFixture } from "../../fixtures"

// Mock email sending functions at module boundary (SMTP, not HTTP)
vi.mock("../../../apps/server/src/lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))

const getApp = useAuthFixture()

// Store tokens from mocked email calls
const tokenStore = new Map<string, string>()

// Set up email mock implementations
beforeAll(async () => {
  const { sendVerificationEmail, sendPasswordResetEmail } = await import("../../../apps/server/src/lib/email")
  vi.mocked(sendVerificationEmail).mockImplementation(async (email: string, token: string) => {
    tokenStore.set(email, token)
  })
  vi.mocked(sendPasswordResetEmail).mockImplementation(async (email: string, token: string) => {
    tokenStore.set(email, token)
  })
})

afterEach(() => {
  tokenStore.clear()
})

// Helper to extract magic link token from mocked email calls
function extractMagicLinkToken(email: string): string {
  const token = tokenStore.get(email)
  if (!token) {
    throw new Error(`No token found for ${email}`)
  }
  return token
}

describe("Auth flow with magic links", () => {
  it("register -> magic link sent -> verify -> login", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    // Register (sends magic link)
    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    expect(reg.status).toBe(200)
    const regData = await reg.json()
    expect(regData.user).toBeDefined()

    // Extract magic link token from mocked email calls
    const token = extractMagicLinkToken(email)

    // Verify magic link
    const verifyRes = await app.request(`/api/auth/verify?token=${token}`)
    expect(verifyRes.status).toBe(200)
    const verified = await verifyRes.json()
    expect(verified.user.verified).toBe(true)

    // Login
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    expect(loginRes.status).toBe(200)

    // capture cookies
    const setCookie = loginRes.headers.get("set-cookie")
    const cookieHeader = setCookie || ""

    // me
    const meRes = await app.request("/api/auth/me", { headers: { Cookie: cookieHeader } })
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.user.email).toBe(email)
  })

  // TODO: Add password reset flow test after this one passes
  // TODO: Add error path tests one by one after basic flow works
})
