import { CosmosClient } from "@azure/cosmos"

const COSMOS_ENDPOINT = process.env.COSMOS_DB_ENDPOINT || "https://localhost:8081"
const COSMOS_KEY = process.env.COSMOS_DB_KEY || "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
const DATABASE_NAME = process.env.COSMOS_DB_DATABASE || "vault"
const CONTAINER_NAME = process.env.COSMOS_DB_CONTAINER || "vault_entries"

// Allow self-signed certificates for local Cosmos DB emulator
if (COSMOS_ENDPOINT.includes("localhost")) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

const client = new CosmosClient({
  endpoint: COSMOS_ENDPOINT,
  key: COSMOS_KEY,
})

const database = client.database(DATABASE_NAME)
const container = database.container(CONTAINER_NAME)

export const db = container
export const cosmosClient = client

// Initialize database and container if they don't exist
export async function initializeDatabase() {
  try {
    const { database: dbResult } = await client.databases.createIfNotExists({
      id: DATABASE_NAME,
    })
    const { container: containerResult } = await dbResult.containers.createIfNotExists({
      id: CONTAINER_NAME,
    })
    console.log(`[Cosmos DB] Database '${DATABASE_NAME}' and container '${CONTAINER_NAME}' initialized`)
  } catch (error: any) {
    console.error(`[Cosmos DB] Failed to initialize:`, error.message)
    throw error
  }
}

export default container
