/**
 * Centralised, Zod-validated server configuration.
 *
 * loadConfig() is called once in index.ts after hydrateFromInfisical() has
 * populated process.env with any secrets fetched from Infisical. All modules
 * should import named fields from here rather than reading process.env directly.
 *
 * The schema is intentionally permissive in dev/test (optional fields, dev
 * fallbacks) and strict in production (superRefine throws on missing/weak
 * secrets and missing blob credentials).
 */

import { z } from "zod"

const DEV_FALLBACK = "dev-secret-change-me"

const ConfigSchema = z
  .object({
    // ── Server ─────────────────────────────────────────────────────────────
    PORT: z.coerce.number().int().positive().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // ── CORS / URLs ────────────────────────────────────────────────────────
    ALLOWED_ORIGIN: z.string().url().default("http://localhost:3000"),
    APP_URL: z.string().url().default("http://localhost:3000"),

    // ── Cosmos DB ──────────────────────────────────────────────────────────
    // Production uses managed identity (no key). Dev/CI use the emulator key.
    COSMOS_DB_ENDPOINT: z.string().url().default("https://localhost:8081"),
    COSMOS_DB_DATABASE: z.string().default("vault"),
    COSMOS_DB_CONTAINER: z.string().default("vault_entries"),
    COSMOS_DB_KEY: z.string().optional(),

    // ── Blob Storage ───────────────────────────────────────────────────────
    BLOB_PROVIDER: z.enum(["azure", "r2"]).default("azure"),
    AZURE_STORAGE_CONTAINER_NAME: z.string().optional(),
    AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
    AZURE_STORAGE_ACCOUNT_KEY: z.string().optional(),
    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().default("vault"),
    R2_ENDPOINT: z.string().url().optional(),

    // ── Auth (user sessions — HS256 JWTs, unrelated to Infisical) ──────────
    AUTH_SECRET: z.string().min(16).default(DEV_FALLBACK),
    JWT_SECRET: z.string().min(16).default(DEV_FALLBACK),
    ACCESS_EXPIRES_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_EXPIRES_SECONDS: z.coerce.number().int().positive().default(604800),
    LOGIN_STALL_MS: z.coerce.number().int().nonnegative().default(250),

    // ── Rate limiting ──────────────────────────────────────────────────────
    // Dev escape hatch only — ignored in production regardless of value.
    RATE_LIMIT_DISABLED: z.enum(["0", "1"]).optional(),

    // ── Upload limits ──────────────────────────────────────────────────────
    // Server-side var (renamed from VITE_MAX_UPLOAD_MB per ADR 0026 F-UPLOADENV).
    // The browser bundle still uses VITE_MAX_UPLOAD_MB baked at build time.
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(100),

    // ── Email ──────────────────────────────────────────────────────────────
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().email().default("noreply@vault.app"),

    // ── Infisical runtime identifiers ──────────────────────────────────────
    // These are non-secret identifiers consumed by hydrateFromInfisical().
    // When absent, the local .env path is used instead.
    INFISICAL_IDENTITY_ID: z.string().optional(),
    INFISICAL_PROJECT_ID: z.string().optional(),
    INFISICAL_ENV: z.string().optional(),
    INFISICAL_SITE_URL: z.string().url().optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === "production") {
      // Reject the well-known dev fallback in production.
      for (const name of ["JWT_SECRET", "AUTH_SECRET"] as const) {
        if (!cfg[name] || cfg[name] === DEV_FALLBACK) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: `${name} must be set to a strong random value in production`,
          })
        }
      }

      // R2 provider must have its credentials.
      if (cfg.BLOB_PROVIDER === "r2") {
        if (!cfg.R2_ACCESS_KEY_ID || !cfg.R2_SECRET_ACCESS_KEY) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["BLOB_PROVIDER"],
            message:
              "BLOB_PROVIDER=r2 requires R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY",
          })
        }
      }
    }
  })

export type Config = z.infer<typeof ConfigSchema>

let _cached: Config | null = null

/**
 * Parse and validate process.env against the config schema.
 * Cached after first call — call once at startup, then import the result.
 * Throws a ZodError with human-readable messages if validation fails.
 */
export function loadConfig(): Config {
  if (_cached) return _cached
  _cached = ConfigSchema.parse(process.env)
  return _cached
}

// ── Named exports for backwards compatibility ──────────────────────────────
// Modules that imported JWT_SECRET / AUTH_SECRET directly from this file
// continue to work. These are evaluated lazily (getter) so they always
// reflect the post-hydration value set by loadConfig().
export function getJwtSecret(): string {
  return loadConfig().JWT_SECRET
}
export function getAuthSecret(): string {
  return loadConfig().AUTH_SECRET
}

/**
 * @deprecated Use loadConfig().JWT_SECRET instead.
 * Kept for compatibility while the codebase is migrated.
 */
export const JWT_SECRET: string = new Proxy("" as unknown as string, {
  get(_target, prop) {
    const val = loadConfig().JWT_SECRET
    return (val as any)[prop]
  },
}) as unknown as string

/**
 * @deprecated Use loadConfig().AUTH_SECRET instead.
 */
export const AUTH_SECRET: string = new Proxy("" as unknown as string, {
  get(_target, prop) {
    const val = loadConfig().AUTH_SECRET
    return (val as any)[prop]
  },
}) as unknown as string

/** @deprecated Call loadConfig() and check the result instead. */
export function validateProductionSecrets(): void {
  loadConfig() // throws ZodError if invalid
}
