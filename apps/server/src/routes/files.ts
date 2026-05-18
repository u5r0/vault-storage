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

const files = new Hono()

/* ----------------------------- Routes ---------------------------------- */

/**
 * GET /api/files?path=Movies/Action
 * List the immediate children (folders + files) at a given path.
 */
files.get("/", zValidator("query", ListFilesQuery), async (c) => {
  const { path } = c.req.valid("query")
  const prefix = toPrefix(path)
  const store = await getBlobStore()

  const entries: VaultEntry[] = []

  for await (const item of store.list(prefix)) {
    if (item.kind === "folder") {
      const name = item.path.slice(prefix.length)
      entries.push({
        name,
        path: item.path,
        type: "folder",
        size: 0,
        contentType: null,
        modifiedAt: null,
      })
    } else {
      const meta = item.metadata
      entries.push({
        name: meta.name,
        path: meta.path,
        type: "file",
        size: meta.size,
        contentType: meta.contentType,
        modifiedAt: meta.modifiedAt ? meta.modifiedAt.toISOString() : null,
      })
    }
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
  const store = await getBlobStore()
  const prefix = toPrefix(path)
  const fullFolder = `${prefix}${name}`
  const keep = `${fullFolder}/.vault-keep`

  await store.upload(keep, Buffer.alloc(0), {
    contentType: "application/x-vault-folder",
  })

  return c.json({ path: fullFolder, type: "folder" }, 201)
})

/**
 * POST /api/files/upload
 * Upload one or more files via multipart/form-data.
 * Form fields: `path` (string, optional), `files` (one or more File entries).
 */
files.post("/upload", async (c) => {
  const form = await c.req.parseBody({ all: true })
  const path = typeof form.path === "string" ? form.path : ""
  const prefix = toPrefix(path)
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
    const blobName = joinName(prefix, file.name)

    // Prefer streaming upload. File has a WHATWG ReadableStream in platforms that support it.
    try {
      // If Readable.fromWeb is available, use it to convert the web stream to a Node stream.
      const webStream = (file as any).stream?.()
      let nodeStream: NodeJS.ReadableStream | null = null
      if (webStream && (Readable as any).fromWeb) {
        nodeStream = (Readable as any).fromWeb(webStream)
      } else if (webStream) {
        // Fallback: convert by reading arrayBuffer
        const buf = Buffer.from(await file.arrayBuffer())
        await store.upload(blobName, buf, { contentType: file.type || "application/octet-stream" })
        uploaded.push({
          name: file.name,
          path: blobName,
          type: "file",
          size: buf.byteLength,
          contentType: file.type || "application/octet-stream",
          modifiedAt: new Date().toISOString(),
        })
        continue
      } else {
        // No stream available (older runtimes) — fallback to buffer
        const buf = Buffer.from(await file.arrayBuffer())
        await store.upload(blobName, buf, { contentType: file.type || "application/octet-stream" })
        uploaded.push({
          name: file.name,
          path: blobName,
          type: "file",
          size: buf.byteLength,
          contentType: file.type || "application/octet-stream",
          modifiedAt: new Date().toISOString(),
        })
        continue
      }

      // Upload the node stream
      await store.upload(blobName, nodeStream as NodeJS.ReadableStream, {
        contentType: file.type || "application/octet-stream",
      })

      uploaded.push({
        name: file.name,
        path: blobName,
        type: "file",
        size: file.size,
        contentType: file.type || "application/octet-stream",
        modifiedAt: new Date().toISOString(),
      })
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
  const path = normalizePath(c.req.query("path"))
  if (!path) throw new HTTPException(400, { message: "Missing 'path' query param" })

  const store = await getBlobStore()
  if (!(await store.exists(path))) {
    throw new HTTPException(404, { message: "File not found" })
  }

  const { stream: downloadStream, metadata } = await store.download(path)

  c.header("Content-Type", metadata.contentType ?? "application/octet-stream")
  c.header("Content-Length", String(metadata.size))
  c.header(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(metadata.name)}"`,
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
  const { from, to } = c.req.valid("json")
  const src = normalizePath(from)
  const dst = normalizePath(to)
  if (!src || !dst) throw new HTTPException(400, { message: "Invalid paths" })
  if (src === dst) return c.json({ path: dst })

  const store = await getBlobStore()

  if (!(await store.exists(src))) {
    throw new HTTPException(404, { message: "Source file not found" })
  }

  await store.copy(src, dst)
  await store.delete(src)

  return c.json({ path: dst })
})

/**
 * DELETE /api/files
 * Delete a single file, or a folder and everything inside it.
 */
files.delete("/", zValidator("json", DeleteBody), async (c) => {
  const { path, isFolder } = c.req.valid("json")
  const norm = normalizePath(path)
  if (!norm) throw new HTTPException(400, { message: "Path is required" })

  const store = await getBlobStore()

  if (!isFolder) {
    if (!(await store.exists(norm))) {
      throw new HTTPException(404, { message: "File not found" })
    }
    await store.delete(norm)
    return c.json({ deleted: 1 })
  }

  const prefix = toPrefix(norm)
  const deleted = await store.deletePrefix(prefix)
  return c.json({ deleted })
})

export default files
