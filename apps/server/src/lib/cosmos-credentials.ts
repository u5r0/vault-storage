import { CosmosClient } from "@azure/cosmos"
import { Agent as HttpsAgent } from "node:https"

/**
 * TLS agent for the localhost Cosmos emulator ONLY. The vnext emulator serves
 * a self-signed cert, so its client must skip verification — but scoping the
 * bypass to this agent keeps TLS verification ON process-wide (Infisical, R2,
 * SMTP and every other outbound call stay protected). Returns undefined for
 * non-localhost endpoints so production uses the default, verified agent.
 */
export function emulatorTlsAgent(endpoint: string): HttpsAgent | undefined {
  return endpoint.includes("localhost")
    ? new HttpsAgent({ rejectUnauthorized: false })
    : undefined
}

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
    return new CosmosClient({ endpoint, key, agent: emulatorTlsAgent(endpoint) })
  }

  // Lazy-import so @azure/identity is never loaded in dev/CI where we
  // don't need it (only the managed-identity path reaches here).
  const { DefaultAzureCredential } = await import("@azure/identity")
  const credential = new DefaultAzureCredential()
  return new CosmosClient({ endpoint, aadCredentials: credential })
}
