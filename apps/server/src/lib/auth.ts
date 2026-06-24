import argon2 from "argon2"
import { sign, verify } from "hono/jwt"
import { db } from "../db"
import { randomUUID } from "crypto"
import { JWT_SECRET } from "./config"
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

export async function createUser(email: string, password: string, name?: string) {
  // Check if user exists. Every WHERE condition must be parameterized —
  // cosmium silently drops *literal* string comparisons like `c.type = 'user'`
  // (returning 0 rows), which previously let duplicate users slip past this
  // guard. Parameterized bindings work on both cosmium and real Cosmos.
  const querySpec = {
    query: "SELECT * FROM c WHERE c.type = @type AND c.email = @email",
    parameters: [
      { name: "@type", value: "user" },
      { name: "@email", value: email },
    ],
  }
  const { resources } = await db.items.query(querySpec).fetchAll()
  if (resources.length > 0) throw new Error("User exists")

  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  const createdAt = new Date().toISOString()

  const user = {
    id,
    type: "user",
    email,
    passwordHash,
    name: name ?? null,
    createdAt,
    verified: "0",
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
  }

  await db.items.create(user)

  return { id, email, name: user.name, createdAt }
}

export async function storeRefreshToken(jti: string, userId: string, expiresAt: Date) {
  const token = {
    id: jti,
    type: "refresh_token",
    userId,
    expiresAt: expiresAt.toISOString(),
  }
  await db.items.create(token)
}

export async function findRefreshToken(jti: string) {
  const { resource } = await db.item(jti).read()
  return resource
}

export async function deleteRefreshToken(jti: string) {
  await db.item(jti).delete()
}

/**
 * Delete every refresh-token document for a given user. Called by
 * resetPassword (ADR 0019 §B2) so changing the password invalidates all
 * existing sessions.
 *
 * Non-transactional: a crash mid-loop leaves stragglers, but the new password
 * hash is what blocks attackers — these are belt-and-braces. A periodic
 * sweep of expired tokens by `expiresAt` keeps the document count bounded.
 */
export async function deleteAllRefreshTokensForUser(userId: string) {
  const { resources } = await db.items
    .query({
      query: "SELECT c.id FROM c WHERE c.type = @type AND c.userId = @uid",
      parameters: [
        { name: "@type", value: "refresh_token" },
        { name: "@uid", value: userId },
      ],
    })
    .fetchAll()
  await Promise.all(
    resources.map(({ id }: { id: string }) => db.item(id).delete().catch(() => {})),
  )
}

export async function rotateRefreshToken(oldJti: string, userId: string) {
  // remove old and create new
  await deleteRefreshToken(oldJti)
  const { token, jti } = await generateRefreshToken({ id: userId })
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_SECS * 1000)
  await storeRefreshToken(jti, userId, expiresAt)
  return { token, jti }
}
