import type { TestProject } from "vitest/node"

const EMULATOR_KEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
const EMULATOR_ENDPOINT = "https://localhost:8081"

export default async function setup(project: TestProject) {
  // Cosmos DB emulator uses a self-signed certificate. Set this before workers
  // are forked so they inherit it — workers cannot connect otherwise.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

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
