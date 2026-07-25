import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { getServerConfig } from "../lib/env"
import {
  RegisterBody,
  LoginBody,
  ResendVerificationBody,
  ResetPasswordBody,
  ForgotPasswordBody,
  MagicLinkBody,
} from "@vault/sdk"
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

const REGISTER_ACK_MESSAGE =
  "If the email is not already registered, a verification email has been sent."
const RESEND_ACK_MESSAGE =
  "If the email is registered and unverified, a verification email has been sent."

const JWT_SECRET = getServerConfig().JWT_SECRET

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = RegisterBody.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid input", issues: parsed.error.issues }, 400)
  }
  const { email, password, name } = parsed.data
  const early = await consumeEmailLimit(registerLimiter, email, c)
  if (early) return early
  await authService.register(email, password, name)
  return c.json({ ok: true, message: REGISTER_ACK_MESSAGE })
})

app.post("/resend-verification", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = ResendVerificationBody.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid input", issues: parsed.error.issues }, 400)
  }
  const { email } = parsed.data
  const early = await consumeEmailLimit(magicLinkLimiter, email, c)
  if (early) return early
  await authService.resendVerification(email)
  return c.json({ ok: true, message: RESEND_ACK_MESSAGE })
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
    const payload = (await verify(token, JWT_SECRET, "HS256")) as any
    if (!payload || payload.type !== "refresh") {
      return c.json({ error: "Unauthenticated" }, 401)
    }
    await authService.validateAndConsumeRefreshToken(payload.jti)
    const user = await authService.getUser(payload.sub)
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      clearAuthCookies(c)
      return c.json({ error: "Account temporarily locked" }, 403)
    }
    const tokens = await issueTokens(payload.sub, payload.email)
    setAuthCookies(c, tokens)
    return c.json({ user })
  } catch {
    return c.json({ error: "Unauthenticated" }, 401)
  }
})

app.post("/logout", async (c) => {
  const token = getCookie(c, "refresh")
  if (token) {
    try {
      const payload = (await verify(token, JWT_SECRET, "HS256")) as any
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
  const parsed = MagicLinkBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input", issues: parsed.error.issues }, 400)
  const { email } = parsed.data
  const early = await consumeEmailLimit(magicLinkLimiter, email, c)
  if (early) return early
  await authService.requestMagicLink(email)
  return c.json({ message: "If user exists, magic link sent" })
})

app.get("/verify", async (c) => {
  const token = c.req.query("token")
  if (!token) return c.json({ error: "Missing token" }, 400)
  const result = await authService.consumeVerificationToken(token)
  const tokens = await issueTokens(result.user.id, result.user.email)
  setAuthCookies(c, tokens)
  return c.json({ user: result.user })
})

app.post("/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = ForgotPasswordBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input", issues: parsed.error.issues }, 400)
  const { email } = parsed.data
  const early = await consumeEmailLimit(passwordResetLimiter, email, c)
  if (early) return early
  await authService.requestPasswordReset(email)
  return c.json({ message: "If user exists, password reset email sent" })
})

app.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = ResetPasswordBody.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid input", issues: parsed.error.issues }, 400)
  }
  const { token, password } = parsed.data
  await authService.resetPassword(token, password)
  return c.json({ message: "Password reset successfully" })
})

export default app
