import { describe, it, expect, vi, beforeEach } from "vitest"
import { HTTPException } from "hono/http-exception"
import { authService } from "./auth"

vi.mock("../lib/auth", () => ({
  createUser: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  findRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
  deleteAllRefreshTokensForUser: vi.fn(),
}))

vi.mock("../lib/magic-link", () => ({
  generateMagicLinkToken: vi.fn(),
  verifyMagicLinkToken: vi.fn(),
}))

vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendAccountLockedEmail: vi.fn(),
}))

vi.mock("../db", () => {
  // auth.ts imports authContainer (as authDb) for ALL operations — queries,
  // creates, reads, replaces. Tests mock `db.*` by convention, so we make
  // authContainer share the exact same vi.fn() instances as db so that
  // `vi.mocked(db.items.query).mockReturnValue(...)` automatically governs
  // authContainer.items.query too, with zero changes to test bodies.
  const sharedItems = {
    query: vi.fn(),
    create: vi.fn(),
  }
  const sharedItem = vi.fn()
  const container = { items: sharedItems, item: sharedItem }
  return {
    db: container,
    authContainer: container,
  }
})

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // ADR 0019 §B3a: keep stall floor low so unit tests don't pay 250ms each
    vi.stubEnv("LOGIN_STALL_MS", "1")
  })

  describe("register", () => {
    it("creates user and sends verification email", async () => {
      const { createUser } = await import("../lib/auth")
      const { generateMagicLinkToken } = await import("../lib/magic-link")
      const { sendVerificationEmail } = await import("../lib/email")
      const { db } = await import("../db")

      // Privacy-preserving register first checks for an existing user.
      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
      } as any)

      const userId = "00000000-0000-0000-0000-000000000001"
      vi.mocked(createUser).mockResolvedValue({
        id: userId,
        email: "test@example.com",
        name: null,
        createdAt: "2024-01-01T00:00:00Z",
      })
      vi.mocked(generateMagicLinkToken).mockReturnValue("mock-token")
      vi.mocked(sendVerificationEmail).mockResolvedValue(undefined)

      const result = await authService.register("test@example.com", "password123456")

      expect(sendVerificationEmail).toHaveBeenCalledWith("test@example.com", expect.any(String))
      expect(result).toEqual({ ok: true })
    })
  })

  describe("loginWithPassword", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("returns userId on successful login", async () => {
      const { verifyPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, passwordHash: "hash", verified: "1" }],
        }),
      } as any)
      vi.mocked(verifyPassword).mockResolvedValue(true)
      vi.mocked(db.item).mockReturnValue({
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      const result = await authService.loginWithPassword("test@example.com", "password123456")

      expect(result).toEqual({ userId })
    })

    it("throws 401 for non-existent user", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
      } as any)

      await expect(authService.loginWithPassword("test@example.com", "password123456")).rejects.toThrow(HTTPException)
      await expect(authService.loginWithPassword("test@example.com", "password123456")).rejects.toMatchObject({
        status: 401,
        message: "Invalid credentials",
      })
    })

    it("throws 401 for wrong password", async () => {
      const { verifyPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, passwordHash: "hash", verified: "1", failedLoginAttempts: 0 }],
        }),
      } as any)
      vi.mocked(verifyPassword).mockResolvedValue(false)
      vi.mocked(db.item).mockReturnValue({
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      await expect(authService.loginWithPassword("test@example.com", "password123456")).rejects.toThrow(HTTPException)
    })

    it("locks account after 5 failed attempts", async () => {
      const { verifyPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, passwordHash: "hash", verified: "1", failedLoginAttempts: 4 }],
        }),
      } as any)
      vi.mocked(verifyPassword).mockResolvedValue(false)
      vi.mocked(db.item).mockReturnValue({
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      await expect(authService.loginWithPassword("test@example.com", "password123456")).rejects.toMatchObject({
        status: 423,
        message: "Too many failed attempts. Account locked for 30 minutes.",
      })
    })
  })

  describe("resetPassword", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("resets password with valid token", async () => {
      const { verifyMagicLinkToken } = await import("../lib/magic-link")
      const { hashPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(verifyMagicLinkToken).mockReturnValue({
        userId,
        email: "test@example.com",
        type: "password-reset",
        nonce: "nonce-123",
        expiresAt: Date.now() + 900000,
      })
      vi.mocked(hashPassword).mockResolvedValue("new-hash")
      vi.mocked(db.items.create).mockResolvedValue({ resource: undefined } as any)
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({ resource: { id: userId, type: "user" } }),
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      await authService.resetPassword("valid-token", "newpassword123")

      expect(db.item(userId).replace).toHaveBeenCalled()
    })

    it("throws 400 for invalid token type", async () => {
      const { verifyMagicLinkToken } = await import("../lib/magic-link")

      vi.mocked(verifyMagicLinkToken).mockReturnValue({
        userId,
        email: "test@example.com",
        type: "login",
        nonce: "nonce-123",
        expiresAt: Date.now() + 900000,
      })

      await expect(authService.resetPassword("token", "password123")).rejects.toMatchObject({
        status: 400,
        message: "Invalid or expired token",
      })
    })
  })

  describe("register — privacy-preserving branches (ADR 0019 §B4)", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("existing verified user → sends a login magic link", async () => {
      const { generateMagicLinkToken } = await import("../lib/magic-link")
      const { sendVerificationEmail } = await import("../lib/email")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, email: "test@example.com", verified: "1", type: "user" }],
        }),
      } as any)
      vi.mocked(generateMagicLinkToken).mockReturnValue("login-token")
      vi.mocked(sendVerificationEmail).mockResolvedValue(undefined)

      const result = await authService.register("test@example.com", "password123456")

      expect(generateMagicLinkToken).toHaveBeenCalledWith(userId, "test@example.com", "login")
      expect(sendVerificationEmail).toHaveBeenCalledWith("test@example.com", "login-token")
      expect(result).toEqual({ ok: true })
    })

    it("existing unverified user → re-sends a verification link", async () => {
      const { generateMagicLinkToken } = await import("../lib/magic-link")
      const { sendVerificationEmail } = await import("../lib/email")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, email: "test@example.com", verified: "0", type: "user" }],
        }),
      } as any)
      vi.mocked(generateMagicLinkToken).mockReturnValue("verify-token")
      vi.mocked(sendVerificationEmail).mockResolvedValue(undefined)

      const result = await authService.register("test@example.com", "password123456")

      expect(generateMagicLinkToken).toHaveBeenCalledWith(userId, "test@example.com", "email-verification")
      expect(sendVerificationEmail).toHaveBeenCalledWith("test@example.com", "verify-token")
      expect(result).toEqual({ ok: true })
    })

    it("new user with name → calls createUser with name and sends verification", async () => {
      const { createUser } = await import("../lib/auth")
      const { generateMagicLinkToken } = await import("../lib/magic-link")
      const { sendVerificationEmail } = await import("../lib/email")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
      } as any)
      vi.mocked(createUser).mockResolvedValue({
        id: userId,
        email: "test@example.com",
        name: "Jane Doe",
        createdAt: "2024-01-01T00:00:00Z",
      })
      vi.mocked(generateMagicLinkToken).mockReturnValue("token")
      vi.mocked(sendVerificationEmail).mockResolvedValue(undefined)

      const result = await authService.register("test@example.com", "password123456", "Jane Doe")

      expect(createUser).toHaveBeenCalledWith("test@example.com", "password123456", "Jane Doe")
      expect(result).toEqual({ ok: true })
    })
  })

  describe("loginWithPassword — verification + lockout email (ADR 0019 §B1, §B3)", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("unverified user → throws 403 with structured email_not_verified body", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, passwordHash: "hash", verified: "0" }],
        }),
      } as any)

      const err: any = await authService
        .loginWithPassword("test@example.com", "password123456")
        .catch((e) => e)

      expect(err.status).toBe(403)
      expect(err.message).toBe("Email not verified")
      // The custom Response carries the structured code consumed by the SPA.
      expect(err.res).toBeDefined()
      const body = await err.res.json()
      expect(body).toEqual({ error: "email_not_verified" })
    })

    it("5th wrong attempt sends sendAccountLockedEmail exactly once", async () => {
      const { verifyPassword } = await import("../lib/auth")
      const { sendAccountLockedEmail } = await import("../lib/email")
      const { db } = await import("../db")

      vi.mocked(sendAccountLockedEmail).mockResolvedValue(undefined)
      vi.mocked(verifyPassword).mockResolvedValue(false)
      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            {
              id: userId,
              email: "test@example.com",
              passwordHash: "hash",
              verified: "1",
              failedLoginAttempts: 4,
            },
          ],
        }),
      } as any)
      vi.mocked(db.item).mockReturnValue({
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      await expect(
        authService.loginWithPassword("test@example.com", "wrong"),
      ).rejects.toMatchObject({ status: 423 })

      expect(sendAccountLockedEmail).toHaveBeenCalledTimes(1)
      expect(sendAccountLockedEmail).toHaveBeenCalledWith("test@example.com")
    })

    it("attempts during the lockout window do NOT re-send a lockout email", async () => {
      const { sendAccountLockedEmail } = await import("../lib/email")
      const { db } = await import("../db")

      vi.mocked(sendAccountLockedEmail).mockResolvedValue(undefined)
      // User is already locked; the early branch returns before the password
      // check, so no failedLoginAttempts increment and no email.
      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            {
              id: userId,
              email: "test@example.com",
              passwordHash: "hash",
              verified: "1",
              failedLoginAttempts: 5,
              lockedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            },
          ],
        }),
      } as any)

      await expect(
        authService.loginWithPassword("test@example.com", "wrong"),
      ).rejects.toMatchObject({ status: 403 })
      expect(sendAccountLockedEmail).not.toHaveBeenCalled()
    })
  })

  describe("loginWithPassword — timing-safe failures (ADR 0019 §B3a)", () => {
    const userId = "00000000-0000-0000-0000-000000000001"
    const STALL_MS = 80

    async function timeFailure(setup: () => Promise<void>): Promise<number> {
      await setup()
      const start = performance.now()
      await authService
        .loginWithPassword("test@example.com", "password123456")
        .catch(() => null)
      return performance.now() - start
    }

    it("every failure path takes at least LOGIN_STALL_MS", async () => {
      vi.stubEnv("LOGIN_STALL_MS", String(STALL_MS))
      const { verifyPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      // 1) unknown user
      const unknownDuration = await timeFailure(async () => {
        vi.mocked(db.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
        } as any)
      })
      expect(unknownDuration).toBeGreaterThanOrEqual(STALL_MS - 25)

      // 2) locked
      const lockedDuration = await timeFailure(async () => {
        vi.mocked(db.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({
            resources: [
              {
                id: userId,
                passwordHash: "hash",
                verified: "1",
                lockedUntil: new Date(Date.now() + 60_000).toISOString(),
              },
            ],
          }),
        } as any)
      })
      expect(lockedDuration).toBeGreaterThanOrEqual(STALL_MS - 25)

      // 3) unverified
      const unverifiedDuration = await timeFailure(async () => {
        vi.mocked(db.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({
            resources: [{ id: userId, passwordHash: "hash", verified: "0" }],
          }),
        } as any)
      })
      expect(unverifiedDuration).toBeGreaterThanOrEqual(STALL_MS - 25)

      // 4) wrong password
      const wrongDuration = await timeFailure(async () => {
        vi.mocked(db.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({
            resources: [
              { id: userId, passwordHash: "hash", verified: "1", failedLoginAttempts: 0 },
            ],
          }),
        } as any)
        vi.mocked(verifyPassword).mockResolvedValue(false)
        vi.mocked(db.item).mockReturnValue({
          replace: vi.fn().mockResolvedValue(undefined),
        } as any)
      })
      expect(wrongDuration).toBeGreaterThanOrEqual(STALL_MS - 25)
    })

    it("success path is NOT padded by stall", async () => {
      vi.stubEnv("LOGIN_STALL_MS", "200")
      const { verifyPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, passwordHash: "hash", verified: "1" }],
        }),
      } as any)
      vi.mocked(verifyPassword).mockResolvedValue(true)
      vi.mocked(db.item).mockReturnValue({
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      const start = performance.now()
      await authService.loginWithPassword("test@example.com", "password123456")
      const elapsed = performance.now() - start

      // Generous upper bound; the only goal is to prove we are NOT waiting 200ms.
      expect(elapsed).toBeLessThan(150)
    })
  })

  describe("resetPassword — invalidates refresh tokens (ADR 0019 §B2)", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("calls deleteAllRefreshTokensForUser before replacing the password hash", async () => {
      const { verifyMagicLinkToken } = await import("../lib/magic-link")
      const { hashPassword, deleteAllRefreshTokensForUser } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(verifyMagicLinkToken).mockReturnValue({
        userId,
        email: "test@example.com",
        type: "password-reset",
        nonce: "nonce-456",
        expiresAt: Date.now() + 900_000,
      })
      vi.mocked(hashPassword).mockResolvedValue("new-hash")
      vi.mocked(db.items.create).mockResolvedValue({ resource: undefined } as any)

      const replace = vi.fn().mockResolvedValue(undefined)
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: userId, type: "user", passwordHash: "old-hash" },
        }),
        replace,
      } as any)

      const order: string[] = []
      vi.mocked(deleteAllRefreshTokensForUser).mockImplementation(async () => {
        order.push("delete-tokens")
      })
      replace.mockImplementation(async () => {
        order.push("replace-user")
      })

      await authService.resetPassword("valid-token", "newpassword123")

      expect(deleteAllRefreshTokensForUser).toHaveBeenCalledWith(userId)
      expect(order).toEqual(["delete-tokens", "replace-user"])
    })
  })

  describe("validateAndConsumeRefreshToken", () => {
    it("throws 401 for non-existent token", async () => {
      const { findRefreshToken } = await import("../lib/auth")

      vi.mocked(findRefreshToken).mockResolvedValue(null)

      await expect(authService.validateAndConsumeRefreshToken("jti-123")).rejects.toMatchObject({
        status: 401,
        message: "Unauthenticated",
      })
    })

    it("deletes token on success", async () => {
      const { findRefreshToken, deleteRefreshToken } = await import("../lib/auth")
      const userId = "00000000-0000-0000-0000-000000000001"

      vi.mocked(findRefreshToken).mockResolvedValue({ jti: "jti-123", userId })
      vi.mocked(deleteRefreshToken).mockResolvedValue(undefined)

      await authService.validateAndConsumeRefreshToken("jti-123")

      expect(deleteRefreshToken).toHaveBeenCalledWith("jti-123")
    })
  })

  describe("getUser", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("returns user data for valid userId", async () => {
      const { db } = await import("../db")

      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: {
            id: userId,
            email: "test@example.com",
            type: "user",
            name: "Test User",
            verified: "1",
            lockedUntil: null,
            createdAt: "2024-01-01T00:00:00Z",
          },
        }),
      } as any)

      const result = await authService.getUser(userId)

      expect(result).toEqual({
        id: userId,
        email: "test@example.com",
        name: "Test User",
        verified: true,
        lockedUntil: null,
        createdAt: "2024-01-01T00:00:00Z",
      })
    })

    it("throws 401 for non-existent user", async () => {
      const { db } = await import("../db")

      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({ resource: null }),
      } as any)

      await expect(authService.getUser(userId)).rejects.toMatchObject({
        status: 401,
        message: "Unauthenticated",
      })
    })
  })
})
