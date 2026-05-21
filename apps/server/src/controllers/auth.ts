import { Hono } from "hono"
import { z } from "zod"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import {
  createRegisterLimiter,
  createLoginLimiter,
  createMagicLinkLimiter,
  createPasswordResetLimiter,
} from "../lib/rate-limiter"
import { consumeEmailLimit } from "../middleware/rate-limit"
import { authenticate } from "../middleware/authenticate"
import { issueTokens, setAuthCookies, clearAuthCookies } from "../lib/cookies"
import { authService } from "../services/auth"

const app = new Hono()

const registerLimiter      = createRegisterLimiter()
const loginLimiter         = createLoginLimiter()
const magicLinkLimiter     = createMagicLinkLimiter()
const passwordResetLimiter = createPasswordResetLimiter()

const RegisterBody = z.object({ email: z.string().email(), password: z.string().min(12).max(100) })
const LoginBody    = z.object({ email: z.string().email(), password: z.string() })

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = RegisterBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400)
  const { email, password } = parsed.data
  const early = await consumeEmailLimit(registerLimiter, email, c)
  if (early) return early
  try {
    const user = await authService.register(email, password)
    return c.json({ user: { id: user.userId, email: user.email, createdAt: user.createdAt } })
  } catch (e: any) {
    return c.json({ error: e.message || "Registration failed" }, 400)
  }
})

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = LoginBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400)
  const { email, password } = parsed.data
  const early = await consumeEmailLimit(loginLimiter, email, c)
  if (early) return early
  const { userId } = await authService.loginWithPassword(email, password)
  const tokens = await issueTokens(userId, email)
  setAuthCookies(c, tokens)
  const user = await authService.getUser(userId)
  return c.json({ user })
})

app.post("/refresh", async (c) => {
  const token = getCookie(c, "refresh")
  if (!token) return c.json({ error: "Unauthenticated" }, 401)
  try {
    const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
    const payload = await verify(token, JWT_SECRET, "HS256") as any
    if (!payload || payload.type !== "refresh") return c.json({ error: "Unauthenticated" }, 401)
    await authService.validateAndConsumeRefreshToken(payload.jti)
    const tokens = await issueTokens(payload.sub, payload.email)
    setAuthCookies(c, tokens)
    const user = await authService.getUser(payload.sub)
    return c.json({ user })
  } catch {
    return c.json({ error: "Unauthenticated" }, 401)
  }
})

app.post("/logout", async (c) => {
  const token = getCookie(c, "refresh")
  if (token) {
    try {
      const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
      const payload = await verify(token, JWT_SECRET, "HS256") as any
      if (payload?.jti) await authService.logout(payload.jti)
    } catch { /* ignore */ }
  }
  clearAuthCookies(c)
  return c.json({ ok: true })
})

app.get("/me", authenticate(), async (c) => {
  const user = await authService.getUser((c as any).get("userId"))
  return c.json({ user })
})

app.post("/magic-link", async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = body?.email
  if (!email || typeof email !== "string") return c.json({ error: "Email required" }, 400)
  const early = await consumeEmailLimit(magicLinkLimiter, email, c)
  if (early) return early
  await authService.requestMagicLink(email)
  return c.json({ message: "If user exists, magic link sent" })
})

app.get("/verify", async (c) => {
  const token = c.req.query("token")
  if (!token) return c.json({ error: "Missing token" }, 400)
  const result = await authService.consumeVerificationToken(token)
  if (result.type === "email-verification") {
    return c.json({ user: { id: result.userId, email: result.email, createdAt: result.createdAt, verified: true } })
  }
  const tokens = await issueTokens(result.userId, result.email)
  setAuthCookies(c, tokens)
  return c.json({ user: { id: result.userId, email: result.email } })
})

app.post("/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = body?.email
  if (!email || typeof email !== "string") return c.json({ error: "Email required" }, 400)
  const early = await consumeEmailLimit(passwordResetLimiter, email, c)
  if (early) return early
  await authService.requestPasswordReset(email)
  return c.json({ message: "If user exists, password reset email sent" })
})

app.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null)
  const token = body?.token
  const password = body?.password
  if (!token || !password) return c.json({ error: "Token and password required" }, 400)
  if (typeof password !== "string" || password.length < 12) {
    return c.json({ error: "Password must be at least 12 characters" }, 400)
  }
  await authService.resetPassword(token, password)
  return c.json({ message: "Password reset successfully" })
})

export default app
