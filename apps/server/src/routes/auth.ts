import { Hono } from "hono"
import { z } from "zod"
import { getCookie, setCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { RateLimiterMemory } from "rate-limiter-flexible"
import {
  createUser,
  generateAccessToken,
  generateRefreshToken,
  verifyPassword,
  storeRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  rotateRefreshToken,
  hashPassword,
} from "../lib/auth"
import { db } from "../db"
import { generateMagicLinkToken, verifyMagicLinkToken } from "../lib/magic-link"
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email"

const app = new Hono()

// Helper to get client IP
const getClientIP = (c: any): string => {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || 
         c.req.header("x-real-ip") || 
         "unknown"
}

// Layer 1: Email-based rate limiting (primary for auth endpoints)
const emailRateLimiter = new RateLimiterMemory({
  points: 20, // 20 requests
  duration: 900, // per 15 minutes (900 seconds)
})

// Layer 3: IP-based rate limiting (emergency brake - very high limits)
const ipRateLimiter = new RateLimiterMemory({
  points: 1000, // 1000 requests
  duration: 60, // per minute
})

// Password reset rate limiter (email-based)
const passwordResetRateLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 3600, // per hour
})

// Helper middleware for IP-based rate limiting (emergency brake)
const ipRateLimitMiddleware = async (c: any, next: any) => {
  try {
    await ipRateLimiter.consume(getClientIP(c))
  } catch (ipRej) {
    return c.json({ error: "Too many requests from this IP. Please try again later." }, 429)
  }
  await next()
}


const RegisterBody = z.object({ email: z.string().email(), password: z.string().min(12).max(100) })
const LoginBody = z.object({ email: z.string().email(), password: z.string() })

// Helper to keep options clean
const isProd = process.env.NODE_ENV === "production"

app.post("/register", ipRateLimitMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = RegisterBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400)

  const { email, password } = parsed.data

  // Email-based rate limiting
  try {
    await emailRateLimiter.consume(email)
  } catch (emailRej) {
    return c.json({ error: "Too many attempts for this email. Please try again later." }, 429)
  }
  try {
    const user = await createUser(email, password)
    const magicLinkToken = generateMagicLinkToken(user.id, user.email, "email-verification")
    await sendVerificationEmail(user.email, magicLinkToken)
    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } })
  } catch (e: any) {
    return c.json({ error: e.message || "Registration failed" }, 400)
  }
})

app.post("/login", ipRateLimitMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = LoginBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400)

  const { email, password } = parsed.data

  // Email-based rate limiting
  try {
    await emailRateLimiter.consume(email)
  } catch (emailRej) {
    return c.json({ error: "Too many attempts for this email. Please try again later." }, 429)
  }
  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
    parameters: [{ name: "@email", value: email }],
  }
  const { resources } = await db.items.query(querySpec).fetchAll()
  const user = resources[0]
  
  // Debug logging
  console.log("Login attempt for email:", email)
  console.log("User found:", !!user)
  console.log("User data:", user ? { id: user.id, email: user.email, hasPasswordHash: !!user.passwordHash } : null)
  
  if (!user) return c.json({ error: "Invalid credentials" }, 401)

  // Check if account is locked
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return c.json({ error: "Account temporarily locked. Please try again later." }, 403)
  }

  const ok = await verifyPassword(user.passwordHash, password)
  if (!ok) {
    // Increment failed login attempts
    const failedAttempts = (user.failedLoginAttempts || 0) + 1
    const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null
    
    await db.item(user.id).replace({
      ...user,
      failedLoginAttempts: failedAttempts,
      lockedUntil,
    })

    if (lockedUntil) {
      return c.json({ error: "Too many failed attempts. Account locked for 30 minutes." }, 423)
    }

    return c.json({ error: "Invalid credentials" }, 401)
  }

  // Reset failed attempts on successful login
  await db.item(user.id).replace({
    ...user,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString(),
  })

  const access = await generateAccessToken({ id: user.id, email: user.email })
  const { token: refreshToken, jti } = await generateRefreshToken({ id: user.id })
  const expiresAt = new Date(Date.now() + Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60) * 1000)
  await storeRefreshToken(jti, user.id, expiresAt)

  setCookie(c, "access", access, {
    httpOnly: true,
    path: "/",
    maxAge: Number(process.env.ACCESS_EXPIRES_SECONDS || 15 * 60),
    sameSite: "Lax",
    secure: isProd,
  })

  setCookie(c, "refresh", refreshToken, {
    httpOnly: true,
    path: "/",
    maxAge: Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60),
    sameSite: "Strict",
    secure: isProd,
  })

  return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } })
})

app.post("/refresh", async (c) => {
  const token = getCookie(c, "refresh")
  if (!token) return c.json({ error: "Unauthenticated" }, 401)

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
    const payload = await verify(token, JWT_SECRET, "HS256") as any
    if (!payload || payload.type !== "refresh") return c.json({ error: "Unauthenticated" }, 401)

    const stored = await findRefreshToken(payload.jti)
    if (!stored) return c.json({ error: "Unauthenticated" }, 401)

    const { token: newRefresh, jti: newJti } = await rotateRefreshToken(payload.jti, payload.sub)
    const access = await generateAccessToken({ id: payload.sub, email: payload.email })

    setCookie(c, "access", access, {
      httpOnly: true,
      path: "/",
      maxAge: Number(process.env.ACCESS_EXPIRES_SECONDS || 15 * 60),
      sameSite: "Lax",
      secure: isProd,
    })

    setCookie(c, "refresh", newRefresh, {
      httpOnly: true,
      path: "/",
      maxAge: Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60),
      sameSite: "Strict",
      secure: isProd,
    })

    const { resource: user } = await db.item(payload.sub).read()
    if (!user || user.type !== "user") return c.json({ error: "Unauthenticated" }, 401)
    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } })
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
      if (payload && payload.jti) {
        await deleteRefreshToken(payload.jti)
      }
    } catch { /* ignore */ }
  }

  setCookie(c, "access", "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "Lax", secure: isProd })
  setCookie(c, "refresh", "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "Strict", secure: isProd })

  return c.json({ ok: true })
})

app.get("/me", async (c) => {
  const token = getCookie(c, "access")
  if (!token) return c.json({ error: "Unauthenticated" }, 401)

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
    const decoded = await verify(token, JWT_SECRET, "HS256") as any
    
    const userId = decoded.sub || decoded.id 
    
    const { resource: user } = await db.item(userId).read()
    if (!user || user.type !== "user") return c.json({ error: "Unauthenticated" }, 401)
    
    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } })
  } catch {
    return c.json({ error: "Unauthenticated" }, 401)
  }
})

app.post("/magic-link", ipRateLimitMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = body?.email
  if (!email || typeof email !== "string") return c.json({ error: "Email required" }, 400)

  // Email-based rate limiting
  try {
    await emailRateLimiter.consume(email)
  } catch (emailRej) {
    return c.json({ error: "Too many attempts for this email. Please try again later." }, 429)
  }

  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
    parameters: [{ name: "@email", value: email }],
  }
  const { resources } = await db.items.query(querySpec).fetchAll()
  const user = resources[0]

  if (!user) {
    return c.json({ error: "User not found" }, 404)
  }

  const magicLinkToken = generateMagicLinkToken(user.id, user.email, "login")
  await sendVerificationEmail(user.email, magicLinkToken)

  return c.json({ message: "Magic link sent" })
})

app.get("/verify", async (c) => {
  const token = c.req.query("token")
  if (!token) return c.json({ error: "Missing token" }, 400)

  const data = verifyMagicLinkToken(token)
  if (!data) return c.json({ error: "Invalid or expired token" }, 400)

  const { resource: user } = await db.item(data.userId).read()
  if (!user || user.type !== "user") return c.json({ error: "Invalid token" }, 400)

  if (data.type === "email-verification") {
    await db.item(user.id).replace({
      ...user,
      verified: "1",
    })
    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt, verified: true } })
  }

  if (data.type === "login") {
    const access = await generateAccessToken({ id: user.id, email: user.email })
    const { token: refreshToken, jti } = await generateRefreshToken({ id: user.id })
    const expiresAt = new Date(Date.now() + Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60) * 1000)
    await storeRefreshToken(jti, user.id, expiresAt)

    setCookie(c, "access", access, {
      httpOnly: true,
      path: "/",
      maxAge: Number(process.env.ACCESS_EXPIRES_SECONDS || 15 * 60),
      sameSite: "Lax",
      secure: isProd,
    })

    setCookie(c, "refresh", refreshToken, {
      httpOnly: true,
      path: "/",
      maxAge: Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60),
      sameSite: "Strict",
      secure: isProd,
    })

    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt } })
  }

  return c.json({ error: "Invalid token type" }, 400)
})

app.post("/forgot-password", ipRateLimitMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = body?.email
  if (!email || typeof email !== "string") return c.json({ error: "Email required" }, 400)

  // Email-based rate limiting
  try {
    await passwordResetRateLimiter.consume(email)
  } catch (emailRej) {
    return c.json({ error: "Too many password reset attempts for this email. Please try again later." }, 429)
  }

  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
    parameters: [{ name: "@email", value: email }],
  }
  const { resources } = await db.items.query(querySpec).fetchAll()
  const user = resources[0]

  if (!user) {
    return c.json({ message: "If user exists, password reset email sent" })
  }

  const magicLinkToken = generateMagicLinkToken(user.id, user.email, "password-reset")
  await sendPasswordResetEmail(user.email, magicLinkToken)

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

  const data = verifyMagicLinkToken(token)
  if (!data || data.type !== "password-reset") {
    return c.json({ error: "Invalid or expired token" }, 400)
  }

  const { resource: user } = await db.item(data.userId).read()
  if (!user || user.type !== "user") return c.json({ error: "Invalid token" }, 400)

  const passwordHash = await hashPassword(password)

  await db.item(user.id).replace({
    ...user,
    passwordHash,
  })

  return c.json({ message: "Password reset successfully" })
})

export default app