import { Hono } from "hono"
import { stream } from "hono/streaming"
import { zValidator } from "@hono/zod-validator"
import { authenticate } from "../middleware/authenticate"
import { userRateLimit } from "../middleware/rate-limit"
import { createUserRequestLimiter, createVolumetricLimiter } from "../lib/rate-limiter"
import {
  ListFilesQuery,
  CreateFolderBody,
  RenameBody,
  MoveBody,
  DeleteBody,
} from "@vault/sdk"
import { filesService } from "../services/files"

const userLimiter       = createUserRequestLimiter()
const volumetricLimiter = createVolumetricLimiter()

const files = new Hono()

files.use("*", authenticate())
files.use("*", userRateLimit(userLimiter))

files.get("/", zValidator("query", ListFilesQuery), async (c) => {
  const { entityId } = c.req.valid("query")
  const ownerId = (c as any).get("userId") as string
  const entries = await filesService.list(entityId ?? null, ownerId)
  return c.json({ entityId: entityId ?? null, entries })
})

files.post("/folder", zValidator("json", CreateFolderBody), async (c) => {
  const { parentId, name } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  const { id } = await filesService.createFolder(parentId ?? null, name, ownerId)
  return c.json({ id, parentId: parentId ?? null, type: "folder" }, 201)
})

files.post("/upload", userRateLimit(volumetricLimiter), async (c) => {
  const form = await c.req.parseBody({ all: true })
  const parentId = typeof form.parentId === "string" ? form.parentId : null
  const ownerId = (c as any).get("userId") as string
  const raw = form.files
  const list: File[] = Array.isArray(raw)
    ? (raw.filter((f) => f instanceof File) as File[])
    : raw instanceof File
      ? [raw]
      : []
  const uploaded = await filesService.upload(list, parentId, ownerId)
  return c.json({ uploaded }, 201)
})

files.get("/download", async (c) => {
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

files.patch("/rename", zValidator("json", RenameBody), async (c) => {
  const { id, name } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  await filesService.rename(id, name, ownerId)
  return c.json({ id, name })
})

files.patch("/move", zValidator("json", MoveBody), async (c) => {
  const { id, parentId } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  await filesService.move(id, parentId ?? null, ownerId)
  return c.json({ id, parentId })
})

files.delete("/", zValidator("json", DeleteBody), async (c) => {
  const { id } = c.req.valid("json")
  const ownerId = (c as any).get("userId") as string
  const result = await filesService.delete(id, ownerId)
  return c.json(result)
})

files.get("/quick-links", async (c) => {
  const ownerId = (c as any).get("userId") as string
  const counts = await filesService.quickLinks(ownerId)
  return c.json(counts)
})

export default files
