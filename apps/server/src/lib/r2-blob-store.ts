import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Readable } from "stream"
import type {
  BlobStore,
  BlobListItem,
  BlobMetadata,
  UploadOptions,
  DownloadResult,
  PresignedUrl,
  UploadUrlOptions,
  DownloadUrlOptions,
} from "./storage"

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  /** Override endpoint for local dev (RustFS, MinIO). Omit for production R2. */
  endpoint?: string
}

/**
 * Cloudflare R2 / S3-compatible blob store adapter.
 * Works against production R2 and local S3-compatible stores (RustFS, MinIO).
 */
export class R2BlobStore implements BlobStore {
  private client: S3Client
  private bucket: string

  constructor(config: R2Config) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Required for path-style access with local S3-compatible stores
      forcePathStyle: !!config.endpoint,
    })
  }

  async *list(prefix: string): AsyncIterable<BlobListItem> {
    let continuationToken: string | undefined

    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }))

      // Folders (common prefixes)
      for (const cp of response.CommonPrefixes ?? []) {
        if (!cp.Prefix) continue
        const path = cp.Prefix.replace(/\/$/, "")
        if (path === prefix.replace(/\/$/, "")) continue
        yield { kind: "folder", path }
      }

      // Files
      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue
        const name = obj.Key.slice(prefix.length)
        if (!name) continue

        yield {
          kind: "file",
          metadata: {
            name,
            path: obj.Key,
            size: obj.Size ?? 0,
            contentType: null, // ListObjectsV2 doesn't return content-type
            modifiedAt: obj.LastModified ?? null,
          },
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined
    } while (continuationToken)
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }))
      return true
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false
      }
      throw err
    }
  }

  async stat(path: string): Promise<BlobMetadata | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }))
      return {
        name: path.split("/").pop() ?? "file",
        path,
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
        modifiedAt: response.LastModified ?? null,
      }
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return null
      }
      throw err
    }
  }

  async upload(
    path: string,
    data: Buffer | NodeJS.ReadableStream | AsyncIterable<Uint8Array>,
    options?: UploadOptions,
  ): Promise<void> {
    let body: Buffer | Readable

    if (Buffer.isBuffer(data)) {
      body = data
    } else if (typeof (data as any).pipe === "function") {
      body = data as unknown as Readable
    } else {
      body = Readable.from(data as AsyncIterable<Uint8Array>)
    }

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: body,
      ContentType: options?.contentType ?? "application/octet-stream",
    }))
  }

  async download(path: string): Promise<DownloadResult> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }))

    if (!response.Body) {
      throw new Error("Empty download body")
    }

    return {
      stream: response.Body as NodeJS.ReadableStream,
      metadata: {
        name: path.split("/").pop() ?? "file",
        path,
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
        modifiedAt: response.LastModified ?? null,
      },
    }
  }

  async copy(fromPath: string, toPath: string): Promise<void> {
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: toPath,
      CopySource: `${this.bucket}/${fromPath}`,
    }))
  }

  async delete(path: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }))
  }

  async deletePrefix(prefix: string): Promise<number> {
    const keys: { Key: string }[] = []

    // Collect all keys under the prefix (use flat listing, not hierarchical)
    let continuationToken: string | undefined
    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }))

      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push({ Key: obj.Key })
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined
    } while (continuationToken)

    if (keys.length === 0) return 0

    // Batch delete (up to 1000 per request)
    let deleted = 0
    while (keys.length > 0) {
      const batch = keys.splice(0, 1000)
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: batch },
      }))
      deleted += batch.length
    }

    return deleted
  }

  async createUploadUrl(path: string, options?: UploadUrlOptions): Promise<PresignedUrl> {
    const expiresIn = (options?.expiresMinutes ?? 15) * 60
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      ContentType: options?.contentType ?? "application/octet-stream",
    })

    const url = await getSignedUrl(this.client, command, { expiresIn })
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    return { url, expiresAt }
  }

  async createDownloadUrl(path: string, options?: DownloadUrlOptions): Promise<PresignedUrl> {
    const expiresIn = (options?.expiresMinutes ?? 60) * 60
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    })

    const url = await getSignedUrl(this.client, command, { expiresIn })
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    return { url, expiresAt }
  }
}
