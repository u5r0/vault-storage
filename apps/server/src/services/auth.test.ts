import { describe, it, expect, vi, beforeEach } from "vitest"
import { authService } from "./auth"

// auth.ts talks only to the auth container (imported as authDb) — user /
// refresh_token / spent_token docs keyed by /id. The service never touches the
// entries or lookup containers, so the mock models just the auth container.
vi.mock("../db", () => ({
  authContainer: {
    items: { query: vi.fn(), create: vi.fn() },
    item: vi.fn(),
  },
}))

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

/**
 * ADR 0025 §Decision #2: the register / login / lockout / verification service
 * tests that pinned internal call mechanics (token generation, SQL text,
 * collaborator invocation) were removed — those intentions are covered
 * behaviorally by the controller integration tier (controllers/auth.test.ts).
 *
 * What remains here is the logic the integration tier cannot reach
 * deterministically:
 *  - the timing-safe login stall (a security property asserted on elapsed time)
 *  - password reset invalidating refresh tokens, where the collaborator call
 *    IS the user-observable side effect under test (§Decision #5 discriminator).
 */
describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // ADR 0019 §B3a: keep stall floor low so unit tests don't pay 250ms each
    vi.stubEnv("LOGIN_STALL_MS", "1")
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
      const { authContainer } = await import("../db")

      // 1) unknown user
      const unknownDuration = await timeFailure(async () => {
        vi.mocked(authContainer.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({ resources: [] }),
        } as any)
      })
      expect(unknownDuration).toBeGreaterThanOrEqual(STALL_MS - 25)

      // 2) locked
      const lockedDuration = await timeFailure(async () => {
        vi.mocked(authContainer.items.query).mockReturnValue({
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
        vi.mocked(authContainer.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({
            resources: [{ id: userId, passwordHash: "hash", verified: "0" }],
          }),
        } as any)
      })
      expect(unverifiedDuration).toBeGreaterThanOrEqual(STALL_MS - 25)

      // 4) wrong password
      const wrongDuration = await timeFailure(async () => {
        vi.mocked(authContainer.items.query).mockReturnValue({
          fetchAll: vi.fn().mockResolvedValue({
            resources: [
              { id: userId, passwordHash: "hash", verified: "1", failedLoginAttempts: 0 },
            ],
          }),
        } as any)
        vi.mocked(verifyPassword).mockResolvedValue(false)
        vi.mocked(authContainer.item).mockReturnValue({
          replace: vi.fn().mockResolvedValue(undefined),
        } as any)
      })
      expect(wrongDuration).toBeGreaterThanOrEqual(STALL_MS - 25)
    })

    it("success path is NOT padded by stall", async () => {
      vi.stubEnv("LOGIN_STALL_MS", "200")
      const { verifyPassword } = await import("../lib/auth")
      const { authContainer } = await import("../db")

      vi.mocked(authContainer.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [{ id: userId, passwordHash: "hash", verified: "1" }],
        }),
      } as any)
      vi.mocked(verifyPassword).mockResolvedValue(true)
      vi.mocked(authContainer.item).mockReturnValue({
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

    it("invalidates all refresh tokens for the user", async () => {
      const { verifyMagicLinkToken } = await import("../lib/magic-link")
      const { hashPassword, deleteAllRefreshTokensForUser } = await import("../lib/auth")
      const { authContainer } = await import("../db")

      vi.mocked(verifyMagicLinkToken).mockReturnValue({
        userId,
        email: "test@example.com",
        type: "password-reset",
        nonce: "nonce-456",
        expiresAt: Date.now() + 900_000,
      })
      vi.mocked(hashPassword).mockResolvedValue("new-hash")
      vi.mocked(authContainer.items.create).mockResolvedValue({ resource: undefined } as any)
      vi.mocked(authContainer.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: userId, type: "user", passwordHash: "old-hash" },
        }),
        replace: vi.fn().mockResolvedValue(undefined),
      } as any)

      await authService.resetPassword("valid-token", "newpassword123")

      // The invalidation is the user-observable security side effect of a
      // reset (all sessions are revoked), so asserting this collaborator call
      // is permitted under ADR 0025 §Decision #5.
      expect(deleteAllRefreshTokensForUser).toHaveBeenCalledWith(userId)
    })
  })
})
