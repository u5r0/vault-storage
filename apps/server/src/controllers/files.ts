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
  UploadUrlBody,
  UploadCompleteBody,
  DownloadUrlQuery,
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

files.get("/all", userRateLimit(readLimiter), async (c) => {
  const ownerId = (c as any).get("userId") as string
  const { entries, truncated } = await filesService.listAll(ownerId)
  return c.json({ entries, truncated })
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

/**
 * Mint a presigned GET URL so the browser can fetch the blob directly
 * from object storage (zero egress through this server). Auth happens here;
 * the URL itself is short-lived (15 min) and unauthenticated.
 */
files.get(
  "/download-url",
  userRateLimit(readLimiter),
  zValidator("query", DownloadUrlQuery),
  async (c) => {
    const { id } = c.req.valid("query")
    const ownerId = (c as any).get("userId") as string
    const { url, expiresAt } = await filesService.createDownloadUrl(id, ownerId)
    return c.json({ url, expiresAt: expiresAt.toISOString() })
  },
)

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

/**
 * Step 1 of browser-direct upload — mints a presigned PUT URL bound to a
 * server-generated blob key. No Cosmos write happens here; the entry is
 * recorded by `/upload-complete` after the client successfully PUTs.
 *
 * Charges the write limiter so this can't be abused as an oracle.
 */
files.post(
  "/upload-url",
  userRateLimit(writeLimiter),
  zValidator("json", UploadUrlBody),
  async (c) => {
    const { parentId, name, contentType, size } = c.req.valid("json")
    const ownerId = (c as any).get("userId") as string
    const { blobName, uploadUrl, expiresAt, requiredHeaders } =
      await filesService.createUploadUrl(parentId ?? null, name, contentType, size, ownerId)
    return c.json(
      {
        blobName,
        uploadUrl,
        expiresAt: expiresAt.toISOString(),
        requiredHeaders,
      },
      201,
    )
  },
)

/**
 * Step 2 of browser-direct upload — verifies the blob is in storage,
 * checks its actual size against the per-file limit, and creates the
 * Cosmos entry. Idempotent on `blobName`.
 *
 * Charges the volumetric limiter by actual size so direct uploads are
 * accounted for the same as proxied uploads.
 */
files.post(
  "/upload-complete",
  userRateLimit(writeLimiter),
  zValidator("json", UploadCompleteBody),
  async (c) => {
    const { blobName, parentId, name, contentType } = c.req.valid("json")
    const ownerId = (c as any).get("userId") as string
    const entry = await filesService.completeUpload(
      blobName,
      parentId ?? null,
      name,
      contentType,
      ownerId,
    )

    if (entry.size > 0) {
      const reject = await consumeUserPoints(volumetricLimiter, c, entry.size)
      if (reject) return reject
    }

    return c.json({ entry }, 201)
  },
)

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
