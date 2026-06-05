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

/**
 * Map a backend (Cosmos / Azure Storage) error onto an HTTPException.
 *
 * Throttling errors (Cosmos `code: 429`, Azure `statusCode: 429`)
 * surface as 429 with:
 *   - a distinguishable message ("Backend throttled") so it can be
 *     told apart from middleware-layer 429s in logs and SDK errors
 *   - a `Retry-After` header so SDK callers back off rather than
 *     hammering the emulator/service into a deeper hole
 *
 * Cosmos rejections sometimes carry `retryAfterInMs`; fall back to a
 * conservative 5s when missing. Anything else becomes a 500 with the
 * original message preserved for debugging. `HTTPException`s from
 * inner code are passed through untouched.
 */
function rethrowBackendError(err: unknown, contextMessage: string): never {
  if (err instanceof HTTPException) throw err
  const e = err as { code?: number; statusCode?: number; retryAfterInMs?: number }
  const code = e?.code ?? e?.statusCode
  if (code === 429) {
    const retryAfterSec = Math.max(1, Math.ceil((e.retryAfterInMs ?? 5000) / 1000))
    throw new HTTPException(429, {
      message: "Backend throttled",
      res: new Response(
        JSON.stringify({ error: "Backend throttled" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSec),
          },
        },
      ),
    })
  }
  const detail = err instanceof Error ? err.message : String(err)
  throw new HTTPException(500, { message: `${contextMessage}: ${detail}` })
}

export class FilesService {
  async list(
    parentId: string | null,
    ownerId: string,
    opts: { cursor?: string; pageSize?: number } = {},
  ): Promise<{ entries: VaultEntry[]; cursor: string | null }> {
    const pageSize = opts.pageSize ?? 100
    const iterator = db.items.query(
      {
        query:
          "SELECT * FROM c WHERE (c.type = @fileType OR c.type = @folderType) AND c.parentId = @parentId AND c.deletedAt = null AND (c.ownerId = @ownerId OR c.ownerId = null)",
        parameters: [
          { name: "@fileType", value: "file" },
          { name: "@folderType", value: "folder" },
          { name: "@parentId", value: parentId ?? null },
          { name: "@ownerId", value: ownerId },
        ],
      },
      { maxItemCount: pageSize, continuationToken: opts.cursor },
    )

    const resources: any[] = []
    let continuationToken: string | undefined
    while (resources.length < pageSize) {
      const segment = await iterator.fetchNext()
      resources.push(...segment.resources)
      continuationToken = segment.continuationToken ?? undefined
      if (!continuationToken) break
    }

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
      return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" })
    })

    return { entries, cursor: continuationToken ?? null }
  }

  async search(
    ownerId: string,
    q: string,
    opts: { type?: "file" | "folder"; cursor?: string; pageSize?: number } = {},
  ): Promise<{ entries: VaultEntry[]; cursor: string | null }> {
    const pageSize = opts.pageSize ?? 50
    const params: { name: string; value: string }[] = [
      { name: "@fileType", value: "file" },
      { name: "@folderType", value: "folder" },
      { name: "@ownerId", value: ownerId },
      { name: "@q", value: q },
    ]
    let typeClause = ""
    if (opts.type) {
      typeClause = " AND c.type = @type"
      params.push({ name: "@type", value: opts.type })
    }

    const iterator = db.items.query(
      {
        // Scope to file/folder docs (parameterized — cosmium drops literal
        // string equality) so non-file docs without a `name` can't slip into
        // CONTAINS(LOWER(c.name), …) or the result set.
        query: `SELECT * FROM c WHERE (c.type = @fileType OR c.type = @folderType) AND (c.ownerId = @ownerId OR c.ownerId = null) AND c.deletedAt = null AND CONTAINS(LOWER(c.name), LOWER(@q))${typeClause}`,
        parameters: params,
      },
      { maxItemCount: pageSize, continuationToken: opts.cursor },
    )

    const resources: any[] = []
    let continuationToken: string | undefined
    while (resources.length < pageSize) {
      const segment = await iterator.fetchNext()
      resources.push(...segment.resources)
      continuationToken = segment.continuationToken ?? undefined
      if (!continuationToken) break
      if (resources.length >= pageSize) break
    }

    const entries: VaultEntry[] = resources.slice(0, pageSize).map((r: any) => ({
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

    return { entries, cursor: continuationToken ?? null }
  }

  async createFolder(
    parentId: string | null,
    name: string,
    ownerId: string,
  ): Promise<{ id: string }> {
    if (!isSafeName(name)) throw new HTTPException(400, { message: "Invalid folder name" })

    const id = uuidv4()
    const createdAt = new Date().toISOString()

    try {
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
    } catch (err) {
      rethrowBackendError(err, `Create folder failed for ${name}`)
    }

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
        rethrowBackendError(err, `Upload failed for ${file.name}`)
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
    try {
      await db.item(id).replace({ ...resource, name, modifiedAt: new Date().toISOString() })
    } catch (err) {
      rethrowBackendError(err, `Rename failed for ${id}`)
    }
  }

  async move(id: string, parentId: string | null, ownerId: string): Promise<void> {
    const { resource } = await db.item(id).read()
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)
    if (resource.parentId === parentId) return
    try {
      await db.item(id).replace({ ...resource, parentId, modifiedAt: new Date().toISOString() })
    } catch (err) {
      rethrowBackendError(err, `Move failed for ${id}`)
    }
  }

  async delete(id: string, ownerId: string): Promise<{ deleted: number }> {
    const store = await getBlobStore()
    const { resource } = await db.item(id).read()
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)

    try {
      if (resource.type === "folder") {
        const { resources } = await db.items.query({
          query: "SELECT * FROM c WHERE c.parentId = @parentId",
          parameters: [{ name: "@parentId", value: id }],
        }).fetchAll()
        let deletedCount = 0
        for (const r of resources) {
          if (r.blobName && (await store.exists(r.blobName))) {
            await store.delete(r.blobName)
          }
          await db.item(r.id).delete()
          deletedCount++
        }
        await db.item(id).delete()
        return { deleted: deletedCount + 1 }
      }

      if (resource.blobName && (await store.exists(resource.blobName))) {
        await store.delete(resource.blobName)
      }
      await db.item(id).delete()
      return { deleted: 1 }
    } catch (err) {
      rethrowBackendError(err, `Delete failed for ${id}`)
    }
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
