import { Hono } from "hono"
import { stream } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { zValidator } from "@hono/zod-validator"
import {
  ListFilesQuery,
  CreateFolderBody,
  RenameBody,
  DeleteBody,
  type VaultEntry,
} from "@vault/sdk"
import { env, getBlobStore, generateUploadSAS } from "../lib/azure"
import { Readable } from "stream"
import { isSafeName, joinName, normalizePath, toPrefix } from "../lib/paths"
import { nanoid } from "nanoid"
import { db } from "../db"
import { vaultEntries } from "../db/schema"
import { eq } from "drizzle-orm"

const files = new Hono()

/* ----------------------------- Routes ---------------------------------- */

/**
 * GET /api/files?path=Movies/Action
 * List the immediate children (folders + files) at a given path.
 */
files.get("/", zValidator("query", ListFilesQuery), async (c) => {
  const { path } = c.req.valid("query")
  const prefix = normalizePath(path)

  // Query metadata DB for immediate children of `prefix`.
  const rows = await db.select().from(vaultEntries)
  const entries: VaultEntry[] = []

  for (const r of rows) {
    if (!r.path) continue
    if (!prefix) {
      if (r.path.includes("/")) continue
    } else {
      if (r.path === prefix) continue
      if (!r.path.startsWith(prefix + "/")) continue
      const rest = r.path.slice(prefix.length + 1)
      if (rest.includes("/")) continue
    }

    entries.push({
      id: r.id,
      ownerId: r.ownerId ?? null,
      name: r.name,
      path: r.path,
      type: r.type,
      size: r.size,
      contentType: r.contentType,
      modifiedAt: r.modifiedAt,
    } as VaultEntry)
  }

  // Folders first, then files, both alphabetical.
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  })

  return c.json({ path: normalizePath(path), entries })
})

/**
 * POST /api/files/folder
 * Create a virtual folder by writing a 0-byte ".vault-keep" placeholder.
 */
files.post("/folder", zValidator("json", CreateFolderBody), async (c) => {
  const { path, name } = c.req.valid("json")
  if (!isSafeName(name)) {
    throw new HTTPException(400, { message: "Invalid folder name" })
  }
  const prefix = normalizePath(path)
  const fullPath = prefix ? `${prefix}/${name}` : name

  const id = nanoid()
  const createdAt = new Date().toISOString()

  await db.insert(vaultEntries).values({
    id,
    ownerId: null,
    name,
    path: fullPath,
    type: "folder",
    size: 0,
    contentType: null,
    blobName: null,
    createdAt,
    modifiedAt: null,
  }).run()

  return c.json({ id, path: fullPath, type: "folder" }, 201)
})

/**
 * POST /api/files/upload
 * Upload one or more files via multipart/form-data.
 * Form fields: `path` (string, optional), `files` (one or more File entries).
 */
files.post("/upload", async (c) => {
  const form = await c.req.parseBody({ all: true })
  const path = typeof form.path === "string" ? form.path : ""
  const prefix = normalizePath(path)
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
    const virtualPath = prefix ? `${prefix}/${file.name}` : file.name
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
        await db.insert(vaultEntries).values({
          id,
          ownerId: null,
          name: file.name,
          path: virtualPath,
          type: "file",
          size: buf.byteLength,
          contentType: file.type || "application/octet-stream",
          blobName,
          createdAt,
          modifiedAt: createdAt,
        }).run()
        uploaded.push({ id, name: file.name, path: virtualPath, type: "file", size: buf.byteLength, contentType: file.type || "application/octet-stream", modifiedAt: createdAt } as VaultEntry)
        continue
      } else {
        const buf = Buffer.from(await file.arrayBuffer())
        await store.upload(blobName, buf, { contentType: file.type || "application/octet-stream" })
        await db.insert(vaultEntries).values({
          id,
          ownerId: null,
          name: file.name,
          path: virtualPath,
          type: "file",
          size: buf.byteLength,
          contentType: file.type || "application/octet-stream",
          blobName,
          createdAt,
          modifiedAt: createdAt,
        }).run()
        uploaded.push({ id, name: file.name, path: virtualPath, type: "file", size: buf.byteLength, contentType: file.type || "application/octet-stream", modifiedAt: createdAt } as VaultEntry)
        continue
      }

      await store.upload(blobName, nodeStream as NodeJS.ReadableStream, {
        contentType: file.type || "application/octet-stream",
      })

      await db.insert(vaultEntries).values({
        id,
        ownerId: null,
        name: file.name,
        path: virtualPath,
        type: "file",
        size: file.size,
        contentType: file.type || "application/octet-stream",
        blobName,
        createdAt,
        modifiedAt: createdAt,
      }).run()

      uploaded.push({ id, name: file.name, path: virtualPath, type: "file", size: file.size, contentType: file.type || "application/octet-stream", modifiedAt: createdAt } as VaultEntry)
    } catch (err) {
      throw new HTTPException(500, { message: `Upload failed for ${file.name}` })
    }
  }

  return c.json({ uploaded }, 201)
})

/**
 * GET /api/files/download?path=Movies/movie.mp4
 * Stream a single file back to the client with original content type.
 */
files.get("/download", async (c) => {
  const id = c.req.query("id")
  const pathQuery = normalizePath(c.req.query("path"))
  if (!id && !pathQuery) throw new HTTPException(400, { message: "Missing 'id' or 'path' query param" })

  let row: any = null
  if (id) {
    row = await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).get()
  } else if (pathQuery) {
    row = await db.select().from(vaultEntries).where(eq(vaultEntries.path, pathQuery)).get()
  }

  if (!row) {
    throw new HTTPException(404, { message: "File not found" })
  }

  if (!row.blobName) throw new HTTPException(400, { message: "Not a file" })

  const store = await getBlobStore()
  if (!(await store.exists(row.blobName))) {
    throw new HTTPException(404, { message: "File blob not found" })
  }

  const { stream: downloadStream, metadata } = await store.download(row.blobName)

  c.header("Content-Type", metadata.contentType ?? "application/octet-stream")
  c.header("Content-Length", String(metadata.size))
  c.header(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(row.name)}"`,
  )

  return stream(c, async (s) => {
    const nodeStream = downloadStream as NodeJS.ReadableStream
    for await (const chunk of nodeStream) {
      await s.write(chunk as Uint8Array)
    }
  })
})

/**
 * GET /api/files/sas?path=Movies/movie.mp4
 * Return a short-lived SAS upload URL for a given target blob path.
 */
files.get("/sas", async (c) => {
  const path = normalizePath(c.req.query("path"))
  if (!path) throw new HTTPException(400, { message: "Missing 'path' query param" })

  const name = path.split("/").pop() ?? ""
  if (!isSafeName(name)) {
    throw new HTTPException(400, { message: `Invalid filename: ${name}` })
  }

  // Compatibility: generate a SAS for a blob name at the given virtual path.
  // New clients should prefer creating an id and requesting a SAS for the
  // canonical blob name (vault/blobs/<id>).
  try {
    const { url } = await generateUploadSAS(path)
    return c.json({ uploadUrl: url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate SAS"
    throw new HTTPException(500, { message })
  }
})

/**
 * PATCH /api/files/rename
 * Rename or move a file by copy-then-delete. Folders are not renamed
 * here; that would require recursing every blob under the prefix.
 */
files.patch("/rename", zValidator("json", RenameBody), async (c) => {
  const { from, to, id } = c.req.valid("json") as unknown as { from?: string; to?: string; id?: string }
  const dst = normalizePath(to)
  if (!dst) throw new HTTPException(400, { message: "Invalid destination path" })

  let row: any = null
  if (id) {
    row = await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).get()
  } else if (from) {
    const src = normalizePath(from)
    row = await db.select().from(vaultEntries).where(eq(vaultEntries.path, src)).get()
  }

  if (!row) throw new HTTPException(404, { message: "Source not found" })
  if (row.path === dst) return c.json({ path: dst })

  // Update virtual path and name. Blob stays the same.
  const newName = dst.split("/").pop() ?? row.name
  await db.update(vaultEntries).set({ path: dst, name: newName, modifiedAt: new Date().toISOString() }).where(eq(vaultEntries.id, row.id)).run()

  return c.json({ id: row.id, path: dst })
})

/**
 * DELETE /api/files
 * Delete a single file, or a folder and everything inside it.
 */
files.delete("/", zValidator("json", DeleteBody), async (c) => {
  const { path, isFolder, id } = c.req.valid("json") as unknown as { path?: string; isFolder?: boolean; id?: string }

  let store = await getBlobStore()

  if (!isFolder) {
    let row: any = null
    if (id) row = await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).get()
    else if (path) row = await db.select().from(vaultEntries).where(eq(vaultEntries.path, normalizePath(path))).get()

    if (!row) throw new HTTPException(404, { message: "File not found" })
    if (row.blobName) {
      if (await store.exists(row.blobName)) {
        await store.delete(row.blobName)
      }
    }
    await db.delete(vaultEntries).where(eq(vaultEntries.id, row.id)).run()
    return c.json({ deleted: 1 })
  }

  const norm = normalizePath(path)
  if (!norm) throw new HTTPException(400, { message: "Path is required for folder delete" })

  // Delete all entries under this prefix and their blobs.
  const rows = await db.select().from(vaultEntries)
  const toDelete = rows.filter((r: any) => r.path === norm || r.path.startsWith(norm + "/"))
  let deletedCount = 0
  for (const r of toDelete) {
    if (r.blobName && (await store.exists(r.blobName))) {
      await store.delete(r.blobName)
      deletedCount++
    }
    await db.delete(vaultEntries).where(eq(vaultEntries.id, r.id)).run()
  }

  return c.json({ deleted: deletedCount })
})

export default files
