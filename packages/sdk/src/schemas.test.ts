import { describe, it, expect } from "vitest"
import {
  RegisterBody,
  LoginBody,
  ResendVerificationBody,
  ResetPasswordBody,
  UserSchema,
} from "./schemas"

/**
 * SDK schema tests pin the wire contract per ADR 0019 §C1. Server (zValidator)
 * and frontend (validatePassword) both depend on these rules, so a regression
 * here breaks both sides at once — which is exactly when we want it caught.
 */

describe("RegisterBody", () => {
  it("accepts a valid input with optional name", () => {
    const ok = RegisterBody.safeParse({
      email: "user@example.com",
      password: "abcdefghijk1",
      name: "Jane Doe",
    })
    expect(ok.success).toBe(true)
  })

  it("accepts input without name (name is optional)", () => {
    const ok = RegisterBody.safeParse({
      email: "user@example.com",
      password: "abcdefghijk1",
    })
    expect(ok.success).toBe(true)
  })

  it.each([
    ["invalid email", { email: "not-an-email", password: "abcdefghijk1" }],
    ["short password", { email: "user@example.com", password: "abc1" }],
    ["password missing letter", { email: "user@example.com", password: "123456789012" }],
    ["password missing digit", { email: "user@example.com", password: "abcdefghijkl" }],
    ["empty name", { email: "user@example.com", password: "abcdefghijk1", name: "" }],
    [
      "name too long",
      { email: "user@example.com", password: "abcdefghijk1", name: "x".repeat(81) },
    ],
  ])("rejects %s", (_label, input) => {
    expect(RegisterBody.safeParse(input).success).toBe(false)
  })
})

describe("LoginBody", () => {
  it("accepts any non-empty password (no composition rules on login)", () => {
    expect(LoginBody.safeParse({ email: "u@x.com", password: "x" }).success).toBe(true)
  })

  it("rejects invalid email", () => {
    expect(LoginBody.safeParse({ email: "nope", password: "x" }).success).toBe(false)
  })
})

describe("ResendVerificationBody", () => {
  it("accepts a valid email", () => {
    expect(
      ResendVerificationBody.safeParse({ email: "u@x.com" }).success,
    ).toBe(true)
  })

  it("rejects invalid email", () => {
    expect(ResendVerificationBody.safeParse({ email: "nope" }).success).toBe(false)
  })
})

describe("ResetPasswordBody", () => {
  it("accepts valid token + valid password", () => {
    expect(
      ResetPasswordBody.safeParse({ token: "t", password: "abcdefghijk1" }).success,
    ).toBe(true)
  })

  it.each([
    ["short password", { token: "t", password: "abc1" }],
    ["password missing letter", { token: "t", password: "123456789012" }],
    ["password missing digit", { token: "t", password: "abcdefghijkl" }],
    ["empty token", { token: "", password: "abcdefghijk1" }],
  ])("rejects %s", (_label, input) => {
    expect(ResetPasswordBody.safeParse(input).success).toBe(false)
  })
})

describe("UserSchema", () => {
  it("requires lockedUntil (nullable) and verified (boolean)", () => {
    const ok = UserSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "u@x.com",
      name: "User",
      verified: true,
      lockedUntil: null,
      createdAt: "2026-05-24T10:00:00Z",
    })
    expect(ok.success).toBe(true)
  })

  it("accepts a locked user with an ISO timestamp", () => {
    const ok = UserSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      email: "u@x.com",
      name: null,
      verified: false,
      lockedUntil: "2026-05-24T10:30:00Z",
      createdAt: "2026-05-24T10:00:00Z",
    })
    expect(ok.success).toBe(true)
  })

  it("rejects when lockedUntil is missing", () => {
    expect(
      UserSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "u@x.com",
        name: null,
        verified: true,
        createdAt: "2026-05-24T10:00:00Z",
      }).success,
    ).toBe(false)
  })
})
