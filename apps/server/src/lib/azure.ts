import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob"
import { AzureBlobStore } from "./azure-blob-store"
import type { BlobStore } from "./storage"

/**
 * Server-side configuration loaded from environment variables.
 * See `.env.example` for the full list and documentation.
 */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
  accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "",
  accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "",
  containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "vault",
  maxUploadMb: Number(process.env.VITE_MAX_UPLOAD_MB ?? 100),
}

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
  if (env.accountName && env.accountKey) {
    return { accountName: env.accountName, accountKey: env.accountKey }
  }

  if (env.connectionString) {
    return parseConnectionString(env.connectionString)
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
  if (env.connectionString) {
    return BlobServiceClient.fromConnectionString(env.connectionString)
  }

  if (env.accountName && env.accountKey) {
    const credential = new StorageSharedKeyCredential(env.accountName, env.accountKey)
    return new BlobServiceClient(
      `https://${env.accountName}.blob.core.windows.net`,
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
    const container = service.getContainerClient(env.containerName)
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
  return Boolean(env.connectionString || (env.accountName && env.accountKey))
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
