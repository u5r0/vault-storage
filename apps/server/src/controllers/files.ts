import { Hono } from "hono"
import { stream } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { authenticate } from "../middleware/authenticate"
import { userRateLimit, consumeUserPoints } from "../middleware/rate-limit"
import {
  createUserReadLimiter,
  createUserWriteLimiter,
  createVolumetricLimiter,
} from "../lib/rate-limiter"
import {
  ListFilesQuery,
  SearchFilesQuery,
  CreateFolderBody,
  RenameBody,
  MoveBody,
  DeleteBody,
} from "@vault/sdk"
import { filesService } from "../services/files"

const readLimiter       = createUserReadLimiter()
const writeLimiter      = createUserWriteLimiter()
const volumetricLimiter = createVolumetricLimiter()

const files = new Hono()

files.use("*", authenticate())

// ── Reads ────────────────────────────────────────────────────────────────────
files.get("/", userRateLimit(readLimiter), zValidator("query", ListFilesQuery), async (c) => {
  const { entityId, cursor, pageSize } = c.req.valid("query")
  const ownerId = (c as any).get("userId") as string
  const { entries, cursor: nextCursor } = await filesService.list(
    entityId ?? null,
    ownerId,
    { cursor, pageSize },
  )
  return c.json({ entityId: entityId ?? null, entries, cursor: nextCursor })
})

files.get("/search", userRateLimit(readLimiter), zValidator("query", SearchFilesQuery), async (c) => {
  const { q, type, cursor, pageSize } = c.req.valid("query")
  const ownerId = (c as any).get("userId") as string
  const { entries, cursor: nextCursor } = await filesService.search(ownerId, q, {
    type,
    cursor,
    pageSize,
  })
  return c.json({ entries, cursor: nextCursor })
})

files.get("/download", userRateLimit(readLimiter), async (c) => {
  const id = c.req.query("id")
  if (!id) return c.json({ error: "Missing 'id' query param" }, 400)
  const ownerId = (c as any).get("userId") as string
  const { stream: downloadStream, metadata, name } = await filesService.download(id, ownerId)
  c.header("Content-Type", metadata.contentType ?? "application/octet-stream")
  c.header("Content-Length", String(metadata.size))
  c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`)
  return stream(c, async (s) => {
    for await (const chunk of downloadStream as NodeJS.ReadableStream) {
      await s.write(chunk as Uint8Array)
    }
  })
})

files.get("/quick-links", userRateLimit(readLimiter), async (c) => {
  const ownerId = (c as any).get("userId") as string
  const counts = await filesService.quickLinks(ownerId)
  return c.json(counts)
})

// ── Writes ───────────────────────────────────────────────────────────────────
files.post("/folder", userRateLimit(writeLimiter), zValidator("json", CreateFolderBody), async (c) => {
  const { parentId, name } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  const { id } = await filesService.createFolder(parentId ?? null, name, ownerId)
  return c.json({ id, parentId: parentId ?? null, type: "folder" }, 201)
})

/**
 * Upload charges the per-user write limiter (1 point per call) AND the
 * volumetric limiter by total payload size in bytes. The volumetric
 * charge happens after `parseBody` so we know the actual size; if the
 * user is over budget we 429 *before* persisting anything.
 */
files.post("/upload", userRateLimit(writeLimiter), async (c) => {
  const form = await c.req.parseBody({ all: true })
  const parentId = typeof form.parentId === "string" ? form.parentId : null
  const ownerId = (c as any).get("userId") as string
  const raw = form.files
  const list: File[] = Array.isArray(raw)
    ? (raw.filter((f) => f instanceof File) as File[])
    : raw instanceof File
      ? [raw]
      : []

  const totalBytes = list.reduce((sum, f) => sum + f.size, 0)
  if (totalBytes > 0) {
    const reject = await consumeUserPoints(volumetricLimiter, c, totalBytes)
    if (reject) return reject
  }

  const uploaded = await filesService.upload(list, parentId, ownerId)
  return c.json({ uploaded }, 201)
})

files.patch("/rename", userRateLimit(writeLimiter), zValidator("json", RenameBody), async (c) => {
  const { id, name } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  await filesService.rename(id, name, ownerId)
  return c.json({ id, name })
})

files.patch("/move", userRateLimit(writeLimiter), zValidator("json", MoveBody), async (c) => {
  const { id, parentId } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  await filesService.move(id, parentId ?? null, ownerId)
  return c.json({ id, parentId })
})

files.delete("/", userRateLimit(writeLimiter), zValidator("json", DeleteBody), async (c) => {
  const { id } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  const result = await filesService.delete(id, ownerId)
  return c.json(result)
})

export default files
