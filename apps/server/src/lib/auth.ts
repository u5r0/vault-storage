import argon2 from "argon2"
import { sign, verify } from "hono/jwt"
import { users, refreshTokens } from "../db/schema"
import { db } from "../db"
import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me"
const ACCESS_EXPIRES_SECS = Number(process.env.ACCESS_EXPIRES_SECONDS || 15 * 60)
const REFRESH_EXPIRES_SECS = Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60)

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password)
}

export async function generateAccessToken(user: { id: string; email: string }) {
  return await sign({ 
    sub: user.id, 
    email: user.email, 
    type: "access",
    exp: Math.floor(Date.now() / 1000) + ACCESS_EXPIRES_SECS,
  }, JWT_SECRET)
}

export async function generateRefreshToken(user: { id: string }) {
  // include a jti so we can later implement rotation/revocation
  const jti = randomUUID()
  const token = await sign({ 
    sub: user.id, 
    jti, 
    type: "refresh",
    exp: Math.floor(Date.now() / 1000) + REFRESH_EXPIRES_SECS,
  }, JWT_SECRET)
  return { token, jti }
}

export async function verifyToken(token: string) {
  try {
    return await verify(token, JWT_SECRET, "HS256") as Record<string, any>
  } catch (e) {
    return null
  }
}

export async function createUser(email: string, password: string) {
  const existing = await db.select().from(users).where(eq(users.email, email))
  if (existing.length > 0) throw new Error("User exists")

  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  const createdAt = new Date().toISOString()

  // generate verification token
  const verificationToken = randomUUID()
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

  await db
    .insert(users)
    .values({ id, email, passwordHash, createdAt, verified: "0", verificationToken, verificationExpires: verificationExpires.toISOString() })
    .run()

  return { id, email, createdAt, verificationToken }
}

export async function storeRefreshToken(jti: string, userId: string, expiresAt: Date) {
  await db.insert(refreshTokens).values({ jti, userId, expiresAt: expiresAt.toISOString() }).run()
}

export async function findRefreshToken(jti: string) {
  return db.select().from(refreshTokens).where(eq(refreshTokens.jti, jti)).get()
}

export async function deleteRefreshToken(jti: string) {
  await db.delete(refreshTokens).where(eq(refreshTokens.jti, jti)).run()
}

export async function rotateRefreshToken(oldJti: string, userId: string) {
  // remove old and create new
  await deleteRefreshToken(oldJti)
  const { token, jti } = await generateRefreshToken({ id: userId })
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_SECS * 1000)
  await storeRefreshToken(jti, userId, expiresAt)
  return { token, jti }
}
