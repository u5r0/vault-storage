import type { ContainerClient } from "@azure/storage-blob"
import type { BlobStore, BlobListItem, BlobMetadata, UploadOptions, DownloadResult } from "./storage"
import { FOLDER_KEEP } from "./paths"

/**
 * Azure Blob Storage adapter implementing the BlobStore interface
 */
export class AzureBlobStore implements BlobStore {
  constructor(private container: ContainerClient) {}

  async *list(prefix: string): AsyncIterable<BlobListItem> {
    for await (const item of this.container.listBlobsByHierarchy("/", { prefix })) {
      if (item.kind === "prefix") {
        // Folder
        const fullPath = item.name.replace(/\/$/, "")
        const name = fullPath.slice(prefix.length)
        if (!name) continue

        yield {
          kind: "folder",
          path: fullPath,
        }
      } else {
        // File
        const name = item.name.slice(prefix.length)
        if (!name || name === FOLDER_KEEP) continue

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

  async upload(path: string, data: Buffer, options?: UploadOptions): Promise<void> {
    const block = this.container.getBlockBlobClient(path)
    await block.uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: options?.contentType || "application/octet-stream",
      },
    })
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
}
