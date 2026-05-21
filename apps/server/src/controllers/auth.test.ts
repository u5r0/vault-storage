import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { useAuthFixture, parseCookies } from "../__setup__/fixtures"

// Mock email sending functions at module boundary (SMTP, not HTTP)
vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))

const getApp = useAuthFixture()

// Store tokens from mocked email calls
const tokenStore = new Map<string, string>()

// Set up email mock implementations
beforeAll(async () => {
  const { sendVerificationEmail, sendPasswordResetEmail } = await import("../lib/email")
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
    const cookieHeader = parseCookies(loginRes)

    // me
    const meRes = await app.request("/api/auth/me", { headers: { Cookie: cookieHeader } })
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.user.email).toBe(email)
  })

  it("login sets httpOnly cookies", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)
    await app.request(`/api/auth/verify?token=${token}`)

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    expect(loginRes.status).toBe(200)

    const setCookie = loginRes.headers.get("set-cookie")
    expect(setCookie).toContain("HttpOnly")
  })

  it("refresh rotates refresh token", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)
    await app.request(`/api/auth/verify?token=${token}`)

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    expect(loginRes.status).toBe(200)

    const cookieHeader = parseCookies(loginRes)

    const refreshRes = await app.request("/api/auth/refresh", { method: "POST", headers: { Cookie: cookieHeader } })
    expect(refreshRes.status).toBe(200)
  })

  it("logout invalidates refresh token", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)
    await app.request(`/api/auth/verify?token=${token}`)

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const cookieHeader = parseCookies(loginRes)

    await app.request("/api/auth/logout", { method: "POST", headers: { Cookie: cookieHeader } })

    const refreshRes = await app.request("/api/auth/refresh", { method: "POST", headers: { Cookie: cookieHeader } })
    expect(refreshRes.status).toBe(401)
  })

  it("wrong password -> 401", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)
    await app.request(`/api/auth/verify?token=${token}`)

    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrongpassword123" }),
    })
    expect(res.status).toBe(401)
  })

  it("non-existent user -> 401 (not 404)", async () => {
    const app = getApp()
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@example.com", password: "password123456" }),
    })
    expect(res.status).toBe(401)
  })

  it("replayed magic-link -> 400", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)
    await app.request(`/api/auth/verify?token=${token}`)

    await app.request("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const loginToken = extractMagicLinkToken(email)

    const first = await app.request(`/api/auth/verify?token=${loginToken}`)
    expect(first.status).toBe(200)

    const second = await app.request(`/api/auth/verify?token=${loginToken}`)
    expect(second.status).toBe(400)
  })

  it("forgot-password -> always 200", async () => {
    const app = getApp()
    const res = await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@example.com" }),
    })
    expect(res.status).toBe(200)
  })

  it("password reset flow", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)
    await app.request(`/api/auth/verify?token=${token}`)

    await app.request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const resetToken = extractMagicLinkToken(email)

    const res = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: "newpassword123456" }),
    })
    expect(res.status).toBe(200)
  })

  it("reset with wrong token type -> 400", async () => {
    const app = getApp()
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const token = extractMagicLinkToken(email)

    const res = await app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "newpassword123456" }),
    })
    expect(res.status).toBe(400)
  })
})
