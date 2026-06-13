import type { BlobStore } from "./storage"
import { isConfigured as isAzureConfigured } from "./azure"

export type BlobProvider = "r2" | "azure"

let _store: BlobStore | null = null

/**
 * Determine which blob provider to use from env.
 * Defaults to "azure" to preserve current behavior — matches the
 * local-dev row of the deployment matrix in ADR 0020.
 */
export function getProvider(): BlobProvider {
  const provider = process.env.BLOB_PROVIDER ?? "azure"
  if (provider !== "r2" && provider !== "azure") {
    throw new Error(`Invalid BLOB_PROVIDER: "${provider}". Must be "r2" or "azure".`)
  }
  return provider
}

/**
 * Returns true if the configured blob provider has the credentials it needs.
 *
 * Called synchronously from `/api/health`, so this can't be async — the
 * Azure check is a static import (no I/O at module load) and the R2 check
 * is just env-var inspection.
 */
export function isBlobConfigured(): boolean {
  const provider = getProvider()
  if (provider === "r2") {
    return Boolean(
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT),
    )
  }
  return isAzureConfigured()
}

/**
 * Get the BlobStore instance for the configured provider.
 * Lazy-initializes and caches the store.
 */
export async function getBlobStore(): Promise<BlobStore> {
  if (_store) return _store

  const provider = getProvider()

  if (provider === "r2") {
    const { R2BlobStore } = await import("./r2-blob-store")
    _store = new R2BlobStore({
      accountId: process.env.R2_ACCOUNT_ID ?? "",
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      bucket: process.env.R2_BUCKET_NAME ?? "vault",
      endpoint: process.env.R2_ENDPOINT || undefined,
    })
  } else {
    const { getBlobStore: getAzureBlobStore } = await import("./azure")
    _store = await getAzureBlobStore()
  }

  return _store
}
