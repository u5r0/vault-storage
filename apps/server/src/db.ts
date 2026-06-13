import { CosmosClient, type Container } from "@azure/cosmos"
import { createCosmosClient } from "./lib/cosmos-credentials"

const COSMOS_ENDPOINT = process.env.COSMOS_DB_ENDPOINT || "https://localhost:8081"
const DATABASE_NAME = process.env.COSMOS_DB_DATABASE || "vault"
const CONTAINER_NAME = process.env.COSMOS_DB_CONTAINER || "vault_entries"

// Allow self-signed certificates for local Cosmos DB emulator (not in test — setup handles this)
if (COSMOS_ENDPOINT.includes("localhost") && process.env.NODE_ENV !== "test") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

/**
 * Well-known emulator key — used when COSMOS_DB_KEY is unset AND we're
 * talking to localhost. This keeps local `pnpm dev` zero-config.
 */
const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

// If no key is provided and we're hitting localhost, inject the emulator key
// so dev/CI works without any explicit COSMOS_DB_KEY in .env.
if (!process.env.COSMOS_DB_KEY && COSMOS_ENDPOINT.includes("localhost")) {
  process.env.COSMOS_DB_KEY = EMULATOR_KEY
}

// ─── Eager client (backward compat for tests + dev) ──────────────────────────
// When COSMOS_DB_KEY is available (dev/CI/emulator), create the client eagerly
// at module load so that `db` can be used immediately without calling
// `initializeDatabase()` first. Production (managed identity) uses the async
// path via `initializeDatabase()`.
const _eagerKey = process.env.COSMOS_DB_KEY
let _client: CosmosClient | null = _eagerKey
  ? new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: _eagerKey })
  : null

const _eagerContainer: Container | null = _client
  ? _client.database(DATABASE_NAME).container(CONTAINER_NAME)
  : null

let _container: Container | null = _eagerContainer

function getContainer(): Container {
  if (!_container) {
    throw new Error(
      "[db] Container not initialized. Call initializeDatabase() first " +
        "(or set COSMOS_DB_KEY for eager initialization).",
    )
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
  get(_target, prop, receiver) {
    const container = getContainer()
    const value = Reflect.get(container, prop, receiver)
    return typeof value === "function" ? value.bind(container) : value
  },
})

export let cosmosClient: CosmosClient = _client!

/**
 * Initialize Cosmos DB database and container (create if not exists).
 * Must be called once at startup in the production entry point.
 *
 * In dev/test with COSMOS_DB_KEY set, this upgrades the eagerly-created
 * container by ensuring the DB and container exist. Safe to call multiple times.
 */
export async function initializeDatabase() {
  const timeout = 30_000
  const startTime = Date.now()

  if (!_client) {
    _client = await createCosmosClient(COSMOS_ENDPOINT)
  }
  cosmosClient = _client

  while (true) {
    try {
      const { database: dbResult } = await _client.databases.createIfNotExists({
        id: DATABASE_NAME,
      })
      await dbResult.containers.createIfNotExists({
        id: CONTAINER_NAME,
      })
      _container = _client.database(DATABASE_NAME).container(CONTAINER_NAME)
      console.log(
        `[Cosmos DB] Database '${DATABASE_NAME}' and container '${CONTAINER_NAME}' initialized`,
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
