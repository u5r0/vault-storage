import {
  CosmosClient,
  PartitionKeyKind,
  PartitionKeyDefinitionVersion,
  type Container,
  type PartitionKeyDefinition,
} from "@azure/cosmos"
import { createCosmosClient } from "./lib/cosmos-credentials"

/**
 * Well-known emulator key — used when COSMOS_DB_KEY is unset AND we're
 * talking to localhost. This keeps local `pnpm dev` zero-config.
 */
const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

// ─── Deferred config helpers ──────────────────────────────────────────────────
// All env-var reads are deferred to call time so that test setupFiles can
// inject COSMOS_DB_DATABASE / COSMOS_DB_* container names before any container
// reference is resolved, regardless of module import order.
function getEndpoint() {
  return process.env.COSMOS_DB_ENDPOINT || "https://localhost:8081"
}
function getDatabaseName() {
  return process.env.COSMOS_DB_DATABASE || "vault"
}

/**
 * Logical containers (ADR 0028 §3.1 / ADR 0007 supersession).
 *
 *  - entries: file & folder documents. Hierarchical partition key
 *      [/ownerId, /parentId, /id] so a folder listing is a single-partition
 *      query and a known (owner, parent, id) is a 1-RU point read.
 *  - lookup:  pointer records { id, ownerId, parentId } keyed by /id. Lets
 *      id-only operations (download/rename/move/delete) resolve the full HPK
 *      of an entry with one point read instead of a cross-partition scan
 *      (Gap 2 resolution).
 *  - auth:    user / refresh_token / spent_token documents keyed by /id.
 *      Split out of the entries container because they have no ownerId/parentId
 *      and must not share the file HPK.
 */
export type ContainerKind = "entries" | "lookup" | "auth"

function getContainerName(kind: ContainerKind): string {
  switch (kind) {
    case "entries":
      return process.env.COSMOS_DB_CONTAINER || "vault_entries"
    case "lookup":
      return process.env.COSMOS_DB_LOOKUP_CONTAINER || "vault_lookup"
    case "auth":
      return process.env.COSMOS_DB_AUTH_CONTAINER || "vault_auth"
  }
}

/**
 * Partition-key definition per container. `entries` uses a v2 hierarchical
 * (MultiHash) key; the others use a flat hash on /id.
 */
function partitionKeyDef(kind: ContainerKind): PartitionKeyDefinition {
  if (kind === "entries") {
    return {
      paths: ["/ownerId", "/parentId", "/id"],
      version: PartitionKeyDefinitionVersion.V2,
      kind: PartitionKeyKind.MultiHash,
    }
  }
  return { paths: ["/id"], kind: PartitionKeyKind.Hash }
}

let _client: CosmosClient | null = null
const _containers: Partial<Record<ContainerKind, Container>> = {}

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

function getContainer(kind: ContainerKind): Container {
  bootstrapEmulatorEnv()
  const endpoint = getEndpoint()

  const cached = _containers[kind]
  if (cached) return cached

  const key = process.env.COSMOS_DB_KEY
  if (!key) {
    throw new Error(
      "[db] Container not initialized. Call initializeDatabase() first " +
        "(or set COSMOS_DB_KEY for eager initialization).",
    )
  }
  // Key-based auth (dev / CI / emulator): build the client and container lazily.
  if (!_client) _client = new CosmosClient({ endpoint, key })
  const container = _client.database(getDatabaseName()).container(getContainerName(kind))
  _containers[kind] = container
  return container
}

/**
 * Build a Proxy that lazily resolves to the named Cosmos container. Same API
 * surface as a real `Container`, so call sites are unchanged.
 *
 * Reads with the real container as the receiver so prototype getters
 * (Container#items, #scripts, …) resolve `this` correctly.
 */
function containerProxy(kind: ContainerKind): Container {
  return new Proxy({} as Container, {
    get(_target, prop) {
      const container = getContainer(kind) as any
      const value = container[prop as keyof Container]
      return typeof value === "function" ? value.bind(container) : value
    },
  })
}

/** File & folder documents (hierarchical partition key). */
export const entries: Container = containerProxy("entries")
/** Pointer records resolving id → { ownerId, parentId }. */
export const lookup: Container = containerProxy("lookup")
/** User / refresh_token / spent_token documents. */
export const authContainer: Container = containerProxy("auth")

/**
 * Backwards-compatible default: `db` is the entries container. Existing
 * file/folder call sites (`db.item(...)`, `db.items...`) keep working.
 */
export const db: Container = entries

export let cosmosClient: CosmosClient = null!

/**
 * Initialize the Cosmos DB database and all three containers (create if not
 * exists). Must be called once at startup in the production entry point.
 *
 * In dev/test with COSMOS_DB_KEY set, this also ensures the DB and containers
 * exist. Safe to call multiple times. Resets cached container references so
 * names injected by test setupFiles after module load are honoured.
 */
export async function initializeDatabase() {
  const timeout = 30_000
  const startTime = Date.now()

  // Apply emulator-friendly env defaults (TLS bypass, emulator key) before
  // any network call. Mirrors the lazy path in getContainer().
  bootstrapEmulatorEnv()

  // Reset caches so env-var changes (e.g. from test setupFiles) are picked up.
  _containers.entries = undefined
  _containers.lookup = undefined
  _containers.auth = undefined

  const endpoint = getEndpoint()

  if (!_client) {
    _client = await createCosmosClient(endpoint)
  }
  cosmosClient = _client

  const dbName = getDatabaseName()
  const kinds: ContainerKind[] = ["entries", "lookup", "auth"]

  while (true) {
    try {
      const { database: dbResult } = await _client.databases.createIfNotExists({
        id: dbName,
      })
      for (const kind of kinds) {
        await dbResult.containers.createIfNotExists({
          id: getContainerName(kind),
          partitionKey: partitionKeyDef(kind),
        })
        _containers[kind] = _client.database(dbName).container(getContainerName(kind))
      }
      console.log(
        `[Cosmos DB] Database '${dbName}' and containers ` +
          `[${kinds.map(getContainerName).join(", ")}] initialized`,
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
