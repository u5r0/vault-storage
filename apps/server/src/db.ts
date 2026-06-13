import { CosmosClient, type Container } from "@azure/cosmos"
import { createCosmosClient } from "./lib/cosmos-credentials"

/**
 * Well-known emulator key — used when COSMOS_DB_KEY is unset AND we're
 * talking to localhost. This keeps local `pnpm dev` zero-config.
 */
const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

// ─── Deferred config helpers ──────────────────────────────────────────────────
// All env-var reads are deferred to call time so that test setupFiles can
// inject COSMOS_DB_DATABASE / COSMOS_DB_CONTAINER before the container
// reference is resolved, regardless of module import order.
function getEndpoint() {
  return process.env.COSMOS_DB_ENDPOINT || "https://localhost:8081"
}
function getDatabaseName() {
  return process.env.COSMOS_DB_DATABASE || "vault"
}
function getContainerName() {
  return process.env.COSMOS_DB_CONTAINER || "vault_entries"
}

let _client: CosmosClient | null = null
let _container: Container | null = null

/**
 * Apply env-var defaults required for talking to a localhost Cosmos emulator:
 *   - disable TLS verification (self-signed cert)
 *   - inject the well-known emulator key if no real key is configured
 *
 * Idempotent. Must run before any Cosmos network call (eager dev, lazy test,
 * or explicit `initializeDatabase()`).
 */
function bootstrapEmulatorEnv() {
  const endpoint = getEndpoint()
  if (endpoint.includes("localhost") && process.env.NODE_ENV !== "test") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  }
  if (!process.env.COSMOS_DB_KEY && endpoint.includes("localhost")) {
    process.env.COSMOS_DB_KEY = EMULATOR_KEY
  }
}

function getContainer(): Container {
  bootstrapEmulatorEnv()
  const endpoint = getEndpoint()

  if (!_container) {
    const key = process.env.COSMOS_DB_KEY
    if (key) {
      // Key-based auth (dev / CI / emulator): build the client and container lazily.
      _client = new CosmosClient({ endpoint, key })
      _container = _client.database(getDatabaseName()).container(getContainerName())
    } else {
      throw new Error(
        "[db] Container not initialized. Call initializeDatabase() first " +
          "(or set COSMOS_DB_KEY for eager initialization).",
      )
    }
  }

  return _container
}

/**
 * Proxy that lazily provides the Cosmos container.
 * Imported as `db` throughout the codebase — same API surface as before.
 *
 * In dev/test (key-based auth), this works immediately because the container
 * reference is created eagerly at module load.
 *
 * In production (managed identity), `initializeDatabase()` must be called
 * before any `db` operation.
 */
export const db: Container = new Proxy({} as Container, {
  get(_target, prop) {
    const container = getContainer() as any
    // Read with the real container as the receiver so any prototype getters
    // (e.g. Container#items, #scripts, #conflicts in newer @azure/cosmos
    // builds) resolve `this` correctly. Passing the proxy as receiver makes
    // those getters run against an empty target and return undefined.
    const value = container[prop as keyof Container]
    return typeof value === "function" ? value.bind(container) : value
  },
})

export let cosmosClient: CosmosClient = null!

/**
 * Initialize Cosmos DB database and container (create if not exists).
 * Must be called once at startup in the production entry point.
 *
 * In dev/test with COSMOS_DB_KEY set, this also ensures the DB and container
 * exist. Safe to call multiple times.
 *
 * Resets the cached container so that the correct database/container names
 * (which may have been injected by test setupFiles after module load) are used.
 */
export async function initializeDatabase() {
  const timeout = 30_000
  const startTime = Date.now()

  // Apply emulator-friendly env defaults (TLS bypass, emulator key) before
  // any network call. Mirrors the lazy path in getContainer().
  bootstrapEmulatorEnv()

  // Reset the cached container so env-var changes (e.g. from test setupFiles)
  // are picked up on the next getContainer() call.
  _container = null

  const endpoint = getEndpoint()

  if (!_client) {
    _client = await createCosmosClient(endpoint)
  }
  cosmosClient = _client

  const dbName = getDatabaseName()
  const containerName = getContainerName()

  while (true) {
    try {
      const { database: dbResult } = await _client.databases.createIfNotExists({
        id: dbName,
      })
      await dbResult.containers.createIfNotExists({
        id: containerName,
      })
      _container = _client.database(dbName).container(containerName)
      console.log(
        `[Cosmos DB] Database '${dbName}' and container '${containerName}' initialized`,
      )
      return
    } catch (error: any) {
      if (Date.now() - startTime > timeout) {
        console.error(`[Cosmos DB] Failed to initialize after ${timeout}ms:`, error.message)
        throw new Error(`Cosmos DB initialization timeout: ${error.message}`)
      }
      if (error.code === "ECONNREFUSED" || error.message?.includes("ECONNREFUSED")) {
        console.log(`[Cosmos DB] Waiting for emulator to be ready...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }
      console.error(`[Cosmos DB] Failed to initialize:`, error.message)
      throw error
    }
  }
}

export default db
