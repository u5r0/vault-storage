/**
 * Centralised server configuration for auth secrets.
 *
 * `JWT_SECRET` and `AUTH_SECRET` are read here so there is exactly one place
 * where the dev-fallback string lives. Every consumer imports from this module
 * rather than reading process.env directly.
 *
 * `validateProductionSecrets()` is called once at startup (index.ts) and
 * throws immediately if either secret is missing or equal to the public dev
 * default when NODE_ENV is "production". It is a no-op in dev and test so
 * local DX is unchanged.
 */

const DEV_FALLBACK = "dev-secret-change-me"

export const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK
export const AUTH_SECRET = process.env.AUTH_SECRET || DEV_FALLBACK

/**
 * Fail fast in production when secrets are absent or still set to the public
 * dev default. A misconfigured process should refuse to start rather than
 * silently accept tokens signed with a well-known string.
 *
 * Safe to call multiple times (idempotent). No-op outside production.
 */
export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return

  const missing: string[] = []

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_FALLBACK) {
    missing.push("JWT_SECRET")
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === DEV_FALLBACK) {
    missing.push("AUTH_SECRET")
  }

  if (missing.length > 0) {
    throw new Error(
      `[config] Missing or insecure production secrets: ${missing.join(", ")}. ` +
        `Set each to a strong random value (e.g. openssl rand -hex 32) before starting.`,
    )
  }
}
