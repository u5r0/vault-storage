import type { TestProject } from "vitest/node"

/**
 * Vitest global setup — uses Docker-based Azurite for integration tests.
 *
 * Azurite is expected to be running via docker-compose on port 10000.
 * The well-known dev account (`devstoreaccount1`) is used. We `provide()` the
 * connection string so per-worker `setupFiles` (azurite.env.ts) can set
 * `AZURE_STORAGE_CONNECTION_STRING` before the server modules load.
 *
 * See ADR 0010 - Docker-based Azurite and Cosmos emulator.
 */

const ACCOUNT_NAME = "devstoreaccount1"
// Well-known dev key shipped with Azurite. Not a secret.
// https://learn.microsoft.com/azure/storage/common/storage-use-azurite#well-known-storage-account-and-key
const ACCOUNT_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="

const AZURITE_PORT = 10000

export default async function setup(project: TestProject) {
  const connectionString =
    `DefaultEndpointsProtocol=http;` +
    `AccountName=${ACCOUNT_NAME};` +
    `AccountKey=${ACCOUNT_KEY};` +
    `BlobEndpoint=http://127.0.0.1:${AZURITE_PORT}/${ACCOUNT_NAME};`

  project.provide("azuriteConnectionString", connectionString)
  project.provide("azuriteContainer", `vault-test-${Date.now()}`)

  return async () => {
    // No cleanup needed - docker-compose manages Azurite lifecycle
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    azuriteConnectionString: string
    azuriteContainer: string
  }
}
