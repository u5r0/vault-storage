import { describe, it, expect, beforeEach, afterEach } from "vitest"

/**
 * Unit tests for validateProductionSecrets().
 *
 * We can't import the module at the top level and re-run it, because the
 * module-level constants (JWT_SECRET, AUTH_SECRET) are read once at import
 * time. The validator, however, re-reads process.env on every call, which
 * is what we need to test here.
 */

const DEV_FALLBACK = "dev-secret-change-me"

// Snapshot NODE_ENV before each test and restore after.
let originalNodeEnv: string | undefined

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV
})

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  delete process.env.JWT_SECRET
  delete process.env.AUTH_SECRET
})

async function getValidator() {
  // Dynamic import so each test gets a fresh evaluation of the module
  // after process.env has been set up.
  const { validateProductionSecrets } = await import("./config")
  return validateProductionSecrets
}

describe("validateProductionSecrets", () => {
  describe("in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production"
    })

    it("throws when JWT_SECRET is absent", async () => {
      process.env.AUTH_SECRET = "strong-random-auth-secret-xyz"
      delete process.env.JWT_SECRET
      const validate = await getValidator()
      expect(() => validate()).toThrow("JWT_SECRET")
    })

    it("throws when AUTH_SECRET is absent", async () => {
      process.env.JWT_SECRET = "strong-random-jwt-secret-xyz"
      delete process.env.AUTH_SECRET
      const validate = await getValidator()
      expect(() => validate()).toThrow("AUTH_SECRET")
    })

    it("throws when JWT_SECRET is the dev default", async () => {
      process.env.JWT_SECRET = DEV_FALLBACK
      process.env.AUTH_SECRET = "strong-random-auth-secret-xyz"
      const validate = await getValidator()
      expect(() => validate()).toThrow("JWT_SECRET")
    })

    it("throws when AUTH_SECRET is the dev default", async () => {
      process.env.JWT_SECRET = "strong-random-jwt-secret-xyz"
      process.env.AUTH_SECRET = DEV_FALLBACK
      const validate = await getValidator()
      expect(() => validate()).toThrow("AUTH_SECRET")
    })

    it("lists all missing secrets in one error", async () => {
      delete process.env.JWT_SECRET
      delete process.env.AUTH_SECRET
      const validate = await getValidator()
      expect(() => validate()).toThrow(/JWT_SECRET.*AUTH_SECRET|AUTH_SECRET.*JWT_SECRET/)
    })

    it("does not throw when both secrets are strong values", async () => {
      process.env.JWT_SECRET = "strong-random-jwt-secret-xyz"
      process.env.AUTH_SECRET = "strong-random-auth-secret-xyz"
      const validate = await getValidator()
      expect(() => validate()).not.toThrow()
    })
  })

  describe("outside production", () => {
    it("is a no-op in development even with default secrets", async () => {
      process.env.NODE_ENV = "development"
      delete process.env.JWT_SECRET
      delete process.env.AUTH_SECRET
      const validate = await getValidator()
      expect(() => validate()).not.toThrow()
    })

    it("is a no-op in test even with default secrets", async () => {
      process.env.NODE_ENV = "test"
      delete process.env.JWT_SECRET
      delete process.env.AUTH_SECRET
      const validate = await getValidator()
      expect(() => validate()).not.toThrow()
    })
  })
})
