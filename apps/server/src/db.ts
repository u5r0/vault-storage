import {
  CosmosClient,
  PartitionKeyKind,
  PartitionKeyDefinitionVersion,
  type Container,
  type PartitionKeyDefinition,
} from "@azure/cosmos"
import { getServerConfig } from "./lib/env"
import { createCosmosClient, emulatorTlsAgent } from "./lib/cosmos-credentials"

const serverConfig = getServerConfig()

function getEndpoint() {
  return serverConfig.COSMOS_DB_ENDPOINT
}

function getDatabaseName() {
  return serverConfig.COSMOS_DB_DATABASE
}

export type ContainerKind = "entries" | "lookup" | "auth"

function getContainerName(kind: ContainerKind): string {
  switch (kind) {
    case "entries":
      return serverConfig.COSMOS_DB_CONTAINER
    case "lookup":
      return serverConfig.COSMOS_DB_LOOKUP_CONTAINER
    case "auth":
      return serverConfig.COSMOS_DB_AUTH_CONTAINER
  }
}

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

function getContainer(kind: ContainerKind): Container {
  const endpoint = getEndpoint()

  const cached = _containers[kind]
  if (cached) return cached

  const key = serverConfig.COSMOS_DB_KEY
  if (!key) {
    throw new Error(
      "[db] Container not initialized. Call initializeDatabase() first " +
        "(or set COSMOS_DB_KEY for eager initialization).",
    )
  }
  if (!_client) _client = new CosmosClient({ endpoint, key, agent: emulatorTlsAgent(endpoint) })
  const container = _client.database(getDatabaseName()).container(getContainerName(kind))
  _containers[kind] = container
  return container
}

function containerProxy(kind: ContainerKind): Container {
  return new Proxy({} as Container, {
    get(_target, prop) {
      const container = getContainer(kind) as any
      const value = container[prop as keyof Container]
      return typeof value === "function" ? value.bind(container) : value
    },
  })
}

export const entries: Container = containerProxy("entries")
export const lookup: Container = containerProxy("lookup")
export const authContainer: Container = containerProxy("auth")

export const db: Container = entries

export let cosmosClient: CosmosClient = null!

function isTransientNetworkError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown }
  const code = typeof err?.code === "string" ? err.code : ""
  const message = typeof err?.message === "string" ? err.message : ""
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("socket disconnected") ||
    message.includes("socket hang up") ||
    message.includes("TLS connection")
  )
}

function isCosmosUnauthorizedError(error: unknown): boolean {
  const err = error as { code?: unknown; statusCode?: unknown; message?: unknown }
  const code = typeof err?.code === "string" ? err.code : ""
  const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 0
  const message = typeof err?.message === "string" ? err.message : ""
  return (
    code === "Unauthorized" ||
    statusCode === 401 ||
    statusCode === 403 ||
    message.includes("Unauthorized") ||
    message.includes("Forbidden") ||
    message.includes("authentication")
  )
}

export async function initializeDatabase() {
  const timeout = 120_000
  const startTime = Date.now()
  let attempt = 0

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
      if (isTransientNetworkError(error)) {
        attempt++
        const delay = Math.min(10_000, 500 * Math.pow(2, attempt))
        console.log(
          `[Cosmos DB] Network error, retrying in ${delay}ms... (attempt ${attempt})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      if (isCosmosUnauthorizedError(error)) {
        attempt++
        const delay = Math.min(10_000, 500 * Math.pow(2, attempt))
        console.log(
          `[Cosmos DB] Authentication pending (managed identity propagation), retrying in ${delay}ms... (attempt ${attempt})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      console.error(`[Cosmos DB] Failed to initialize:`, error.message)
      throw error
    }
  }
}

export default db
