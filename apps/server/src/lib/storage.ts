/**
 * Storage abstraction for blob/file operations.
 * Allows swapping storage backends (Azure, R2, local S3-compatible, etc.)
 */

export type BlobMetadata = {
  name: string
  path: string
  size: number
  contentType: string | null
  modifiedAt: Date | null
}

export type BlobListItem =
  | { kind: "folder"; path: string }
  | { kind: "file"; metadata: BlobMetadata }

export type UploadOptions = {
  contentType?: string
}

export type PresignedUrl = {
  url: string
  expiresAt: Date
  /**
   * Additional headers the client MUST include on the request to `url`.
   * Azure block blob PUT requires `x-ms-blob-type: BlockBlob`; S3/R2 PUT
   * has no required extras. Keep this transparent so the SDK doesn't
   * branch on provider.
   */
  requiredHeaders?: Record<string, string>
}

export type UploadUrlOptions = {
  contentType?: string
  expiresMinutes?: number
}

export type DownloadUrlOptions = {
  expiresMinutes?: number
}

/**
 * BlobStore interface - implement this for different storage backends.
 *
 * Implementations:
 *  - AzureBlobStore  (Azure Blob Storage / Azurite)
 *  - R2BlobStore     (Cloudflare R2 / RustFS / any S3-compatible)
 */
export interface BlobStore {
  /**
   * List blobs at a given path prefix, grouped by folders and files
   */
  list(prefix: string): AsyncIterable<BlobListItem>

  /**
   * Check if a blob exists at the given path
   */
  exists(path: string): Promise<boolean>

  /**
   * Look up blob metadata without opening the body. Returns null when the
   * blob does not exist. Cheaper than downloading when you only need
   * size / contentType (e.g. server-side validation after a presigned PUT).
   */
  stat(path: string): Promise<BlobMetadata | null>

  /**
   * Upload a blob from a Buffer or a readable stream.
   * Accepts a NodeJS.ReadableStream, an AsyncIterable<Uint8Array>, or Buffer.
   */
  upload(path: string, data: Buffer | NodeJS.ReadableStream | AsyncIterable<Uint8Array>, options?: UploadOptions): Promise<void>

  /**
   * Copy a blob from one path to another
   */
  copy(fromPath: string, toPath: string): Promise<void>

  /**
   * Delete a blob at the given path
   */
  delete(path: string): Promise<void>

  /**
   * Delete all blobs with a given prefix (for folder deletion)
   */
  deletePrefix(prefix: string): Promise<number>

  /**
   * Generate a presigned URL for direct client-side upload (PUT).
   */
  createUploadUrl(path: string, options?: UploadUrlOptions): Promise<PresignedUrl>

  /**
   * Generate a presigned URL for direct client-side download (GET).
   */
  createDownloadUrl(path: string, options?: DownloadUrlOptions): Promise<PresignedUrl>
}
