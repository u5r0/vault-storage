import { describe, it, expect, vi, beforeEach } from "vitest"
import { HTTPException } from "hono/http-exception"
import { authService } from "./auth"

vi.mock("../lib/auth", () => ({
  createUser: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  findRefreshToken: vi.fn(),
  deleteRefreshToken: vi.fn(),
}))

vi.mock("../lib/magic-link", () => ({
  generateMagicLinkToken: vi.fn(),
  verifyMagicLinkToken: vi.fn(),
}))

vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))

vi.mock("../db", () => ({
  db: {
    items: {
      query: vi.fn(),
      create: vi.fn(),
    },
    item: vi.fn(),
  },
}))

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("register", () => {
    it("creates user and sends verification email", async () => {
      const { createUser } = await import("../lib/auth")
      const { generateMagicLinkToken } = await import("../lib/magic-link")
      const { sendVerificationEmail } = await import("../lib/email")

      const userId = "00000000-0000-0000-0000-000000000001"
      vi.mocked(createUser).mockResolvedValue({
        id: userId,
        email: "test@example.com",
        createdAt: "2024-01-01T00:00:00Z",
      })
      vi.mocked(generateMagicLinkToken).mockReturnValue("mock-token")
      vi.mocked(sendVerificationEmail).mockResolvedValue(undefined)

      const result = await authService.register("test@example.com", "password123456")

      expect(sendVerificationEmail).toHaveBeenCalledWith("test@example.com", expect.any(String))
      expect(result).toEqual({
        userId,
        email: "test@example.com",
        createdAt: "2024-01-01T00:00:00Z",
      })
    })
  })

  describe("loginWithPassword", () => {
    const userId = "00000000-0000-0000-0000-000000000001"

    it("returns userId on successful login", async () => {
      const { verifyPassword } = await import("../lib/auth")
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({ resources: [{ id: userId, passwordHash: "hash" }] }),
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
        fetchAll: vi.fn().mockResolvedValue({ resources: [{ id: userId, passwordHash: "hash", failedLoginAttempts: 0 }] }),
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
        fetchAll: vi.fn().mockResolvedValue({ resources: [{ id: userId, passwordHash: "hash", failedLoginAttempts: 4 }] }),
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
          resource: { id: userId, email: "test@example.com", type: "user", createdAt: "2024-01-01T00:00:00Z" },
        }),
      } as any)

      const result = await authService.getUser(userId)

      expect(result).toEqual({
        id: userId,
        email: "test@example.com",
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
