import { Hono } from "hono"
import { stream } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { env, getContainer } from "../lib/azure"
import { FOLDER_KEEP, isSafeName, joinName, normalizePath, toPrefix } from "../lib/paths"

const files = new Hono()

/* ----------------------------- Schemas --------------------------------- */

const listQuery = z.object({
  path: z.string().optional().default(""),
})

const folderBody = z.object({
  path: z.string().optional().default(""),
  name: z.string().min(1).max(255),
})

const renameBody = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
})

const deleteBody = z.object({
  path: z.string().min(1),
  isFolder: z.boolean().optional().default(false),
})

/* ----------------------------- Types ----------------------------------- */

type Entry = {
  name: string
  path: string
  type: "folder" | "file"
  size: number
  contentType: string | null
  modifiedAt: string | null
}

/* ----------------------------- Routes ---------------------------------- */

/**
 * GET /api/files?path=Movies/Action
 * List the immediate children (folders + files) at a given path.
 */
files.get("/", zValidator("query", listQuery), async (c) => {
  const { path } = c.req.valid("query")
  const prefix = toPrefix(path)
  const container = await getContainer()

  const entries: Entry[] = []

  for await (const item of container.listBlobsByHierarchy("/", { prefix })) {
    if (item.kind === "prefix") {
      const fullPath = item.name.replace(/\/$/, "")
      const name = fullPath.slice(prefix.length)
      if (!name) continue
      entries.push({
        name,
        path: fullPath,
        type: "folder",
        size: 0,
        contentType: null,
        modifiedAt: null,
      })
    } else {
      const name = item.name.slice(prefix.length)
      if (!name || name === FOLDER_KEEP) continue
      const props = item.properties
      entries.push({
        name,
        path: item.name,
        type: "file",
        size: Number(props.contentLength ?? 0),
        contentType: props.contentType ?? null,
        modifiedAt: props.lastModified ? new Date(props.lastModified).toISOString() : null,
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
files.post("/folder", zValidator("json", folderBody), async (c) => {
  const { path, name } = c.req.valid("json")
  if (!isSafeName(name)) {
    throw new HTTPException(400, { message: "Invalid folder name" })
  }
  const container = await getContainer()
  const prefix = toPrefix(path)
  const fullFolder = `${prefix}${name}`
  const keep = `${fullFolder}/${FOLDER_KEEP}`

  const block = container.getBlockBlobClient(keep)
  await block.uploadData(Buffer.alloc(0), {
    blobHTTPHeaders: { blobContentType: "application/x-vault-folder" },
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
  const container = await getContainer()

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
  const uploaded: Entry[] = []

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
    const block = container.getBlockBlobClient(blobName)
    const buf = Buffer.from(await file.arrayBuffer())
    await block.uploadData(buf, {
      blobHTTPHeaders: {
        blobContentType: file.type || "application/octet-stream",
      },
    })

    uploaded.push({
      name: file.name,
      path: blobName,
      type: "file",
      size: buf.byteLength,
      contentType: file.type || "application/octet-stream",
      modifiedAt: new Date().toISOString(),
    })
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

  const container = await getContainer()
  const blob = container.getBlobClient(path)
  const exists = await blob.exists()
  if (!exists) throw new HTTPException(404, { message: "File not found" })

  const props = await blob.getProperties()
  const download = await blob.download()
  if (!download.readableStreamBody) {
    throw new HTTPException(500, { message: "Empty download stream" })
  }

  const filename = path.split("/").pop() ?? "file"
  c.header("Content-Type", props.contentType ?? "application/octet-stream")
  c.header("Content-Length", String(props.contentLength ?? 0))
  c.header(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(filename)}"`,
  )

  return stream(c, async (s) => {
    // Node Readable -> Web ReadableStream for Hono streaming
    const nodeStream = download.readableStreamBody as NodeJS.ReadableStream
    for await (const chunk of nodeStream) {
      await s.write(chunk as Uint8Array)
    }
  })
})

/**
 * PATCH /api/files/rename
 * Rename or move a file by copy-then-delete. Folders are not renamed
 * here; that would require recursing every blob under the prefix.
 */
files.patch("/rename", zValidator("json", renameBody), async (c) => {
  const { from, to } = c.req.valid("json")
  const src = normalizePath(from)
  const dst = normalizePath(to)
  if (!src || !dst) throw new HTTPException(400, { message: "Invalid paths" })
  if (src === dst) return c.json({ path: dst })

  const container = await getContainer()
  const source = container.getBlobClient(src)
  const target = container.getBlobClient(dst)

  if (!(await source.exists())) {
    throw new HTTPException(404, { message: "Source file not found" })
  }

  const poller = await target.beginCopyFromURL(source.url)
  await poller.pollUntilDone()
  await source.delete()

  return c.json({ path: dst })
})

/**
 * DELETE /api/files
 * Delete a single file, or a folder and everything inside it.
 */
files.delete("/", zValidator("json", deleteBody), async (c) => {
  const { path, isFolder } = c.req.valid("json")
  const norm = normalizePath(path)
  if (!norm) throw new HTTPException(400, { message: "Path is required" })

  const container = await getContainer()

  if (!isFolder) {
    const blob = container.getBlobClient(norm)
    if (!(await blob.exists())) {
      throw new HTTPException(404, { message: "File not found" })
    }
    await blob.delete()
    return c.json({ deleted: 1 })
  }

  let deleted = 0
  const prefix = toPrefix(norm)
  for await (const item of container.listBlobsFlat({ prefix })) {
    await container.deleteBlob(item.name)
    deleted++
  }
  return c.json({ deleted })
})

export default files
