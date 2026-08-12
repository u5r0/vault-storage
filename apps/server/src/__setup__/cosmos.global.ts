import type { TestProject } from "vitest/node"
import { CosmosClient, PartitionKeyKind, PartitionKeyDefinitionVersion } from "@azure/cosmos"
import { get as httpsGet } from "node:https"
import { emulatorTlsAgent } from "../lib/cosmos-credentials.js"

const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
const EMULATOR_ENDPOINT = "https://localhost:8081"
const READINESS_TIMEOUT_MS = 30_000

export default async function setup(project: TestProject) {
  // The emulator serves a self-signed cert; scope the TLS bypass to this
  // agent instead of NODE_TLS_REJECT_UNAUTHORIZED=0 (which would disable TLS
  // verification process-wide).
  const emulatorAgent = emulatorTlsAgent(EMULATOR_ENDPOINT)

  // The real Azure Cosmos DB emulator (vnext) returns 401 on unauthenticated
  // requests — that still means it's up. Any HTTP response (regardless of
  // status) means the server is reachable.
  const deadline = Date.now() + READINESS_TIMEOUT_MS
  let ready = false
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const { promise, resolve: resolveProbe, reject: rejectProbe } = Promise.withResolvers<void>()
      const req = httpsGet(`${EMULATOR_ENDPOINT}/`, { agent: emulatorAgent }, (res) => {
        res.resume()
        resolveProbe()
      })
      req.on("error", rejectProbe)
      await promise
      ready = true
      break
    } catch (err) {
      lastError = err
    }
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 500)
    await promise
  }
  if (!ready) {
    const detail = lastError instanceof Error ? `: ${lastError.message}` : ""
    throw new Error(
      `Cosmos DB emulator not reachable at ${EMULATOR_ENDPOINT} after ` +
        `${READINESS_TIMEOUT_MS / 1000}s${detail}. ` +
        `Run \`docker compose up -d cosmos\` (or full \`docker compose up -d\`) ` +
        `and check \`docker ps --filter name=vault-cosmos\` for restart loops.`,
    )
  }

  const dbName = `vault-test-${Date.now()}`
  // Container names/PK shapes must mirror apps/server/src/db.ts's
  // ContainerKind/partitionKeyDef exactly, or entry-lookup.ts / services
  // hitting `lookup`/`auth` fail with "container not found" regardless of
  // whether HPK itself works.
  const entriesContainer = "vault_entries"
  const lookupContainer = "vault_lookup"
  const authContainer = "vault_auth"

  const client = new CosmosClient({ endpoint: EMULATOR_ENDPOINT, key: EMULATOR_KEY, agent: emulatorAgent })
  const { database } = await client.databases.createIfNotExists({ id: dbName })

  await database.containers.createIfNotExists({
    id: entriesContainer,
    partitionKey: {
      paths: ["/ownerId", "/parentId", "/id"],
      version: PartitionKeyDefinitionVersion.V2,
      kind: PartitionKeyKind.MultiHash,
    },
  })
  await database.containers.createIfNotExists({
    id: lookupContainer,
    partitionKey: { paths: ["/id"], kind: PartitionKeyKind.Hash },
  })
  await database.containers.createIfNotExists({
    id: authContainer,
    partitionKey: { paths: ["/id"], kind: PartitionKeyKind.Hash },
    // -1 = container-level default TTL enabled; per-document `ttl` fields
    // (e.g. spent_token's ttl:900) are inert without this (infra/main.tf).
    defaultTtl: -1,
  })

  project.provide("cosmosDbName", dbName)
  project.provide("cosmosEntriesContainer", entriesContainer)
  project.provide("cosmosLookupContainer", lookupContainer)
  project.provide("cosmosAuthContainer", authContainer)

  return async () => {
    await client.database(dbName).delete().catch(() => {})
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    cosmosDbName: string
    cosmosEntriesContainer: string
    cosmosLookupContainer: string
    cosmosAuthContainer: string
  }
}
