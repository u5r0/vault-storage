import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import type { TestProject } from "vitest/node"

/**
 * Vitest global setup — boots one Azurite blob server in `--inMemoryPersistence`
 * mode on a random free port for the whole integration test run.
 *
 * The well-known dev account (`devstoreaccount1`) is used. We `provide()` the
 * connection string so per-worker `setupFiles` (azurite.env.ts) can set
 * `AZURE_STORAGE_CONNECTION_STRING` before the server modules load.
 *
 * See ADR 0005 Phase A.
 */

const ACCOUNT_NAME = "devstoreaccount1"
// Well-known dev key shipped with Azurite. Not a secret.
// https://learn.microsoft.com/azure/storage/common/storage-use-azurite#well-known-storage-account-and-key
const ACCOUNT_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="

let proc: ChildProcess | null = null

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      if (!addr || typeof addr === "string") {
        srv.close()
        reject(new Error("Failed to allocate port"))
        return
      }
      const port = addr.port
      srv.close(() => resolve(port))
    })
  })
}

async function waitForAzurite(port: number, timeoutMs = 15_000): Promise<void> {
  const url = `http://127.0.0.1:${port}/${ACCOUNT_NAME}?comp=list`
  const start = Date.now()
  let lastErr: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url)
      // Any response (even 400/403) means the server is up and listening.
      if (r.status > 0) return
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `Azurite did not become ready on port ${port} within ${timeoutMs}ms: ${String(lastErr)}`,
  )
}

export default async function setup(project: TestProject) {
  const port = await getFreePort()

  proc = spawn(
    "pnpm",
    [
      "exec",
      "azurite-blob",
      "--silent",
      "--inMemoryPersistence",
      "--blobHost",
      "127.0.0.1",
      "--blobPort",
      String(port),
      "--skipApiVersionCheck",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )

  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[azurite] exited unexpectedly code=${code} signal=${signal}`)
    }
  })

  await waitForAzurite(port)

  const connectionString =
    `DefaultEndpointsProtocol=http;` +
    `AccountName=${ACCOUNT_NAME};` +
    `AccountKey=${ACCOUNT_KEY};` +
    `BlobEndpoint=http://127.0.0.1:${port}/${ACCOUNT_NAME};`

  project.provide("azuriteConnectionString", connectionString)
  project.provide("azuriteContainer", `vault-test-${Date.now()}`)

  return async () => {
    if (proc && !proc.killed) {
      proc.kill("SIGTERM")
      // Give it a moment to exit cleanly.
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    azuriteConnectionString: string
    azuriteContainer: string
  }
}
