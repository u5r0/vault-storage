import type { TestProject } from "vitest/node"

const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
const EMULATOR_ENDPOINT = "https://localhost:8081"
const READINESS_TIMEOUT_MS = 30_000

export default async function setup(project: TestProject) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

  // Cosmium returns 401 on unauthenticated requests — that still means it's up.
  // Any HTTP response (regardless of status) means the server is reachable.
  const deadline = Date.now() + READINESS_TIMEOUT_MS
  let ready = false
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      await fetch(`${EMULATOR_ENDPOINT}/`)
      ready = true
      break
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 500))
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
  const containerName = "vault_entries"

  const { CosmosClient } = await import("@azure/cosmos")
  const client = new CosmosClient({ endpoint: EMULATOR_ENDPOINT, key: EMULATOR_KEY })
  const { database } = await client.databases.createIfNotExists({ id: dbName })
  await database.containers.createIfNotExists({ id: containerName })

  project.provide("cosmosDbName", dbName)
  project.provide("cosmosContainer", containerName)

  return async () => {
    await client.database(dbName).delete().catch(() => {})
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    cosmosDbName: string
    cosmosContainer: string
  }
}
