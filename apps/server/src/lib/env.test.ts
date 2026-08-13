import { describe, it, expect } from "vitest"
import { parseAllowedOrigins } from "./env.js"

describe("parseAllowedOrigins", () => {
  it("returns undefined for a missing value (schema default applies)", () => {
    expect(parseAllowedOrigins(undefined)).toBeUndefined()
  })

  it("returns undefined for an empty string", () => {
    expect(parseAllowedOrigins("")).toBeUndefined()
  })

  it("returns undefined when only commas/whitespace are present", () => {
    expect(parseAllowedOrigins("  , , ")).toBeUndefined()
  })

  it("returns a single trimmed origin", () => {
    expect(parseAllowedOrigins(" https://storage.layoutengine.dev ")).toEqual([
      "https://storage.layoutengine.dev",
    ])
  })

  it("splits a comma-separated list into trimmed origins", () => {
    expect(
      parseAllowedOrigins("https://storage.layoutengine.dev, https://vault-storage.u5r0.workers.dev"),
    ).toEqual([
      "https://storage.layoutengine.dev",
      "https://vault-storage.u5r0.workers.dev",
    ])
  })
})
