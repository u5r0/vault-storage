import { performance } from "node:perf_hooks"
import { HTTPException } from "hono/http-exception"
// Auth documents (user / refresh_token / spent_token) live in their own
// container keyed by /id (ADR 0028 §3.1 — split out of the file HPK container).
import { authContainer as authDb } from "../db"
import {
  createUser,
  verifyPassword,
  hashPassword,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllRefreshTokensForUser,
} from "../lib/auth"
import { generateMagicLinkToken, verifyMagicLinkToken } from "../lib/magic-link"
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccountLockedEmail,
} from "../lib/email"
import { stall } from "../lib/stall"

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 30 * 60 * 1000

async function markNonceSpent(nonce: string) {
  try {
    await authDb.items.create({ id: nonce, type: "spent_token", ttl: 900 })
  } catch (e: any) {
    if (e.code === 409 || e.statusCode === 409) {
      throw new HTTPException(400, { message: "Token has already been used" })
    }
    throw e
  }
}

async function findUserByEmail(email: string) {
  // Cosmium (dev emulator) silently returns nothing for *literal* string
  // equality in WHERE clauses (e.g. `c.type = 'user'`); parameterized
  // bindings work. So every condition must be a @param. Real Cosmos handles
  // both forms, so this is correct for production as well.
  const { resources } = await authDb.items
    .query({
      query: "SELECT * FROM c WHERE c.type = @type AND c.email = @email",
      parameters: [
        { name: "@type", value: "user" },
        { name: "@email", value: email },
      ],
    })
    .fetchAll()
  return resources[0] ?? null
}

/** Public-facing user shape returned by `/me`, `/login`, `/refresh`, `/verify`. */
export interface PublicUser {
  id: string
  email: string
  name: string | null
  verified: boolean
  lockedUntil: string | null
  createdAt: string
}

function toPublicUser(user: any): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    verified: user.verified === "1",
    lockedUntil: user.lockedUntil ?? null,
    createdAt: user.createdAt,
  }
}

export class AuthService {
  /**
   * Privacy-preserving registration (ADR 0019 §B4).
   *
   * Three branches, all returning the same `{ ok: true }` shape so the
   * response never leaks whether the email is already registered:
   * - new email → create user + send verification link
   * - existing verified email → send a *login* magic link to the same address
   * - existing unverified email → re-send a verification link
   *
   * The 200 path is the only path; validation failures (Zod) and rate-limit
   * exhaustion produce 400/429 in the controller.
   */
  async register(email: string, password: string, name?: string): Promise<{ ok: true }> {
    const existing = await findUserByEmail(email)
    if (existing) {
      const tokenType = existing.verified === "1" ? "login" : "email-verification"
      const token = generateMagicLinkToken(existing.id, existing.email, tokenType)
      await Promise.resolve(sendVerificationEmail(existing.email, token)).catch(
        (err) => {
          console.error("[auth] register: verification email send failed", err)
        },
      )
      return { ok: true }
    }
    /**
     * The user document is created before the email is sent, so a failed send
     * must not surface as a 500 — otherwise the account exists but the caller
     * sees an error. Swallow the SMTP failure (logged) and still return 200.
     */
    const user = await createUser(email, password, name)
    const token = generateMagicLinkToken(user.id, user.email, "email-verification")
    await Promise.resolve(sendVerificationEmail(user.email, token)).catch((err) => {
      console.error("[auth] register: verification email send failed", err)
    })
    return { ok: true }
  }

  /**
   * Password login with timing-safe failure paths (ADR 0019 §B3a).
   *
   * Check order: lock → verified → password. Every failure branch passes
   * through `stall(timeStart)` so response time does not leak which branch
   * was taken. The success path is unpadded.
   */
  async loginWithPassword(email: string, password: string): Promise<{ userId: string }> {
    const timeStart = performance.now()

    const user = await findUserByEmail(email)
    if (!user) {
      await stall(timeStart)
      throw new HTTPException(401, { message: "Invalid credentials" })
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      await stall(timeStart)
      throw new HTTPException(403, {
        message: "Account temporarily locked. Please try again later.",
      })
    }

    if (user.verified !== "1") {
      await stall(timeStart)
      throw new HTTPException(403, {
        message: "Email not verified",
        res: new Response(JSON.stringify({ error: "email_not_verified" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      })
    }

    const ok = await verifyPassword(user.passwordHash, password)
    if (!ok) {
      const failedAttempts = (user.failedLoginAttempts ?? 0) + 1
      const justLocked = failedAttempts >= LOCKOUT_THRESHOLD
      const lockedUntil = justLocked
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : null
      await authDb.item(user.id, user.id).replace({
        ...user,
        failedLoginAttempts: failedAttempts,
        lockedUntil,
      })
      // ADR 0019 §B3: lockout email on transition into locked state.
      // Awaited so the auth response only returns once Mailpit has the
      // message. The .catch() guarantees SMTP failures never block auth.
      // Promise.resolve() guards against non-promise mocks in tests.
      if (justLocked) {
        await Promise.resolve(sendAccountLockedEmail(user.email)).catch(() => {
          /* SMTP failures must not block the auth response */
        })
      }
      await stall(timeStart)
      throw new HTTPException(justLocked ? 423 : 401, {
        message: justLocked
          ? "Too many failed attempts. Account locked for 30 minutes."
          : "Invalid credentials",
      })
    }

    await authDb.item(user.id, user.id).replace({
      ...user,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
    })
    return { userId: user.id }
  }

  /**
   * Consume a magic-link token. Returns the user info needed by the
   * controller to build the response and (for both branches per ADR 0019
   * §B6) issue session cookies.
   */
  async consumeVerificationToken(token: string): Promise<{
    type: "email-verification" | "login"
    user: PublicUser
  }> {
    const data = verifyMagicLinkToken(token)
    if (!data || (data.type !== "email-verification" && data.type !== "login")) {
      throw new HTTPException(400, { message: "Invalid or expired token" })
    }

    await markNonceSpent(data.nonce)

    const { resource: user } = await authDb.item(data.userId, data.userId).read()
    if (!user || user.type !== "user") {
      throw new HTTPException(400, { message: "Invalid token" })
    }

    if (data.type === "email-verification") {
      const updated = { ...user, verified: "1" }
      await authDb.item(user.id, user.id).replace(updated)
      return { type: "email-verification", user: toPublicUser(updated) }
    }

    return { type: "login", user: toPublicUser(user) }
  }

  async requestMagicLink(email: string): Promise<void> {
    const user = await findUserByEmail(email)
    if (!user) return
    const token = generateMagicLinkToken(user.id, user.email, "login")
    await Promise.resolve(sendVerificationEmail(user.email, token)).catch((err) => {
      console.error("[auth] requestMagicLink: magic link email send failed", err)
    })
  }

  /**
   * Resend the verification link to an unverified user (ADR 0019 §B5).
   * Privacy-preserving: returns void regardless of whether the email exists
   * or is already verified. The controller always responds 200.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await findUserByEmail(email)
    if (!user || user.verified === "1") return
    const token = generateMagicLinkToken(user.id, user.email, "email-verification")
    await Promise.resolve(sendVerificationEmail(user.email, token)).catch((err) => {
      console.error("[auth] resendVerification: verification email send failed", err)
    })
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await findUserByEmail(email)
    if (!user) return
    const token = generateMagicLinkToken(user.id, user.email, "password-reset")
    await Promise.resolve(sendPasswordResetEmail(user.email, token)).catch((err) => {
      console.error("[auth] requestPasswordReset: reset email send failed", err)
    })
  }

  /**
   * Reset password and invalidate all existing refresh tokens (ADR 0019 §B2).
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const data = verifyMagicLinkToken(token)
    if (!data || data.type !== "password-reset") {
      throw new HTTPException(400, { message: "Invalid or expired token" })
    }
    await markNonceSpent(data.nonce)
    const { resource: user } = await authDb.item(data.userId, data.userId).read()
    if (!user || user.type !== "user") {
      throw new HTTPException(400, { message: "Invalid token" })
    }
    await deleteAllRefreshTokensForUser(user.id)
    const passwordHash = await hashPassword(password)
    await authDb.item(user.id, user.id).replace({ ...user, passwordHash, failedLoginAttempts: 0, lockedUntil: null })
  }

  async validateAndConsumeRefreshToken(jti: string): Promise<void> {
    const stored = await findRefreshToken(jti)
    if (!stored) throw new HTTPException(401, { message: "Unauthenticated" })
    await deleteRefreshToken(jti)
  }

  async logout(jti: string): Promise<void> {
    await deleteRefreshToken(jti).catch(() => {})
  }

  async getUser(userId: string): Promise<PublicUser> {
    const { resource: user } = await authDb.item(userId, userId).read()
    if (!user || user.type !== "user") {
      throw new HTTPException(401, { message: "Unauthenticated" })
    }
    return toPublicUser(user)
  }
}

export const authService = new AuthService()
