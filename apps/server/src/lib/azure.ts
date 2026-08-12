import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob"
import { getServerConfig } from "./env.js"
import { AzureBlobStore } from "./azure-blob-store.js"
import type { BlobStore } from "./storage.js"

let _container: ContainerClient | null = null
let _ready: Promise<ContainerClient> | null = null

function parseConnectionString(connectionString: string): {
  accountName: string
  accountKey: string
} {
  const parts: Record<string, string> = {}
  for (const segment of connectionString.split(";")) {
    if (!segment) continue
    const eq = segment.indexOf("=")
    if (eq === -1) continue
    parts[segment.slice(0, eq)] = segment.slice(eq + 1)
  }

  const accountName = parts.AccountName
  const accountKey = parts.AccountKey
  if (!accountName || !accountKey) {
    throw new Error(
      "Connection string must include AccountName and AccountKey for SAS generation",
    )
  }

  return { accountName, accountKey }
}

/**
 * Resolve account name + key from explicit env vars or a connection string.
 * Used by `AzureBlobStore` to mint SAS tokens for presigned URLs.
 */
export function resolveAccountCredentials(): { accountName: string; accountKey: string } {
  const config = getServerConfig()
  if (config.AZURE_STORAGE_ACCOUNT_NAME && config.AZURE_STORAGE_ACCOUNT_KEY) {
    return { accountName: config.AZURE_STORAGE_ACCOUNT_NAME, accountKey: config.AZURE_STORAGE_ACCOUNT_KEY }
  }

  if (config.AZURE_STORAGE_CONNECTION_STRING) {
    return parseConnectionString(config.AZURE_STORAGE_CONNECTION_STRING)
  }

  throw new Error(
    "Missing Azure credentials. Set AZURE_STORAGE_CONNECTION_STRING " +
      "or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY.",
  )
}

/**
 * Build a BlobServiceClient from either a connection string or
 * an account name + key pair. Throws if neither is configured.
 */
function buildServiceClient(): BlobServiceClient {
  const config = getServerConfig()
  if (config.AZURE_STORAGE_CONNECTION_STRING) {
    return BlobServiceClient.fromConnectionString(config.AZURE_STORAGE_CONNECTION_STRING)
  }

  if (config.AZURE_STORAGE_ACCOUNT_NAME && config.AZURE_STORAGE_ACCOUNT_KEY) {
    const credential = new StorageSharedKeyCredential(config.AZURE_STORAGE_ACCOUNT_NAME, config.AZURE_STORAGE_ACCOUNT_KEY)
    return new BlobServiceClient(
      `https://${config.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential,
    )
  }

  throw new Error(
    "[azure] Missing credentials. Set AZURE_STORAGE_CONNECTION_STRING " +
      "or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY.",
  )
}

/**
 * Lazy-initialize the container client. The container is created on
 * first use if it doesn't already exist (private access by default).
 *
 * Internal — only `getBlobStore` (below) needs this. Consumers should
 * import `getBlobStore` from `./blob-provider`.
 */
function getContainer(): Promise<ContainerClient> {
  if (_container) return Promise.resolve(_container)
  if (_ready) return _ready

  _ready = (async () => {
    const service = buildServiceClient()
    const container = service.getContainerClient(getServerConfig().AZURE_STORAGE_CONTAINER_NAME)
    await container.createIfNotExists()
    _container = container
    return container
  })()

  return _ready
}

/**
 * True if the server has the credentials it needs to talk to Azure.
 * Used by the /api/health endpoint to surface configuration issues.
 */
export function isConfigured(): boolean {
  const config = getServerConfig()
  return Boolean(config.AZURE_STORAGE_CONNECTION_STRING || (config.AZURE_STORAGE_ACCOUNT_NAME && config.AZURE_STORAGE_ACCOUNT_KEY))
}

/**
 * Get the BlobStore instance (abstraction over Azure Blob Storage).
 *
 * NOTE: most consumers should import `getBlobStore` from `./blob-provider`
 * instead — it dispatches to the correct backend based on `BLOB_PROVIDER`.
 * This export remains as the Azure-specific factory used by `blob-provider`.
 */
export async function getBlobStore(): Promise<BlobStore> {
  const container = await getContainer()
  return new AzureBlobStore(container)
}
