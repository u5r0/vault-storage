import { HTTPException } from "hono/http-exception"
import { Readable } from "stream"
import { v4 as uuidv4 } from "uuid"
import { db } from "../db"
import { env, getBlobStore } from "../lib/azure"
import type { VaultEntry } from "@vault/sdk"

function isSafeName(name: string): boolean {
  if (!name || name.length > 255) return false
  if (name.includes("/") || name.includes("\\")) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return false
  if (name === "." || name === "..") return false
  return true
}

function checkOwner(resource: any, ownerId: string) {
  if (resource.ownerId !== null && resource.ownerId !== ownerId) {
    throw new HTTPException(403, { message: "Forbidden" })
  }
}

export class FilesService {
  async list(parentId: string | null, ownerId: string): Promise<VaultEntry[]> {
    const { resources } = await db.items.query({
      query:
        "SELECT * FROM c WHERE c.parentId = @parentId AND c.deletedAt = null AND (c.ownerId = @ownerId OR c.ownerId = null)",
      parameters: [
        { name: "@parentId", value: parentId ?? null },
        { name: "@ownerId", value: ownerId },
      ],
    }).fetchAll()

    const entries: VaultEntry[] = resources.map((r: any) => ({
      id: r.id,
      ownerId: r.ownerId ?? null,
      parentId: r.parentId,
      name: r.name,
      type: r.type,
      size: r.size ?? 0,
      contentType: r.contentType ?? null,
      blobUrl: r.blobName ?? null,
      isFavorite: r.isFavorite === "1",
      tags: r.tags ? JSON.parse(r.tags) : [],
      createdAt: r.createdAt,
      modifiedAt: r.modifiedAt ?? null,
    }))

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    })

    return entries
  }

  async createFolder(
    parentId: string | null,
    name: string,
    ownerId: string,
  ): Promise<{ id: string }> {
    if (!isSafeName(name)) throw new HTTPException(400, { message: "Invalid folder name" })

    const id = uuidv4()
    const createdAt = new Date().toISOString()

    await db.items.create({
      id,
      ownerId,
      parentId: parentId ?? null,
      name,
      type: "folder",
      size: 0,
      contentType: null,
      blobName: null,
      isFavorite: "0",
      tags: null,
      deletedAt: null,
      createdAt,
      modifiedAt: null,
    })

    return { id }
  }

  async upload(files: File[], parentId: string | null, ownerId: string): Promise<VaultEntry[]> {
    if (files.length === 0) throw new HTTPException(400, { message: "No files provided in 'files' field" })

    const store = await getBlobStore()
    const limit = env.maxUploadMb * 1024 * 1024
    const uploaded: VaultEntry[] = []

    for (const file of files) {
      if (!isSafeName(file.name)) throw new HTTPException(400, { message: `Invalid filename: ${file.name}` })
      if (file.size > limit) throw new HTTPException(413, { message: `File "${file.name}" exceeds ${env.maxUploadMb}MB limit` })

      const id = uuidv4()
      const blobName = `vault/blobs/${id}`
      const createdAt = new Date().toISOString()

      try {
        const webStream = (file as unknown as { stream?: () => unknown }).stream?.()
        const readableAny = Readable as unknown as { fromWeb?: (s: unknown) => NodeJS.ReadableStream }
        let nodeStream: NodeJS.ReadableStream | null =
          webStream && readableAny.fromWeb ? readableAny.fromWeb(webStream) : null

        const buf = nodeStream ? null : Buffer.from(await file.arrayBuffer())

        if (buf) {
          await store.upload(blobName, buf, { contentType: file.type || "application/octet-stream" })
        } else {
          await store.upload(blobName, nodeStream as NodeJS.ReadableStream, {
            contentType: file.type || "application/octet-stream",
          })
        }

        const size = buf ? buf.byteLength : file.size
        const entry = {
          id, ownerId, parentId,
          name: file.name,
          type: "file",
          size,
          contentType: file.type || "application/octet-stream",
          blobName,
          isFavorite: "0",
          tags: null,
          deletedAt: null,
          createdAt,
          modifiedAt: createdAt,
        }
        await db.items.create(entry)
        uploaded.push({
          id, ownerId, parentId,
          name: file.name,
          type: "file",
          size,
          contentType: file.type || "application/octet-stream",
          blobUrl: blobName,
          isFavorite: false,
          tags: [],
          createdAt,
          modifiedAt: createdAt,
        } as VaultEntry)
      } catch (err) {
        if (err instanceof HTTPException) throw err
        throw new HTTPException(500, { message: `Upload failed for ${file.name}` })
      }
    }

    return uploaded
  }

  async download(id: string, ownerId: string) {
    const { resource } = await db.item(id).read()
    if (!resource) throw new HTTPException(404, { message: "File not found" })
    checkOwner(resource, ownerId)
    if (!resource.blobName) throw new HTTPException(400, { message: "Not a file" })

    const store = await getBlobStore()
    if (!(await store.exists(resource.blobName))) throw new HTTPException(404, { message: "File blob not found" })

    const { stream, metadata } = await store.download(resource.blobName)
    return { stream, metadata, name: resource.name }
  }

  async rename(id: string, name: string, ownerId: string): Promise<void> {
    const { resource } = await db.item(id).read()
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)
    if (resource.name === name) return
    await db.item(id).replace({ ...resource, name, modifiedAt: new Date().toISOString() })
  }

  async move(id: string, parentId: string | null, ownerId: string): Promise<void> {
    const { resource } = await db.item(id).read()
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)
    if (resource.parentId === parentId) return
    await db.item(id).replace({ ...resource, parentId, modifiedAt: new Date().toISOString() })
  }

  async delete(id: string, ownerId: string): Promise<{ deleted: number }> {
    const store = await getBlobStore()
    const { resource } = await db.item(id).read()
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)

    if (resource.type === "folder") {
      const { resources } = await db.items.query({
        query: "SELECT * FROM c WHERE c.parentId = @parentId",
        parameters: [{ name: "@parentId", value: id }],
      }).fetchAll()
      let deletedCount = 0
      for (const r of resources) {
        if (r.blobName && (await store.exists(r.blobName))) {
          await store.delete(r.blobName)
          deletedCount++
        }
        await db.item(r.id).delete()
      }
      await db.item(id).delete()
      return { deleted: deletedCount + 1 }
    }

    if (resource.blobName && (await store.exists(resource.blobName))) {
      await store.delete(resource.blobName)
    }
    await db.item(id).delete()
    return { deleted: 1 }
  }

  async quickLinks(ownerId: string) {
    const { resources } = await db.items.query({
      query: "SELECT * FROM c WHERE c.ownerId = @ownerId OR c.ownerId = null",
      parameters: [{ name: "@ownerId", value: ownerId }],
    }).fetchAll()

    const starred = resources.filter((r: any) => r.isFavorite === "1" && !r.deletedAt).length

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recent = resources.filter((r: any) => {
      if (!r.modifiedAt || r.deletedAt) return false
      return new Date(r.modifiedAt) > new Date(sevenDaysAgo)
    }).length

    const tags = resources.filter((r: any) => {
      if (r.deletedAt) return false
      try {
        const parsed = r.tags ? JSON.parse(r.tags) : []
        return Array.isArray(parsed) && parsed.length > 0
      } catch { return false }
    }).length

    const trash = resources.filter((r: any) => r.deletedAt).length

    return { starred, recent, tags, trash }
  }
}

export const filesService = new FilesService()
