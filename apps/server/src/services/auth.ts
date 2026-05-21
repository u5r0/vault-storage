import { HTTPException } from "hono/http-exception"
import { db } from "../db"
import {
  createUser,
  verifyPassword,
  hashPassword,
  findRefreshToken,
  deleteRefreshToken,
} from "../lib/auth"
import { generateMagicLinkToken, verifyMagicLinkToken } from "../lib/magic-link"
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email"

async function markNonceSpent(nonce: string) {
  try {
    await db.items.create({ id: nonce, type: "spent_token", ttl: 900 })
  } catch (e: any) {
    if (e.code === 409 || e.statusCode === 409) {
      throw new HTTPException(400, { message: "Token has already been used" })
    }
    throw e
  }
}

export class AuthService {
  async register(email: string, password: string) {
    const user = await createUser(email, password)
    const token = generateMagicLinkToken(user.id, user.email, "email-verification")
    await sendVerificationEmail(user.email, token)
    return { userId: user.id, email: user.email, createdAt: user.createdAt }
  }

  async loginWithPassword(email: string, password: string): Promise<{ userId: string }> {
    const { resources } = await db.items.query({
      query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
      parameters: [{ name: "@email", value: email }],
    }).fetchAll()
    const user = resources[0]
    if (!user) throw new HTTPException(401, { message: "Invalid credentials" })

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new HTTPException(403, { message: "Account temporarily locked. Please try again later." })
    }

    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
      const failedAttempts = (user.failedLoginAttempts || 0) + 1
      const lockedUntil = failedAttempts >= 5
        ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
        : null
      await db.item(user.id).replace({ ...user, failedLoginAttempts: failedAttempts, lockedUntil })
      throw new HTTPException(lockedUntil ? 423 : 401, {
        message: lockedUntil
          ? "Too many failed attempts. Account locked for 30 minutes."
          : "Invalid credentials",
      })
    }

    await db.item(user.id).replace({
      ...user,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
    })
    return { userId: user.id }
  }

  async consumeVerificationToken(token: string): Promise<
    | { type: "email-verification"; userId: string; email: string; createdAt: string }
    | { type: "login"; userId: string; email: string }
  > {
    const data = verifyMagicLinkToken(token)
    if (!data || (data.type !== "email-verification" && data.type !== "login")) {
      throw new HTTPException(400, { message: "Invalid or expired token" })
    }

    await markNonceSpent(data.nonce)

    const { resource: user } = await db.item(data.userId).read()
    if (!user || user.type !== "user") throw new HTTPException(400, { message: "Invalid token" })

    if (data.type === "email-verification") {
      await db.item(user.id).replace({ ...user, verified: "1" })
      return { type: "email-verification", userId: user.id, email: user.email, createdAt: user.createdAt }
    }

    return { type: "login", userId: user.id, email: user.email }
  }

  async requestMagicLink(email: string): Promise<void> {
    const { resources } = await db.items.query({
      query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
      parameters: [{ name: "@email", value: email }],
    }).fetchAll()
    const user = resources[0]
    if (!user) return
    const token = generateMagicLinkToken(user.id, user.email, "login")
    await sendVerificationEmail(user.email, token)
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { resources } = await db.items.query({
      query: "SELECT * FROM c WHERE c.type = 'user' AND c.email = @email",
      parameters: [{ name: "@email", value: email }],
    }).fetchAll()
    const user = resources[0]
    if (!user) return
    const token = generateMagicLinkToken(user.id, user.email, "password-reset")
    await sendPasswordResetEmail(user.email, token)
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const data = verifyMagicLinkToken(token)
    if (!data || data.type !== "password-reset") {
      throw new HTTPException(400, { message: "Invalid or expired token" })
    }
    await markNonceSpent(data.nonce)
    const { resource: user } = await db.item(data.userId).read()
    if (!user || user.type !== "user") throw new HTTPException(400, { message: "Invalid token" })
    const passwordHash = await hashPassword(password)
    await db.item(user.id).replace({ ...user, passwordHash })
  }

  async validateAndConsumeRefreshToken(jti: string): Promise<void> {
    const stored = await findRefreshToken(jti)
    if (!stored) throw new HTTPException(401, { message: "Unauthenticated" })
    await deleteRefreshToken(jti)
  }

  async logout(jti: string): Promise<void> {
    await deleteRefreshToken(jti).catch(() => {})
  }

  async getUser(userId: string): Promise<{ id: string; email: string; createdAt: string }> {
    const { resource: user } = await db.item(userId).read()
    if (!user || user.type !== "user") throw new HTTPException(401, { message: "Unauthenticated" })
    return { id: user.id, email: user.email, createdAt: user.createdAt }
  }
}

export const authService = new AuthService()
