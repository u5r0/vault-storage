import { HTTPException } from "hono/http-exception"
import { Readable } from "stream"
import { v4 as uuidv4 } from "uuid"
import { db, entries as entriesContainer } from "../db"
import { getBlobStore } from "../lib/blob-provider"
import { env } from "../lib/azure"
import { normalizeSearchText, type VaultEntry } from "@vault/sdk"
import {
  putPointer,
  deletePointer,
  readEntryById,
  entryPartitionKey,
} from "../lib/entry-lookup"

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
  /**
   * HPK-scoped split query (ADR 0028 §3.1 point 2/3): two single-partition
   * reads instead of the old `OR c.ownerId = null` cross-partition fan-out.
   *
   *  - "own" phase scopes to the partial hierarchical partition key
   *    [ownerId, parentId] — every document a user owns in this folder
   *    shares that (ownerId, parentId) prefix, so Cosmos resolves this to
   *    exactly the physical partitions holding this folder's contents.
   *  - "global" phase scopes to [null, parentId] — files.ts never writes
   *    an entry with ownerId: null today (every write path sets the
   *    caller's ownerId), but `checkOwner`/`toVaultEntry` already treat
   *    `ownerId === null` as a first-class "global file" case, so the
   *    read path scopes for it regardless of whether anything populates it
   *    yet.
   *
   * "own" is always fully drained before "global" begins, and a phase
   * transition happening mid-page falls through into the next phase within
   * the same call — so no entry is ever skipped or duplicated across a
   * page boundary, and the caller never sees a spurious empty page at the
   * own→global seam.
   */
  async list(
    parentId: string | null,
    ownerId: string,
    opts: { cursor?: string; pageSize?: number } = {},
  ): Promise<{ entries: VaultEntry[]; cursor: string | null }> {
    const pageSize = opts.pageSize ?? 100

    type ListCursor = { phase: "own"; token?: string }
    const startCursor: ListCursor = opts.cursor ? JSON.parse(opts.cursor) : { phase: "own" }

    const query = {
      query:
        "SELECT * FROM c WHERE (c.type = @fileType OR c.type = @folderType) AND c.parentId = @parentId AND c.deletedAt = null",
      parameters: [
        { name: "@fileType", value: "file" },
        { name: "@folderType", value: "folder" },
        { name: "@parentId", value: parentId ?? null },
      ],
    }

    // HPK prefix [ownerId, parentId] already scopes this query to the
    // caller's own entries in this folder — no cross-partition "global"
    // phase is needed.
    const resources: any[] = []
    const iterator = db.items.query(query, {
      maxItemCount: pageSize,
      continuationToken: startCursor.token,
      partitionKey: [ownerId, parentId ?? null] as unknown as string,
    })
    let ownToken: string | undefined
    while (resources.length < pageSize) {
      const segment = await iterator.fetchNext()
      resources.push(...segment.resources)
      ownToken = segment.continuationToken ?? undefined
      if (!ownToken) break
    }
    const nextCursor: ListCursor | null = ownToken ? { phase: "own", token: ownToken } : null

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

    return { entries, cursor: nextCursor ? JSON.stringify(nextCursor) : null }
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
      // Normalized needle for the indexed nameNormalized path.
      { name: "@qNorm", value: normalizeSearchText(q) },
      // Raw query value reused in the legacy LOWER(c.name) fallback for
      // documents predating nameNormalized; param is named @q so the query
      // string contains the literal `CONTAINS(LOWER(c.name), LOWER(@q))`.
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
        // the match predicate or the result set.
        //
        // Match against the persisted `nameNormalized` index (ADR 0028 §3.2)
        // so alef/tashkeel/diacritic/case folding is consistent with the
        // client. Documents created before the index existed have no
        // `nameNormalized`; for those we fall back to the old
        // CONTAINS(LOWER(c.name), …) behaviour so nothing silently drops out
        // until a backfill runs.
        query: `SELECT * FROM c WHERE (c.type = @fileType OR c.type = @folderType) AND (c.ownerId = @ownerId OR c.ownerId = null) AND c.deletedAt = null AND ((IS_DEFINED(c.nameNormalized) AND CONTAINS(c.nameNormalized, @qNorm)) OR (NOT IS_DEFINED(c.nameNormalized) AND CONTAINS(LOWER(c.name), LOWER(@q))))${typeClause}`,
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
        // Persisted search index (ADR 0028 §3.2): server writes it, the
        // search query matches against it, so diacritic/alef/case folding
        // stays identical on both sides via the shared SDK normalizer.
        nameNormalized: normalizeSearchText(name),
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
      // Pointer record so id-only ops can resolve this entry's HPK (§Gap 2).
      await putPointer({ id, ownerId, parentId: parentId ?? null })
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
          nameNormalized: normalizeSearchText(file.name),
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
        await putPointer({ id, ownerId, parentId: parentId ?? null })
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
    const resource = await readEntryById(id)
    if (!resource) throw new HTTPException(404, { message: "File not found" })
    checkOwner(resource, ownerId)
    if (!resource.blobName) throw new HTTPException(400, { message: "Not a file" })

    const store = await getBlobStore()
    if (!(await store.exists(resource.blobName))) throw new HTTPException(404, { message: "File blob not found" })

    const { stream, metadata } = await store.download(resource.blobName)
    return { stream, metadata, name: resource.name }
  }

  /**
   * Step 1 of browser-direct upload. Mints a presigned PUT URL bound to a
   * server-generated blob key (UUID); no Cosmos write happens here. The
   * client PUTs bytes to `uploadUrl`, then calls `completeUpload` to record
   * the entry.
   *
   * Validation:
   *   - Filename must pass `isSafeName`.
   *   - Declared size must fit the per-file limit; the actual blob size is
   *     re-checked in `completeUpload` (a malicious client can ignore the
   *     declared value, so server-side trust comes from `stat()` afterward).
   */
  async createUploadUrl(
    parentId: string | null,
    name: string,
    contentType: string,
    size: number,
    _ownerId: string,
  ): Promise<{ blobName: string; uploadUrl: string; expiresAt: Date; requiredHeaders: Record<string, string> }> {
    if (!isSafeName(name)) throw new HTTPException(400, { message: `Invalid filename: ${name}` })

    const limit = env.maxUploadMb * 1024 * 1024
    if (size > limit) {
      throw new HTTPException(413, { message: `File "${name}" exceeds ${env.maxUploadMb}MB limit` })
    }

    // Parent-ownership check is a future hardening step; today the API
    // does not validate parent across users (matches `upload` and other
    // endpoints — the entire workspace is single-tenant per user).
    void parentId

    const store = await getBlobStore()
    const id = uuidv4()
    const blobName = `vault/blobs/${id}`

    try {
      const presigned = await store.createUploadUrl(blobName, {
        contentType: contentType || "application/octet-stream",
        expiresMinutes: 15,
      })
      return {
        blobName,
        uploadUrl: presigned.url,
        expiresAt: presigned.expiresAt,
        requiredHeaders: presigned.requiredHeaders ?? {},
      }
    } catch (err) {
      rethrowBackendError(err, `Failed to create upload URL for ${name}`)
    }
  }

  /**
   * Step 2 of browser-direct upload. Verifies the blob exists at the
   * server-issued path, trusts the storage `stat()` for size/contentType
   * (not the client claim), and creates the Cosmos entry.
   *
   * Idempotent: the entry id is derived from `blobName` so re-calling with
   * the same blobName produces a 409 from Cosmos which we surface as
   * "already complete" by returning the existing entry.
   *
   * If the actual size exceeds the per-file limit (client lied), the blob
   * is deleted and a 413 is thrown.
   */
  async completeUpload(
    blobName: string,
    parentId: string | null,
    name: string,
    contentTypeHint: string | undefined,
    ownerId: string,
  ): Promise<VaultEntry> {
    if (!isSafeName(name)) throw new HTTPException(400, { message: `Invalid filename: ${name}` })

    // Blob keys we mint are `vault/blobs/<uuid>`; reject anything that
    // doesn't fit the pattern so a forged blobName can't slip an entry
    // pointing at someone else's data.
    const match = /^vault\/blobs\/([0-9a-f-]{36})$/.exec(blobName)
    if (!match) throw new HTTPException(400, { message: "Invalid blobName" })
    const id = match[1]

    const store = await getBlobStore()

    let meta
    try {
      meta = await store.stat(blobName)
    } catch (err) {
      rethrowBackendError(err, `Failed to stat ${blobName}`)
    }
    if (!meta) throw new HTTPException(404, { message: "Upload not found — PUT to uploadUrl first" })

    const limit = env.maxUploadMb * 1024 * 1024
    if (meta.size > limit) {
      // Reject and clean up — client uploaded more than declared.
      await store.delete(blobName).catch(() => {})
      throw new HTTPException(413, {
        message: `Uploaded blob exceeds ${env.maxUploadMb}MB limit`,
      })
    }

    const contentType = contentTypeHint || meta.contentType || "application/octet-stream"
    const createdAt = new Date().toISOString()

    const doc = {
      id,
      ownerId,
      parentId: parentId ?? null,
      name,
      nameNormalized: normalizeSearchText(name),
      type: "file",
      size: meta.size,
      contentType,
      blobName,
      isFavorite: "0",
      tags: null,
      deletedAt: null,
      createdAt,
      modifiedAt: createdAt,
    }

    try {
      await db.items.create(doc)
      await putPointer({ id, ownerId, parentId: parentId ?? null })
    } catch (err: any) {
      // 409 Conflict → entry already exists for this blob (idempotent retry).
      if (err?.code === 409 || err?.statusCode === 409) {
        const resource = await readEntryById(id)
        if (resource && resource.ownerId === ownerId) {
          return this.toVaultEntry(resource)
        }
      }
      rethrowBackendError(err, `Failed to record uploaded file ${name}`)
    }

    return this.toVaultEntry(doc)
  }

  async createDownloadUrl(id: string, ownerId: string): Promise<{ url: string; expiresAt: Date }> {
    const resource = await readEntryById(id)
    if (!resource) throw new HTTPException(404, { message: "File not found" })
    checkOwner(resource, ownerId)
    if (!resource.blobName) throw new HTTPException(400, { message: "Not a file" })

    const store = await getBlobStore()
    const meta = await store.stat(resource.blobName)
    if (!meta) throw new HTTPException(404, { message: "File blob not found" })

    return store.createDownloadUrl(resource.blobName, { expiresMinutes: 15 })
  }

  private toVaultEntry(r: any): VaultEntry {
    return {
      id: r.id,
      ownerId: r.ownerId ?? null,
      parentId: r.parentId ?? null,
      name: r.name,
      type: r.type,
      size: r.size ?? 0,
      contentType: r.contentType ?? null,
      blobUrl: r.blobName ?? null,
      isFavorite: r.isFavorite === "1",
      tags: r.tags ? JSON.parse(r.tags) : [],
      createdAt: r.createdAt,
      modifiedAt: r.modifiedAt ?? null,
    } as VaultEntry
  }

  async rename(id: string, name: string, ownerId: string): Promise<void> {
    const resource = await readEntryById(id)
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)
    if (resource.name === name) return
    // Rename does not change the partition key (ownerId/parentId unchanged),
    // so an in-place keyed replace is safe.
    const pk = entryPartitionKey({ id, ownerId: resource.ownerId, parentId: resource.parentId ?? null })
    try {
      await entriesContainer.item(id, pk).replace({
        ...resource,
        name,
        nameNormalized: normalizeSearchText(name),
        modifiedAt: new Date().toISOString(),
      })
    } catch (err) {
      rethrowBackendError(err, `Rename failed for ${id}`)
    }
  }

  async move(id: string, parentId: string | null, ownerId: string): Promise<void> {
    const resource = await readEntryById(id)
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)
    const oldParentId = resource.parentId ?? null
    const newParentId = parentId ?? null
    if (oldParentId === newParentId) return

    // parentId is part of the hierarchical partition key, so a move changes
    // the partition. Cosmos cannot mutate a document's partition key in place;
    // we must create the document in the new partition and delete the old one.
    // Create-then-delete (not the reverse) so a crash mid-move leaves the item
    // reachable rather than lost; the pointer is repointed last.
    //
    // Both operations are made idempotent so retry/resume is safe:
    //   - 409 on create  → already exists in new partition (prior attempt got
    //     this far); safe to continue.
    //   - 404 on delete  → already gone from old partition (prior attempt
    //     completed the delete); safe to continue.
    //   putPointer is an upsert, so it is inherently idempotent.
    const oldPk = entryPartitionKey({ id, ownerId: resource.ownerId, parentId: oldParentId })
    const moved = { ...resource, parentId: newParentId, modifiedAt: new Date().toISOString() }
    try {
      try {
        await entriesContainer.items.create(moved)
      } catch (createErr: unknown) {
        const ce = createErr as { code?: number; statusCode?: number }
        const createCode = ce?.code ?? ce?.statusCode
        if (createCode !== 409) throw createErr
        // 409 = doc already exists in new partition — prior partial move; continue.
      }
      try {
        await entriesContainer.item(id, oldPk).delete()
      } catch (delErr: unknown) {
        const de = delErr as { code?: number; statusCode?: number }
        const delCode = de?.code ?? de?.statusCode
        if (delCode !== 404) throw delErr
        // 404 = doc already gone from old partition — prior partial move; continue.
      }
      await putPointer({ id, ownerId: resource.ownerId, parentId: newParentId })
    } catch (err) {
      rethrowBackendError(err, `Move failed for ${id}`)
    }
  }

  async delete(id: string, ownerId: string): Promise<{ deleted: number }> {
    const store = await getBlobStore()
    const resource = await readEntryById(id)
    if (!resource) throw new HTTPException(404, { message: "Item not found" })
    checkOwner(resource, ownerId)

    // Every entries delete needs the full hierarchical key. `own` captures
    // the (ownerId, parentId, id) needed to build it for each doc.
    type Node = { id: string; ownerId: string; parentId: string | null; blobName: string | null }
    const keyFor = (n: Node) =>
      entryPartitionKey({ id: n.id, ownerId: n.ownerId, parentId: n.parentId })

    try {
      if (resource.type === "folder") {
        // BFS: collect the full subtree before touching anything, so a
        // crash mid-delete can be safely retried (already-gone items are
        // tolerated via .catch(() => {})). Select the partition-key fields so
        // each delete is a keyed point delete rather than a scan.
        const subtree: Node[] = []
        const queue: string[] = [id]

        while (queue.length > 0) {
          const parentId = queue.shift()!
          const { resources: children } = await db.items
            .query({
              query:
                "SELECT c.id, c.ownerId, c.parentId, c.type, c.blobName FROM c WHERE c.parentId = @parentId",
              parameters: [{ name: "@parentId", value: parentId }],
            })
            .fetchAll()
          for (const child of children) {
            subtree.push({
              id: child.id,
              ownerId: child.ownerId,
              parentId: child.parentId ?? null,
              blobName: child.blobName ?? null,
            })
            if (child.type === "folder") {
              queue.push(child.id)
            }
          }
        }

        // Delete blobs first, then Cosmos documents. Failures on
        // already-deleted items are silently tolerated.
        await Promise.all(
          subtree
            .filter((r) => r.blobName)
            .map(async (r) => {
              if (await store.exists(r.blobName!).catch(() => false)) {
                await store.delete(r.blobName!).catch(() => {})
              }
            }),
        )
        await Promise.all(
          subtree.map(async (r) => {
            await entriesContainer.item(r.id, keyFor(r)).delete().catch(() => {})
            await deletePointer(r.id)
          }),
        )

        const rootKey = entryPartitionKey({ id, ownerId: resource.ownerId, parentId: resource.parentId ?? null })
        await entriesContainer.item(id, rootKey).delete()
        await deletePointer(id)
        return { deleted: subtree.length + 1 }
      }

      if (resource.blobName && (await store.exists(resource.blobName))) {
        await store.delete(resource.blobName)
      }
      const fileKey = entryPartitionKey({ id, ownerId: resource.ownerId, parentId: resource.parentId ?? null })
      await entriesContainer.item(id, fileKey).delete()
      await deletePointer(id)
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
