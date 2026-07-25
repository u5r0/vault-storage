import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  type ContainerClient,
} from "@azure/storage-blob"
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
import { Readable } from "stream"
import { getServerConfig } from "./env"
import { resolveAccountCredentials } from "./azure"
import { StorageSharedKeyCredential } from "@azure/storage-blob"

const serverConfig = getServerConfig()

/**
 * Azure Blob Storage adapter implementing the BlobStore interface.
 * Constructor signature is unchanged — only takes a ContainerClient.
 */
export class AzureBlobStore implements BlobStore {
  constructor(private container: ContainerClient) {}

  async *list(prefix: string): AsyncIterable<BlobListItem> {
    for await (const item of this.container.listBlobsByHierarchy("/", { prefix })) {
      if (item.kind === "prefix") {
        const fullPath = item.name.replace(/\/$/, "")
        const name = fullPath.slice(prefix.length)
        if (!name) continue
        yield { kind: "folder", path: fullPath }
      } else {
        const name = item.name.slice(prefix.length)
        if (!name) continue
        const props = item.properties
        yield {
          kind: "file",
          metadata: {
            name,
            path: item.name,
            size: Number(props.contentLength ?? 0),
            contentType: props.contentType ?? null,
            modifiedAt: props.lastModified ? new Date(props.lastModified) : null,
          },
        }
      }
    }
  }

  async exists(path: string): Promise<boolean> {
    const blob = this.container.getBlobClient(path)
    return blob.exists()
  }

  async stat(path: string): Promise<BlobMetadata | null> {
    const blob = this.container.getBlobClient(path)
    try {
      const props = await blob.getProperties()
      return {
        name: path.split("/").pop() ?? "file",
        path,
        size: Number(props.contentLength ?? 0),
        contentType: props.contentType ?? null,
        modifiedAt: props.lastModified ? new Date(props.lastModified) : null,
      }
    } catch (err: any) {
      if (err.statusCode === 404) return null
      throw err
    }
  }

  async upload(
    path: string,
    data: Buffer | NodeJS.ReadableStream | AsyncIterable<Uint8Array>,
    options?: UploadOptions,
  ): Promise<void> {
    const block = this.container.getBlockBlobClient(path)

    const headers = {
      blobHTTPHeaders: {
        blobContentType: options?.contentType || "application/octet-stream",
      },
    }

    if (Buffer.isBuffer(data)) {
      await block.uploadData(data, headers)
      return
    }

    if (typeof (data as any).pipe === "function") {
      await block.uploadStream(data as any, 4 * 1024 * 1024, 5, headers)
      return
    }

    const nodeStream = Readable.from(data as AsyncIterable<Uint8Array>)
    await block.uploadStream(nodeStream, 4 * 1024 * 1024, 5, headers)
  }

  async download(path: string): Promise<DownloadResult> {
    const blob = this.container.getBlobClient(path)
    const props = await blob.getProperties()
    const download = await blob.download()

    if (!download.readableStreamBody) {
      throw new Error("Empty download stream")
    }

    return {
      stream: download.readableStreamBody as NodeJS.ReadableStream,
      metadata: {
        name: path.split("/").pop() ?? "file",
        path,
        size: Number(props.contentLength ?? 0),
        contentType: props.contentType ?? null,
        modifiedAt: props.lastModified ? new Date(props.lastModified) : null,
      },
    }
  }

  async copy(fromPath: string, toPath: string): Promise<void> {
    const source = this.container.getBlobClient(fromPath)
    const target = this.container.getBlobClient(toPath)
    const poller = await target.beginCopyFromURL(source.url)
    await poller.pollUntilDone()
  }

  async delete(path: string): Promise<void> {
    const blob = this.container.getBlobClient(path)
    await blob.delete()
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0
    for await (const item of this.container.listBlobsFlat({ prefix })) {
      await this.container.deleteBlob(item.name)
      deleted++
    }
    return deleted
  }

  async createUploadUrl(path: string, options?: UploadUrlOptions): Promise<PresignedUrl> {
    const expiresMinutes = options?.expiresMinutes ?? 15
    const { accountName, accountKey } = resolveAccountCredentials()
    const credential = new StorageSharedKeyCredential(accountName, accountKey)
    const block = this.container.getBlockBlobClient(path)

    const startsOn = new Date(Date.now() - 60_000)
    const expiresOn = new Date(Date.now() + expiresMinutes * 60 * 1000)

    const permissions = new BlobSASPermissions()
    permissions.create = true
    permissions.write = true

    const sas = generateBlobSASQueryParameters(
      {
        containerName: serverConfig.AZURE_STORAGE_CONTAINER_NAME,
        blobName: path,
        permissions,
        startsOn,
        expiresOn,
      },
      credential,
    ).toString()

    return {
      url: `${block.url}?${sas}`,
      expiresAt: expiresOn,
      // Azure Put Blob (single shot) requires this header on every PUT.
      // The SDK passes it through to fetch(); R2/S3 ignore it.
      requiredHeaders: { "x-ms-blob-type": "BlockBlob" },
    }
  }

  async createDownloadUrl(path: string, options?: DownloadUrlOptions): Promise<PresignedUrl> {
    const expiresMinutes = options?.expiresMinutes ?? 60
    const { accountName, accountKey } = resolveAccountCredentials()
    const credential = new StorageSharedKeyCredential(accountName, accountKey)
    const blob = this.container.getBlobClient(path)

    const startsOn = new Date(Date.now() - 60_000)
    const expiresOn = new Date(Date.now() + expiresMinutes * 60 * 1000)

    const permissions = new BlobSASPermissions()
    permissions.read = true

    const sas = generateBlobSASQueryParameters(
      {
        containerName: serverConfig.AZURE_STORAGE_CONTAINER_NAME,
        blobName: path,
        permissions,
        startsOn,
        expiresOn,
      },
      credential,
    ).toString()

    return { url: `${blob.url}?${sas}`, expiresAt: expiresOn }
  }
}
