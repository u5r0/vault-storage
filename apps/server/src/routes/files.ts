import { Hono } from "hono"
import { stream } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { zValidator } from "@hono/zod-validator"
import {
  ListFilesQuery,
  CreateFolderBody,
  RenameBody,
  MoveBody,
  DeleteBody,
  type VaultEntry,
} from "@vault/sdk"
import { env, getBlobStore } from "../lib/azure"
import { Readable } from "stream"
import { nanoid } from "nanoid"
import { db } from "../db"
import type { CosmosClient } from "@azure/cosmos"

// Validate that a name doesn't contain path separators or control characters
function isSafeName(name: string): boolean {
  if (!name || name.length > 255) return false
  if (name.includes("/") || name.includes("\\")) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return false
  if (name === "." || name === "..") return false
  return true
}

const files = new Hono()

/* ----------------------------- Routes ---------------------------------- */

/**
 * GET /api/files?entityId=uuid
 * List the immediate children (folders + files) at a given entity ID (folder).
 */
files.get("/", zValidator("query", ListFilesQuery), async (c) => {
  const { entityId } = c.req.valid("query")

  // Query Cosmos DB for immediate children of `entityId`.
  const querySpec = {
    query: "SELECT * FROM c WHERE c.parentId = @parentId AND c.deletedAt = null",
    parameters: [
      { name: "@parentId", value: entityId ?? null },
    ],
  }

  const { resources } = await db.items.query(querySpec).fetchAll()

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

  // Folders first, then files, both alphabetical.
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  })

  return c.json({ entityId: entityId ?? null, entries })
})

/**
 * POST /api/files/folder
 * Create a folder with a given parent ID.
 */
files.post("/folder", zValidator("json", CreateFolderBody), async (c) => {
  const { parentId, name } = c.req.valid("json")
  if (!isSafeName(name)) {
    throw new HTTPException(400, { message: "Invalid folder name" })
  }

  const id = nanoid()
  const createdAt = new Date().toISOString()

  const folder = {
    id,
    ownerId: null,
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
  }

  await db.items.create(folder)

  return c.json({ id, parentId: parentId ?? null, type: "folder" }, 201)
})

/**
 * POST /api/files/upload
 * Upload one or more files via multipart/form-data.
 * Form fields: `parentId` (string, optional), `files` (one or more File entries).
 */
files.post("/upload", async (c) => {
  const form = await c.req.parseBody({ all: true })
  const parentId = typeof form.parentId === "string" ? form.parentId : null
  const store = await getBlobStore()

  const raw = form.files
  const list: File[] = Array.isArray(raw)
    ? (raw.filter((f) => f instanceof File) as File[])
    : raw instanceof File
      ? [raw]
      : []

  if (list.length === 0) {
    throw new HTTPException(400, { message: "No files provided in 'files' field" })
  }

  const limit = env.maxUploadMb * 1024 * 1024
  const uploaded: VaultEntry[] = []

  for (const file of list) {
    if (!isSafeName(file.name)) {
      throw new HTTPException(400, { message: `Invalid filename: ${file.name}` })
    }
    if (file.size > limit) {
      throw new HTTPException(413, {
        message: `File "${file.name}" exceeds ${env.maxUploadMb}MB limit`,
      })
    }

    const id = nanoid()
    const blobName = `vault/blobs/${id}`
    const createdAt = new Date().toISOString()

    try {
      const webStream = (file as unknown as { stream?: () => unknown }).stream?.()
      let nodeStream: NodeJS.ReadableStream | null = null
      const readableAny = Readable as unknown as { fromWeb?: (s: unknown) => NodeJS.ReadableStream }
      if (webStream && readableAny.fromWeb) {
        nodeStream = readableAny.fromWeb(webStream)
      } else if (webStream) {
        const buf = Buffer.from(await file.arrayBuffer())
        await store.upload(blobName, buf, { contentType: file.type || "application/octet-stream" })
        const entry = {
          id,
          ownerId: null,
          parentId,
          name: file.name,
          type: "file",
          size: buf.byteLength,
          contentType: file.type || "application/octet-stream",
          blobName,
          isFavorite: "0",
          tags: null,
          deletedAt: null,
          createdAt,
          modifiedAt: createdAt,
        }
        await db.items.create(entry)
        uploaded.push({ id, ownerId: null, parentId, name: file.name, type: "file", size: buf.byteLength, contentType: file.type || "application/octet-stream", blobUrl: blobName, isFavorite: false, tags: [], createdAt, modifiedAt: createdAt } as VaultEntry)
        continue
      } else {
        const buf = Buffer.from(await file.arrayBuffer())
        await store.upload(blobName, buf, { contentType: file.type || "application/octet-stream" })
        const entry = {
          id,
          ownerId: null,
          parentId,
          name: file.name,
          type: "file",
          size: buf.byteLength,
          contentType: file.type || "application/octet-stream",
          blobName,
          isFavorite: "0",
          tags: null,
          deletedAt: null,
          createdAt,
          modifiedAt: createdAt,
        }
        await db.items.create(entry)
        uploaded.push({ id, ownerId: null, parentId, name: file.name, type: "file", size: buf.byteLength, contentType: file.type || "application/octet-stream", blobUrl: blobName, isFavorite: false, tags: [], createdAt, modifiedAt: createdAt } as VaultEntry)
        continue
      }

      await store.upload(blobName, nodeStream as NodeJS.ReadableStream, {
        contentType: file.type || "application/octet-stream",
      })

      const entry = {
        id,
        ownerId: null,
        parentId,
        name: file.name,
        type: "file",
        size: file.size,
        contentType: file.type || "application/octet-stream",
        blobName,
        isFavorite: "0",
        tags: null,
        deletedAt: null,
        createdAt,
        modifiedAt: createdAt,
      }
      await db.items.create(entry)

      uploaded.push({ id, ownerId: null, parentId, name: file.name, type: "file", size: file.size, contentType: file.type || "application/octet-stream", blobUrl: blobName, isFavorite: false, tags: [], createdAt, modifiedAt: createdAt } as VaultEntry)
    } catch (err) {
      throw new HTTPException(500, { message: `Upload failed for ${file.name}` })
    }
  }

  return c.json({ uploaded }, 201)
})

/**
 * GET /api/files/download?id=uuid
 * Stream a single file back to the client with original content type.
 */
files.get("/download", async (c) => {
  const id = c.req.query("id")
  if (!id) throw new HTTPException(400, { message: "Missing 'id' query param" })

  const { resource } = await db.item(id).read()

  if (!resource) {
    throw new HTTPException(404, { message: "File not found" })
  }

  if (!resource.blobName) throw new HTTPException(400, { message: "Not a file" })

  const store = await getBlobStore()
  if (!(await store.exists(resource.blobName))) {
    throw new HTTPException(404, { message: "File blob not found" })
  }

  const { stream: downloadStream, metadata } = await store.download(resource.blobName)

  c.header("Content-Type", metadata.contentType ?? "application/octet-stream")
  c.header("Content-Length", String(metadata.size))
  c.header(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(resource.name)}"`,
  )

  return stream(c, async (s) => {
    const nodeStream = downloadStream as NodeJS.ReadableStream
    for await (const chunk of nodeStream) {
      await s.write(chunk as Uint8Array)
    }
  })
})


/**
 * PATCH /api/files/rename
 * Rename a file or folder by ID.
 */
files.patch("/rename", zValidator("json", RenameBody), async (c) => {
  const { id, name } = c.req.valid("json")

  const { resource } = await db.item(id).read()
  if (!resource) throw new HTTPException(404, { message: "Item not found" })
  if (resource.name === name) return c.json({ id, name })

  const modifiedAt = new Date().toISOString()
  const { resource: updated } = await db.item(id).replace({
    ...resource,
    name,
    modifiedAt,
  })

  return c.json({ id, name })
})

/**
 * PATCH /api/files/move
 * Move a file or folder to a different parent folder by ID.
 */
files.patch("/move", zValidator("json", MoveBody), async (c) => {
  const { id, parentId } = c.req.valid("json")

  const { resource } = await db.item(id).read()
  if (!resource) throw new HTTPException(404, { message: "Item not found" })
  if (resource.parentId === parentId) return c.json({ id, parentId })

  const modifiedAt = new Date().toISOString()
  await db.item(id).replace({
    ...resource,
    parentId,
    modifiedAt,
  })

  return c.json({ id, parentId })
})

/**
 * DELETE /api/files
 * Delete a single file, or a folder and everything inside it.
 */
files.delete("/", zValidator("json", DeleteBody), async (c) => {
  const { id } = c.req.valid("json")

  const store = await getBlobStore()

  const { resource } = await db.item(id).read()
  if (!resource) throw new HTTPException(404, { message: "Item not found" })

  if (resource.type === "folder") {
    // Delete all entries under this folder and their blobs.
    const querySpec = {
      query: "SELECT * FROM c WHERE c.parentId = @parentId",
      parameters: [{ name: "@parentId", value: id }],
    }
    const { resources } = await db.items.query(querySpec).fetchAll()
    let deletedCount = 0
    for (const r of resources) {
      if (r.blobName && (await store.exists(r.blobName))) {
        await store.delete(r.blobName)
        deletedCount++
      }
      await db.item(r.id).delete()
    }
    // Delete the folder itself
    await db.item(id).delete()
    return c.json({ deleted: deletedCount + 1 })
  }

  // Single file deletion
  if (resource.blobName) {
    if (await store.exists(resource.blobName)) {
      await store.delete(resource.blobName)
    }
  }
  await db.item(id).delete()
  return c.json({ deleted: 1 })
})

/**
 * GET /api/files/quick-links
 * Get counts for Quick Links (starred, recent, tags, trash).
 */
files.get("/quick-links", async (c) => {
  const { resources } = await db.items.readAll().fetchAll()

  // Starred: isFavorite = "1" and not deleted
  const starred = resources.filter((r: any) => r.isFavorite === "1" && !r.deletedAt).length

  // Recent: files modified in last 7 days and not deleted
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recent = resources.filter((r: any) => {
    if (!r.modifiedAt || r.deletedAt) return false
    return new Date(r.modifiedAt) > new Date(sevenDaysAgo)
  }).length

  // Tags: files with non-empty tags array and not deleted
  const tags = resources.filter((r: any) => {
    if (r.deletedAt) return false
    try {
      const parsed = r.tags ? JSON.parse(r.tags) : []
      return Array.isArray(parsed) && parsed.length > 0
    } catch {
      return false
    }
  }).length

  // Trash: soft-deleted items (deletedAt is not null)
  const trash = resources.filter((r: any) => r.deletedAt).length

  return c.json({ starred, recent, tags, trash })
})

export default files
