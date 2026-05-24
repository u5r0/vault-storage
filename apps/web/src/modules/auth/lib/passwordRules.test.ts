import { describe, it, expect } from "vitest"
import { validatePassword } from "./passwordRules"

/**
 * Table-driven coverage of the tier table from ADR 0002 (amended by ADR 0019).
 * The hard requirements are mirrored by `passwordSchema` in @vault/sdk so
 * this suite also pins the client/server contract.
 */
describe("validatePassword", () => {
  it("empty string → strength 0, invalid", () => {
    const v = validatePassword("")
    expect(v.valid).toBe(false)
    expect(v.strength).toBe(0)
    expect(v.strengthLabel).toBe("")
  })

  it("11 chars with letters + digits → Weak (length too short)", () => {
    const v = validatePassword("abcdefghij1") // 11 chars
    expect(v.valid).toBe(false)
    expect(v.strength).toBe(1)
    expect(v.strengthLabel).toBe("Weak")
    expect(v.errors).toContain("Password must be at least 12 characters.")
  })

  it("12 chars, letters + digits, no mixed case → Fair", () => {
    const v = validatePassword("abcdefghijk1") // 12 chars
    expect(v.valid).toBe(true)
    expect(v.strength).toBe(2)
    expect(v.strengthLabel).toBe("Fair")
    expect(v.errors).toEqual([])
  })

  it("12 chars, letters + digits + mixed case → Good", () => {
    const v = validatePassword("AbcdefghijK1") // 12 chars, mixed case
    expect(v.valid).toBe(true)
    expect(v.strength).toBe(3)
    expect(v.strengthLabel).toBe("Good")
  })

  it("17 chars, letters + digits → Strong", () => {
    const v = validatePassword("abcdefghijklmnop1") // 17 chars
    expect(v.valid).toBe(true)
    expect(v.strength).toBe(4)
    expect(v.strengthLabel).toBe("Strong")
  })

  it("16 chars, letters + digits → Strong (boundary)", () => {
    const v = validatePassword("abcdefghijklmno1") // 16 chars
    expect(v.valid).toBe(true)
    expect(v.strength).toBe(4)
  })

  it("12 digits only → Weak (no letter)", () => {
    const v = validatePassword("123456789012")
    expect(v.valid).toBe(false)
    expect(v.strength).toBe(1)
    expect(v.errors).toContain("Password must contain a letter.")
  })

  it("12 letters only → Weak (no digit)", () => {
    const v = validatePassword("abcdefghijkl")
    expect(v.valid).toBe(false)
    expect(v.strength).toBe(1)
    expect(v.errors).toContain("Password must contain a digit.")
  })

  describe("hints", () => {
    it("reflects which rules are satisfied at each length", () => {
      const v = validatePassword("abc1") // 4 chars, letters + digits
      const hints = Object.fromEntries(v.hints.map((h) => [h.id, h.satisfied]))
      expect(hints).toMatchObject({
        length: false,
        letters: true,
        digits: true,
        mixedCase: false,
        lengthBoost: false,
      })
    })

    it("only marks advisory hints satisfied when the password is also valid", () => {
      // Mixed case but only 4 chars → invalid; mixedCase hint shouldn't be ticked.
      const v = validatePassword("Abc1")
      const hints = Object.fromEntries(v.hints.map((h) => [h.id, h.satisfied]))
      expect(hints.mixedCase).toBe(false)
    })

    it("ticks mixedCase + lengthBoost on a 16+ mixed-case password", () => {
      const v = validatePassword("AbcdefghijK12345") // 16 chars, mixed case + digits
      const hints = Object.fromEntries(v.hints.map((h) => [h.id, h.satisfied]))
      expect(hints).toMatchObject({
        length: true,
        letters: true,
        digits: true,
        mixedCase: true,
        lengthBoost: true,
      })
    })

    it("marks the three required rules as required and the advisory ones as not", () => {
      const v = validatePassword("abc1")
      const required = Object.fromEntries(v.hints.map((h) => [h.id, h.required]))
      expect(required).toEqual({
        length: true,
        letters: true,
        digits: true,
        mixedCase: false,
        lengthBoost: false,
      })
    })
  })
})
