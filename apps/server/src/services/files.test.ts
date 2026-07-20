import { describe, it, expect, vi, beforeEach } from "vitest"
import { HTTPException } from "hono/http-exception"
import { filesService } from "./files"

vi.mock("../db", () => {
  // db === entries (same container proxy). Tests mock db.* by convention so
  // db and entries must share the same vi.fn() instances. files.ts never
  // touches the auth container, so it is not modeled here.
  const sharedItems = { query: vi.fn(), create: vi.fn() }
  const sharedItem = vi.fn()
  const entriesContainer = { items: sharedItems, item: sharedItem }
  return {
    db: entriesContainer,
    entries: entriesContainer,
    // lookup backs entry-lookup.ts (resolvePointer / putPointer / deletePointer).
    // Default read() → null so readEntryById falls back to the db.item() scan
    // that the id-based backend-mapping tests (rename/move/delete) mock.
    lookup: {
      items: { upsert: vi.fn() },
      item: vi.fn().mockReturnValue({
        read: vi.fn().mockResolvedValue({ resource: null }),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    },
  }
})

vi.mock("../lib/azure", () => ({
  env: { maxUploadMb: 100 },
}))

vi.mock("../lib/blob-provider", () => ({
  getBlobStore: vi.fn(),
}))

/**
 * ADR 0025 §Decision #2: structural assertions that pinned SQL text, parameter
 * bindings, and collaborator calls (createFolder/list/search/delete/quickLinks
 * shape) were removed — the same intentions are covered behaviorally by the
 * controller integration tier (controllers/files.test.ts: upload→list
 * round-trip, rename, cross-partition move, subtree delete, owner isolation).
 *
 * What remains is the logic the integration tier cannot reach deterministically
 * against a single-partition emulator, kept as returned-value / status / header
 * assertions:
 *  - list/search draining across empty cross-partition segments, and
 *  - backend 429 → Retry-After mapping.
 */
describe("FilesService", () => {
  const ownerId = "00000000-0000-0000-0000-000000000001"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("list", () => {
    /**
     * Regression: cross-partition Cosmos queries return one segment per
     * physical partition, including empty segments with non-null
     * continuation tokens. Calling `fetchNext()` once and returning the
     * result makes folders look empty when the first physical partition
     * has no matches — even though further `fetchNext()` calls would
     * have produced documents. Drain until the page is full or the
     * iterator is exhausted.
     */
    it("drains across empty partition segments to fill the page", async () => {
      const { db } = await import("../db")

      const fetchNext = vi
        .fn()
        // Empty segment, but Cosmos still hands back a continuation
        // token because more partitions remain.
        .mockResolvedValueOnce({ resources: [], continuationToken: "p2" })
        // Empty again — common with sparse partitions.
        .mockResolvedValueOnce({ resources: [], continuationToken: "p3" })
        // Real data on the third segment.
        .mockResolvedValueOnce({
          resources: [
            { id: "a", ownerId, parentId: null, name: "a.txt", type: "file" },
            { id: "b", ownerId, parentId: null, name: "b.txt", type: "file" },
          ],
          continuationToken: undefined,
        })

      vi.mocked(db.items.query).mockReturnValue({ fetchNext } as any)

      const result = await filesService.list(null, ownerId)

      expect(fetchNext).toHaveBeenCalledTimes(3)
      expect(result.entries.map((e) => e.name)).toEqual(["a.txt", "b.txt"])
      expect(result.cursor).toBe(null)
    })

    it("stops draining once the page is full and returns the cursor", async () => {
      const { db } = await import("../db")

      const fetchNext = vi
        .fn()
        .mockResolvedValueOnce({ resources: [], continuationToken: "p2" })
        .mockResolvedValueOnce({
          resources: [
            { id: "a", ownerId, parentId: null, name: "a", type: "file" },
            { id: "b", ownerId, parentId: null, name: "b", type: "file" },
          ],
          continuationToken: "p3",
        })

      vi.mocked(db.items.query).mockReturnValue({ fetchNext } as any)

      const result = await filesService.list(null, ownerId, { pageSize: 2 })

      // Two segments fetched; the second one filled the page so we stopped.
      expect(fetchNext).toHaveBeenCalledTimes(2)
      expect(result.entries).toHaveLength(2)
      expect(result.cursor).toBe(JSON.stringify({ phase: "own", token: "p3" }))
    })
  })

  describe("search", () => {
    it("drains across empty partition segments to fill the page", async () => {
      const { db } = await import("../db")
      const fetchNext = vi
        .fn()
        .mockResolvedValueOnce({ resources: [], continuationToken: "p2" })
        .mockResolvedValueOnce({
          resources: [
            { id: "f1", ownerId, parentId: null, name: "report.txt", type: "file" },
          ],
          continuationToken: undefined,
        })
      vi.mocked(db.items.query).mockReturnValue({ fetchNext } as any)

      const result = await filesService.search(ownerId, "rep")

      expect(fetchNext).toHaveBeenCalledTimes(2)
      expect(result.entries).toHaveLength(1)
      expect(result.cursor).toBe(null)
    })
  })

  /**
   * Backend errors from Cosmos / Azure Storage must surface as the right
   * HTTP status. 429 from the storage layer becomes a 429 to the client so
   * SDK-level retry logic and `Retry-After` headers actually work; other
   * unknown failures stay 500. These tests pin the behavior in place — see
   * the `rethrowBackendError` helper in services/files.ts.
   */
  describe("backend error mapping", () => {
    function makeCosmosError(code: number, message = "throttle") {
      const err = new Error(message) as Error & { code?: number }
      err.code = code
      return err
    }

    it("createFolder: Cosmos 429 → HTTPException 429 with Retry-After", async () => {
      const { db } = await import("../db")
      vi.mocked(db.items.create).mockRejectedValue(makeCosmosError(429))
      const err = await filesService
        .createFolder(null, "Pictures", ownerId)
        .catch((e) => e as HTTPException)
      expect(err.status).toBe(429)
      // "Backend throttled" is the distinguishing message for backend-layer
      // 429s — middleware-layer 429s use "Too many requests" so logs and
      // SDK callers can tell them apart at a glance.
      expect(err.message).toBe("Backend throttled")
      expect(err.res?.headers.get("Retry-After")).toBeTruthy()
    })

    it("createFolder: Cosmos 429 with retryAfterInMs honored on Retry-After", async () => {
      const { db } = await import("../db")
      const e = new Error("throttle") as Error & {
        code?: number
        retryAfterInMs?: number
      }
      e.code = 429
      e.retryAfterInMs = 7_500 // → 8 seconds (Math.ceil)
      vi.mocked(db.items.create).mockRejectedValue(e)
      const err = await filesService
        .createFolder(null, "Pictures", ownerId)
        .catch((x) => x as HTTPException)
      expect(err.res?.headers.get("Retry-After")).toBe("8")
    })

    it("createFolder: unknown failure → HTTPException 500 with detail", async () => {
      const { db } = await import("../db")
      vi.mocked(db.items.create).mockRejectedValue(new Error("kaboom"))
      await expect(filesService.createFolder(null, "Pictures", ownerId)).rejects.toMatchObject({
        status: 500,
      })
      // Detail is preserved for debugging.
      const err = await filesService
        .createFolder(null, "Pictures2", ownerId)
        .catch((e) => e as HTTPException)
      expect(err.message).toContain("kaboom")
    })

    it("upload: Cosmos 429 from items.create → HTTPException 429", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/blob-provider")

      vi.mocked(getBlobStore).mockResolvedValue({
        upload: vi.fn().mockResolvedValue(undefined),
        download: vi.fn(),
        delete: vi.fn(),
        exists: vi.fn(),
        list: vi.fn(),
        copy: vi.fn(),
        deletePrefix: vi.fn(),
      } as any)
      vi.mocked(db.items.create).mockRejectedValue(makeCosmosError(429))

      const file = new File(["hello"], "hello.txt", { type: "text/plain" })
      const err = await filesService
        .upload([file], null, ownerId)
        .catch((e) => e as HTTPException)
      expect(err.status).toBe(429)
      expect(err.message).toBe("Backend throttled")
    })

    it("upload: blob 429 (statusCode) → HTTPException 429", async () => {
      const { getBlobStore } = await import("../lib/blob-provider")
      const blobErr = new Error("throttled") as Error & { statusCode?: number }
      blobErr.statusCode = 429
      vi.mocked(getBlobStore).mockResolvedValue({
        upload: vi.fn().mockRejectedValue(blobErr),
        download: vi.fn(),
        delete: vi.fn(),
        exists: vi.fn(),
        list: vi.fn(),
        copy: vi.fn(),
        deletePrefix: vi.fn(),
      } as any)

      const file = new File(["hello"], "hello.txt", { type: "text/plain" })
      await expect(filesService.upload([file], null, ownerId)).rejects.toMatchObject({
        status: 429,
      })
    })

    it("upload: unknown failure → HTTPException 500 mentioning the filename", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/blob-provider")
      vi.mocked(getBlobStore).mockResolvedValue({
        upload: vi.fn().mockResolvedValue(undefined),
        download: vi.fn(),
        delete: vi.fn(),
        exists: vi.fn(),
        list: vi.fn(),
        copy: vi.fn(),
        deletePrefix: vi.fn(),
      } as any)
      vi.mocked(db.items.create).mockRejectedValue(new Error("nope"))

      const file = new File(["hi"], "important.txt", { type: "text/plain" })
      const err = await filesService
        .upload([file], null, ownerId)
        .catch((e) => e as HTTPException)
      expect(err.status).toBe(500)
      expect(err.message).toContain("important.txt")
      expect(err.message).toContain("nope")
    })

    it("rename: Cosmos 429 on replace → HTTPException 429", async () => {
      const { db } = await import("../db")
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "f1", ownerId, name: "old.txt", type: "file" },
        }),
        replace: vi.fn().mockRejectedValue(makeCosmosError(429)),
      } as any)
      await expect(filesService.rename("f1", "new.txt", ownerId)).rejects.toMatchObject({
        status: 429,
      })
    })

    it("move: Cosmos 429 on create → HTTPException 429", async () => {
      // HPK move is create-then-delete (parentId changes the partition key).
      // The 429 comes from db.items.create, not db.item().replace.
      const { db } = await import("../db")
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "f1", ownerId, parentId: null, type: "file" },
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      } as any)
      vi.mocked(db.items.create).mockRejectedValue(makeCosmosError(429))
      await expect(
        filesService.move("f1", "00000000-0000-0000-0000-000000000abc", ownerId),
      ).rejects.toMatchObject({ status: 429 })
    })

    it("delete: Cosmos 429 on delete → HTTPException 429", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/blob-provider")
      vi.mocked(getBlobStore).mockResolvedValue({
        exists: vi.fn().mockResolvedValue(false),
        delete: vi.fn(),
        upload: vi.fn(),
        download: vi.fn(),
        list: vi.fn(),
        copy: vi.fn(),
        deletePrefix: vi.fn(),
      } as any)
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "f1", ownerId, type: "file", blobName: null },
        }),
        delete: vi.fn().mockRejectedValue(makeCosmosError(429)),
      } as any)
      await expect(filesService.delete("f1", ownerId)).rejects.toMatchObject({
        status: 429,
      })
    })

    it("preserves HTTPExceptions thrown from inner code (no double-wrap)", async () => {
      // A rename on a non-existent item already throws HTTPException(404)
      // before reaching the try block. Make sure rethrowBackendError is
      // never invoked on those — i.e. the 404 stays a 404.
      const { db } = await import("../db")
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({ resource: undefined }),
      } as any)
      await expect(filesService.rename("missing", "x", ownerId)).rejects.toMatchObject({
        status: 404,
      })
    })
  })
})
