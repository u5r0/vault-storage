import { inject } from "vitest"

/**
 * Per-worker setup. Spreads whatever env the active provider's global
 * setup produced onto `process.env`, BEFORE any server module is
 * imported. Provider-agnostic — the dispatch lives in `blob.global.ts`.
 */
const env = inject("blobEnv")
for (const [key, value] of Object.entries(env)) {
  process.env[key] = value
}

// Defaults the server reads but tests don't care about:
process.env.PORT ??= "0"
process.env.ALLOWED_ORIGIN ??= "http://localhost"
