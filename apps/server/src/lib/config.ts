const DEV_FALLBACK = "dev-secret-change-me"

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
