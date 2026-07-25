import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

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

// The module-level constants (JWT_SECRET, AUTH_SECRET) are read once at import
// time, so we need to import the module fresh for each test.
// The validator, however, re-reads process.env on every call, which is what
// we need to test here.
// 
// We use vi.doMock() instead of vi.mock() because doMock is not hoisted.
// This allows us to set up the mock AFTER process.env has been modified by
// the test, so the mock can read the current process.env values.
// Mutable object that the mock will return
let mockConfig: Record<string, string | undefined> = {}

async function getValidator() {
  vi.resetModules()
  
  // Use vi.doMock() instead of vi.mock() because doMock is not hoisted.
  // This allows us to set up the mock AFTER process.env has been modified by
  // the test, so the mock can read the current process.env values.
  vi.doMock("./env", () => ({
    getServerConfig: vi.fn(() => mockConfig),
    resetConfigs: vi.fn(),
  }))
  
  // Set up mock config with current process.env values
  mockConfig = {
    NODE_ENV: process.env.NODE_ENV ?? "test",
    JWT_SECRET: process.env.JWT_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
  }
  
  // Dynamic import so each test gets a fresh evaluation of the module
  // after process.env has been set up and mock is in place.
  const { validateProductionSecrets } = await import("./config")
  return validateProductionSecrets
}

describe("validateProductionSecrets", () => {
  describe("in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production"
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

    it("lists all dev default secrets in one error", async () => {
      process.env.JWT_SECRET = DEV_FALLBACK
      process.env.AUTH_SECRET = DEV_FALLBACK
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
