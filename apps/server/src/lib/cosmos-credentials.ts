import { CosmosClient } from "@azure/cosmos"

/**
 * Create a CosmosClient using one of two strategies:
 *
 * 1. **Key-based** (dev, CI, emulator): `COSMOS_DB_KEY` is set → use it.
 *    The local Cosmos emulator ships with a well-known key; CI uses the same.
 *
 * 2. **Managed identity** (production): `COSMOS_DB_KEY` is unset →
 *    use `DefaultAzureCredential` which resolves system-assigned managed
 *    identity on Azure Container Apps (or az CLI locally if you want to test).
 *
 * This keeps production secrets out of env vars and lets the Container App
 * access Cosmos via its role assignment ("Cosmos DB Built-in Data Contributor").
 */
export async function createCosmosClient(endpoint: string): Promise<CosmosClient> {
  const key = process.env.COSMOS_DB_KEY

  if (key) {
    return new CosmosClient({ endpoint, key })
  }

  // Lazy-import so @azure/identity is never loaded in dev/CI where we
  // don't need it (only the managed-identity path reaches here).
  const { DefaultAzureCredential } = await import("@azure/identity")
  const credential = new DefaultAzureCredential()
  return new CosmosClient({ endpoint, aadCredentials: credential })
}
