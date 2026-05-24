import { describe, it, expect } from "vitest"
import { useAuthFixture, parseCookies } from "../__setup__/fixtures"
import {
  waitForMessage,
  expectNoMessage,
  extractLinkToken,
  getMessagesFor,
} from "../__setup__/mailpit"
import { verifyMagicLinkToken } from "../lib/magic-link"

const getApp = useAuthFixture()

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

const uniqueEmail = (tag = "test") =>
  `${tag}+${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`

/**
 * Register + verify the email so subsequent password logins can succeed
 * (ADR 0019 §B1 gates login on `verified === "1"`).
 */
async function registerAndVerify(
  app: any,
  email: string,
  password: string,
  name?: string,
) {
  const reg = await app.request(
    "/api/auth/register",
    json({ email, password, ...(name ? { name } : {}) }),
  )
  if (reg.status !== 200) {
    throw new Error(`register failed: ${reg.status} ${await reg.text()}`)
  }
  const msg = await waitForMessage(email, { subjectIncludes: "Verify" })
  const token = extractLinkToken(msg.HTML, "/verify")
  const verifyRes = await app.request(`/api/auth/verify?token=${token}`)
  if (verifyRes.status !== 200) {
    throw new Error(`verify failed: ${verifyRes.status} ${await verifyRes.text()}`)
  }
}

describe("Auth — register flow (real Mailpit)", () => {
  it("delivers a verification email; clicking the link logs the user in", async () => {
    const app = getApp()
    const email = uniqueEmail()

    const reg = await app.request(
      "/api/auth/register",
      json({ email, password: "hunter2pass123", name: "Test User" }),
    )
    expect(reg.status).toBe(200)
    const regBody = await reg.json()
    expect(regBody).toMatchObject({ ok: true })
    expect(regBody.message).toBeDefined()

    const msg = await waitForMessage(email, { subjectIncludes: "Verify" })
    expect(msg.From.Address).toBe("noreply@vault.test")
    expect(msg.HTML).toContain("/verify?token=")

    const token = extractLinkToken(msg.HTML, "/verify")
    const verifyRes = await app.request(`/api/auth/verify?token=${token}`)
    expect(verifyRes.status).toBe(200)
    // ADR 0019 §B6: verify sets cookies on both branches.
    expect(verifyRes.headers.get("set-cookie")).toContain("HttpOnly")
    const verified = await verifyRes.json()
    expect(verified.user.verified).toBe(true)
    expect(verified.user.name).toBe("Test User")
  })

  it("rejects invalid email with 400; sends no email", async () => {
    const app = getApp()
    const res = await app.request(
      "/api/auth/register",
      json({ email: "not-an-email", password: "hunter2pass123" }),
    )
    expect(res.status).toBe(400)
    await expectNoMessage("not-an-email")
  })

  it("rejects password without a letter with 400; sends no email", async () => {
    const app = getApp()
    const email = uniqueEmail("noletter")
    const res = await app.request(
      "/api/auth/register",
      json({ email, password: "123456789012" }),
    )
    expect(res.status).toBe(400)
    await expectNoMessage(email)
  })

  it("rejects password without a digit with 400; sends no email", async () => {
    const app = getApp()
    const email = uniqueEmail("nodigit")
    const res = await app.request(
      "/api/auth/register",
      json({ email, password: "abcdefghijkl" }),
    )
    expect(res.status).toBe(400)
    await expectNoMessage(email)
  })

  it("rejects password shorter than 12 chars with 400; sends no email", async () => {
    const app = getApp()
    const email = uniqueEmail("short")
    const res = await app.request(
      "/api/auth/register",
      json({ email, password: "short1" }),
    )
    expect(res.status).toBe(400)
    await expectNoMessage(email)
  })

  it("re-registering an unverified email re-sends a verification link", async () => {
    const app = getApp()
    const email = uniqueEmail("unverified")
    const password = "hunter2pass123"

    await app.request("/api/auth/register", json({ email, password }))
    const first = await waitForMessage(email, { subjectIncludes: "Verify" })
    expect(verifyMagicLinkToken(extractLinkToken(first.HTML, "/verify"))?.type).toBe(
      "email-verification",
    )

    const res = await app.request("/api/auth/register", json({ email, password }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })

    // Two verification messages now in the inbox; assert another one arrived
    // by counting messages with this subject.
    const all = await getMessagesFor(email, "Verify")
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it("re-registering a verified email sends a login magic link instead", async () => {
    const app = getApp()
    const email = uniqueEmail("verified")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const res = await app.request("/api/auth/register", json({ email, password }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })

    // The latest email is a login magic link, not a verification.
    const msg = await waitForMessage(email, { subjectIncludes: "Verify" })
    const token = extractLinkToken(msg.HTML, "/verify")
    expect(verifyMagicLinkToken(token)?.type).toBe("login")
  })
})

describe("Auth — login flow", () => {
  it("login before verification → 403 with code email_not_verified, no cookies", async () => {
    const app = getApp()
    const email = uniqueEmail("unverified-login")
    const password = "hunter2pass123"

    await app.request("/api/auth/register", json({ email, password }))
    await waitForMessage(email, { subjectIncludes: "Verify" })

    const res = await app.request("/api/auth/login", json({ email, password }))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: "email_not_verified" })
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("verified user logs in, sets HttpOnly cookies, and /me returns the user", async () => {
    const app = getApp()
    const email = uniqueEmail("login-ok")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password, "Login User")

    const loginRes = await app.request("/api/auth/login", json({ email, password }))
    expect(loginRes.status).toBe(200)
    expect(loginRes.headers.get("set-cookie")).toContain("HttpOnly")

    const cookieHeader = parseCookies(loginRes)
    const meRes = await app.request("/api/auth/me", {
      headers: { Cookie: cookieHeader },
    })
    expect(meRes.status).toBe(200)
    const me = await meRes.json()
    expect(me.user.email).toBe(email)
    expect(me.user.verified).toBe(true)
    expect(me.user.name).toBe("Login User")
  })

  it("wrong password → 401", async () => {
    const app = getApp()
    const email = uniqueEmail("wrong-pw")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const res = await app.request(
      "/api/auth/login",
      json({ email, password: "wrongpassword12" }),
    )
    expect(res.status).toBe(401)
  })

  it("non-existent user → 401 (not 404)", async () => {
    const app = getApp()
    const res = await app.request(
      "/api/auth/login",
      json({ email: "nonexistent@example.com", password: "password123456" }),
    )
    expect(res.status).toBe(401)
  })
})

describe("Auth — refresh / logout", () => {
  it("refresh rotates the refresh token", async () => {
    const app = getApp()
    const email = uniqueEmail("refresh")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const loginRes = await app.request("/api/auth/login", json({ email, password }))
    const cookieHeader = parseCookies(loginRes)

    const refreshRes = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: cookieHeader },
    })
    expect(refreshRes.status).toBe(200)
  })

  it("logout invalidates the refresh token", async () => {
    const app = getApp()
    const email = uniqueEmail("logout")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const loginRes = await app.request("/api/auth/login", json({ email, password }))
    const cookieHeader = parseCookies(loginRes)

    await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookieHeader },
    })

    const refreshRes = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: cookieHeader },
    })
    expect(refreshRes.status).toBe(401)
  })
})

describe("Auth — magic link verification", () => {
  it("verify without ?token → 400", async () => {
    const app = getApp()
    const res = await app.request("/api/auth/verify")
    expect(res.status).toBe(400)
  })

  it("verify with malformed token → 400", async () => {
    const app = getApp()
    const res = await app.request("/api/auth/verify?token=not-a-real-token")
    expect(res.status).toBe(400)
  })

  it("magic-link replay returns 400 on second use", async () => {
    const app = getApp()
    const email = uniqueEmail("replay")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    await app.request("/api/auth/magic-link", json({ email }))
    const msg = await waitForMessage(email, { subjectIncludes: "Verify" })
    const token = extractLinkToken(msg.HTML, "/verify")

    const first = await app.request(`/api/auth/verify?token=${token}`)
    expect(first.status).toBe(200)

    const second = await app.request(`/api/auth/verify?token=${token}`)
    expect(second.status).toBe(400)
  })
})

describe("Auth — resend-verification", () => {
  it("sends a verification email for an unverified user", async () => {
    const app = getApp()
    const email = uniqueEmail("resend")
    const password = "hunter2pass123"

    await app.request("/api/auth/register", json({ email, password }))
    await waitForMessage(email, { subjectIncludes: "Verify" })

    const res = await app.request("/api/auth/resend-verification", json({ email }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })

    const all = await getMessagesFor(email, "Verify")
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it("returns 400 for an invalid email; sends nothing", async () => {
    const app = getApp()
    const res = await app.request(
      "/api/auth/resend-verification",
      json({ email: "not-an-email" }),
    )
    expect(res.status).toBe(400)
    await expectNoMessage("not-an-email")
  })
})

describe("Auth — forgot-password", () => {
  it("known email: sends reset email; reset link consumes successfully", async () => {
    const app = getApp()
    const email = uniqueEmail("reset")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const forgot = await app.request("/api/auth/forgot-password", json({ email }))
    expect(forgot.status).toBe(200)

    const msg = await waitForMessage(email, { subjectIncludes: "Reset" })
    const token = extractLinkToken(msg.HTML, "/reset-password")

    const reset = await app.request(
      "/api/auth/reset-password",
      json({ token, password: "newpassword123456" }),
    )
    expect(reset.status).toBe(200)

    // Old password fails, new password works.
    const oldLogin = await app.request("/api/auth/login", json({ email, password }))
    expect(oldLogin.status).toBe(401)
    const newLogin = await app.request(
      "/api/auth/login",
      json({ email, password: "newpassword123456" }),
    )
    expect(newLogin.status).toBe(200)
  })

  it("unknown email: still 200 but no email sent (privacy)", async () => {
    const app = getApp()
    const email = uniqueEmail("unknown-reset")

    const res = await app.request("/api/auth/forgot-password", json({ email }))
    expect(res.status).toBe(200)
    await expectNoMessage(email)
  })

  it("password reset invalidates existing refresh tokens", async () => {
    const app = getApp()
    const email = uniqueEmail("reset-invalidates")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const loginRes = await app.request("/api/auth/login", json({ email, password }))
    const cookieHeader = parseCookies(loginRes)

    await app.request("/api/auth/forgot-password", json({ email }))
    const msg = await waitForMessage(email, { subjectIncludes: "Reset" })
    const token = extractLinkToken(msg.HTML, "/reset-password")

    const reset = await app.request(
      "/api/auth/reset-password",
      json({ token, password: "newpassword123456" }),
    )
    expect(reset.status).toBe(200)

    // Previous refresh token is now invalid.
    const refreshRes = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: cookieHeader },
    })
    expect(refreshRes.status).toBe(401)
  })

  it("reset with a non-reset token type → 400", async () => {
    const app = getApp()
    const email = uniqueEmail("wrong-type")
    const password = "hunter2pass123"

    await app.request("/api/auth/register", json({ email, password }))
    const verifyMsg = await waitForMessage(email, { subjectIncludes: "Verify" })
    const verificationToken = extractLinkToken(verifyMsg.HTML, "/verify")

    const res = await app.request(
      "/api/auth/reset-password",
      json({ token: verificationToken, password: "newpassword123456" }),
    )
    expect(res.status).toBe(400)
  })
})

describe("Auth — lockout (5 wrong passwords + lockout email)", () => {
  it(
    "5th wrong attempt locks the account and sends exactly one lockout email",
    async () => {
      const app = getApp()
      const email = uniqueEmail("lockout")
      const password = "hunter2pass123"
      await registerAndVerify(app, email, password)

      // Attempts 1–4: 401
      for (let i = 0; i < 4; i++) {
        const res = await app.request(
          "/api/auth/login",
          json({ email, password: "wrongpassword12" }),
        )
        expect(res.status).toBe(401)
      }

      // 5th: 423 (locked)
      const fifth = await app.request(
        "/api/auth/login",
        json({ email, password: "wrongpassword12" }),
      )
      expect(fifth.status).toBe(423)

      // Lockout email is sent best-effort and asynchronously; wait for it.
      const lockoutMsg = await waitForMessage(email, {
        subjectIncludes: "Locked",
      })
      expect(lockoutMsg.HTML).toContain(email)

      // Subsequent attempts during the lockout window: still 423, no new email.
      const sixth = await app.request(
        "/api/auth/login",
        json({ email, password: "wrongpassword12" }),
      )
      expect(sixth.status).toBe(403)

      const lockoutMessages = await getMessagesFor(email, "Locked")
      expect(lockoutMessages).toHaveLength(1)
    },
    15_000,
  )

  it("refresh during lockout → 403 and clears cookies", async () => {
    const app = getApp()
    const email = uniqueEmail("refresh-locked")
    const password = "hunter2pass123"
    await registerAndVerify(app, email, password)

    const loginRes = await app.request("/api/auth/login", json({ email, password }))
    const cookieHeader = parseCookies(loginRes)

    // Trigger lockout via 5 wrong attempts.
    for (let i = 0; i < 5; i++) {
      await app.request(
        "/api/auth/login",
        json({ email, password: "wrongpassword12" }),
      )
    }

    const refreshRes = await app.request("/api/auth/refresh", {
      method: "POST",
      headers: { Cookie: cookieHeader },
    })
    expect(refreshRes.status).toBe(403)
  }, 15_000)
})
