/**
 * Storage abstraction for blob/file operations.
 * Allows swapping storage backends (Azure, S3, local filesystem, etc.)
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

export type DownloadResult = {
  stream: ReadableStream | NodeJS.ReadableStream
  metadata: BlobMetadata
}

/**
 * BlobStore interface - implement this for different storage backends
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
   * Upload a blob from a buffer
   */
  upload(path: string, data: Buffer, options?: UploadOptions): Promise<void>

  /**
   * Download a blob as a stream
   */
  download(path: string): Promise<DownloadResult>

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
}
