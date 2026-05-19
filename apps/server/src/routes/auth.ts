import { Hono } from "hono"
import { z } from "zod"
import { getCookie, setCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import {
  createUser,
  generateAccessToken,
  generateRefreshToken,
  verifyPassword,
  storeRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  rotateRefreshToken,
} from "../lib/auth"
import { db } from "../db"

const app = new Hono()

const RegisterBody = z.object({ email: z.string().email(), password: z.string().min(8).max(100) })
const LoginBody = z.object({ email: z.string().email(), password: z.string() })

// Helper to keep options clean
const isProd = process.env.NODE_ENV === "production"

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = RegisterBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400)

  const { email, password } = parsed.data
  try {
    const user = await createUser(email, password)
    return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt }, verificationToken: user.verificationToken })
  } catch (e: any) {
    return c.json({ error: e.message || "Registration failed" }, 400)
  }
})

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = LoginBody.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400)

  const { email, password } = parsed.data
  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
    parameters: [{ name: "@email", value: email }],
  }
  const { resources } = await db.items.query(querySpec).fetchAll()
  const user = resources[0]
  if (!user) return c.json({ error: "Invalid credentials" }, 401)

  const ok = await verifyPassword(user.passwordHash, password)
  if (!ok) return c.json({ error: "Invalid credentials" }, 401)

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

app.get("/verify", async (c) => {
  const token = c.req.query("token")
  if (!token) return c.json({ error: "Missing token" }, 400)

  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = 'user' AND c.verificationToken = @token",
    parameters: [{ name: "@token", value: token }],
  }
  const { resources } = await db.items.query(querySpec).fetchAll()
  const user = resources[0]
  if (!user) return c.json({ error: "Invalid token" }, 400)

  const expires = user.verificationExpires ? new Date(user.verificationExpires) : null
  if (!expires || expires.getTime() < Date.now()) return c.json({ error: "Token expired" }, 400)

  await db.item(user.id).replace({
    ...user,
    verified: "1",
    verificationToken: null,
    verificationExpires: null,
  })

  return c.json({ user: { id: user.id, email: user.email, createdAt: user.createdAt, verified: true } })
})

export default app