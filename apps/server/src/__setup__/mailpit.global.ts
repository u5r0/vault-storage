import type { TestProject } from "vitest/node"

/**
 * Vitest global setup — uses Docker-based Mailpit for integration tests.
 *
 * Mailpit is expected to be running via docker-compose on host ports 1025
 * (SMTP) and 8025 (HTTP API + Web UI). We `provide()` the URLs so per-worker
 * `setupFiles` (mailpit.env.ts) can set `SMTP_URL` before any server module
 * loads.
 *
 * See ADR 0019 §E0.
 */

const MAILPIT_API = "http://127.0.0.1:8025"
const MAILPIT_SMTP_HOST = "127.0.0.1"
const MAILPIT_SMTP_PORT = 1025

export default async function setup(project: TestProject) {
  // Wait for Mailpit to be ready (docker-compose may still be starting).
  // Fail loudly if it never comes up — silent fall-through would produce
  // confusing fetch errors deep inside individual tests instead of one
  // clear failure at startup.
  const deadline = Date.now() + 10_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILPIT_API}/api/v1/info`)
      if (res.ok) {
        ready = true
        break
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!ready) {
    throw new Error(
      `Mailpit not reachable at ${MAILPIT_API} after 10s. ` +
        `Run \`docker compose up -d mailpit\` (or full \`docker compose up -d\`).`,
    )
  }

  project.provide("mailpitApi", MAILPIT_API)
  project.provide("smtpUrl", `smtp://${MAILPIT_SMTP_HOST}:${MAILPIT_SMTP_PORT}`)

  return async () => {
    /* docker-compose manages lifecycle */
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    mailpitApi: string
    smtpUrl: string
  }
}
