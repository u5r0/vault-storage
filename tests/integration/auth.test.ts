import { describe, it, expect, beforeAll, beforeEach } from "vitest"

let app: any

beforeAll(async () => {
  const { createApp } = await import("../../apps/server/src/app")
  app = createApp()
})

beforeEach(async () => {
  // clear DB users + refresh tokens between tests
  const { db } = await import("../../apps/server/src/db")
  await db.execute("DELETE FROM refresh_tokens")
  await db.execute("DELETE FROM users")
})

async function register(email: string, password: string) {
  const res = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  expect(res.status).toBe(200)
  return res.json()
}

describe("Auth flow", () => {
  it("register -> verify -> login -> me", async () => {
    const email = `test+${Date.now()}@example.com`
    const password = "hunter2pass"

    const reg = await register(email, password)
    expect(reg.user).toBeDefined()
    expect(reg.verificationToken).toBeDefined()

    // verify
    const verifyRes = await app.request(`/api/auth/verify?token=${reg.verificationToken}`)
    expect(verifyRes.status).toBe(200)
    const verified = await verifyRes.json()
    expect(verified.user.verified).toBe(true)

    // login
    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    expect(loginRes.status).toBe(200)

    // capture cookies
    const setCookies = loginRes.headers.getAll("set-cookie")
    const cookieHeader = setCookies.map((c: string) => c.split(";")[0]).join("; ")

    // me
    const meRes = await app.request("/api/auth/me", { headers: { Cookie: cookieHeader } })
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.user.email).toBe(email)
  })
})
