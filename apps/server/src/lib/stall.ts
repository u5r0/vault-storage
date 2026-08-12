import { performance } from "node:perf_hooks"
import { getServerConfig } from "./env.js"

const serverConfig = getServerConfig()

/**
 * Default floor when callers don't pass an explicit value. Read on each call
 * (not at module load) so tests can override via `vi.stubEnv("LOGIN_STALL_MS")`.
 */
function defaultStallMs(): number {
  return Number(serverConfig.LOGIN_STALL_MS)
}

/**
 * Ensure a function takes at least `ms` milliseconds, padding with sleep if
 * execution finished sooner. Defends against timing oracles on auth failure
 * paths so attackers cannot enumerate accounts by response time.
 *
 * Pattern borrowed from directus/api/src/utils/stall.ts (see ADR 0019 §B3a).
 *
 * @param start - performance.now() captured at the function entry
 * @param ms    - floor in milliseconds; defaults to LOGIN_STALL_MS env or 250
 */
export async function stall(start: number, ms: number = defaultStallMs()): Promise<void> {
  const elapsed = performance.now() - start
  const remaining = ms - elapsed
  if (remaining <= 0) return
  await new Promise((resolve) => setTimeout(resolve, remaining))
}
