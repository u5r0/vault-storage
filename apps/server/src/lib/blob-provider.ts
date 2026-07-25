import type { BlobStore } from "./storage"
import { getServerConfig } from "./env"
import { isConfigured as isAzureConfigured, getBlobStore as getAzureBlobStore } from "./azure"

export type BlobProvider = "r2" | "azure"

let _store: BlobStore | null = null

export function getProvider(): BlobProvider {
  const provider = getServerConfig().BLOB_PROVIDER
  if (provider !== "r2" && provider !== "azure") {
    throw new Error(`Invalid BLOB_PROVIDER: "${provider}". Must be "r2" or "azure".`)
  }
  return provider
}

export function isBlobConfigured(): boolean {
  const provider = getProvider()
  if (provider === "r2") {
    return Boolean(
      getServerConfig().R2_ACCESS_KEY_ID &&
      getServerConfig().R2_SECRET_ACCESS_KEY &&
      (getServerConfig().R2_ACCOUNT_ID || getServerConfig().R2_ENDPOINT),
    )
  }
  return isAzureConfigured()
}

export async function getBlobStore(): Promise<BlobStore> {
  if (_store) return _store

  const provider = getProvider()

  if (provider === "r2") {
    const { R2BlobStore } = await import("./r2-blob-store")
    _store = new R2BlobStore({
      accountId: getServerConfig().R2_ACCOUNT_ID ?? "",
      accessKeyId: getServerConfig().R2_ACCESS_KEY_ID!,
      secretAccessKey: getServerConfig().R2_SECRET_ACCESS_KEY!,
      bucket: getServerConfig().R2_BUCKET_NAME,
      endpoint: getServerConfig().R2_ENDPOINT || undefined,
    })
  } else {
    _store = await getAzureBlobStore()
  }

  return _store
}
