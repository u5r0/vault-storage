import { describe, it, expect, vi, beforeEach } from "vitest"
import { HTTPException } from "hono/http-exception"
import { filesService } from "./files"

vi.mock("../db", () => {
  // db === entries (same container proxy). Tests mock db.* by convention so
  // db and entries must share the same vi.fn() instances.
  const sharedItems = { query: vi.fn(), create: vi.fn() }
  const sharedItem = vi.fn()
  const entriesContainer = { items: sharedItems, item: sharedItem }
  return {
    db: entriesContainer,
    entries: entriesContainer,
    // lookup is used by entry-lookup.ts (resolvePointer, putPointer,
    // deletePointer). Default lookup.item().read() returns null so
    // readEntryById falls through to the db.items.query fallback scan —
    // keeping every test that mocks db.item() working unchanged.
    lookup: {
      items: { upsert: vi.fn() },
      item: vi.fn().mockReturnValue({
        read: vi.fn().mockResolvedValue({ resource: null }),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    },
    authContainer: { items: { query: vi.fn(), create: vi.fn() }, item: vi.fn() },
  }
})

vi.mock("../lib/azure", () => ({
  env: { maxUploadMb: 100 },
}))

vi.mock("../lib/blob-provider", () => ({
  getBlobStore: vi.fn(),
}))

describe("FilesService", () => {
  const ownerId = "00000000-0000-0000-0000-000000000001"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("createFolder", () => {
    it("rejects invalid folder names with path separators", async () => {
      await expect(filesService.createFolder(null, "folder/file", ownerId)).rejects.toMatchObject({
        status: 400,
        message: "Invalid folder name",
      })
    })

    it("rejects invalid folder names with backslashes", async () => {
      await expect(filesService.createFolder(null, "folder\\file", ownerId)).rejects.toMatchObject({
        status: 400,
        message: "Invalid folder name",
      })
    })

    it("rejects empty folder names", async () => {
      await expect(filesService.createFolder(null, "", ownerId)).rejects.toMatchObject({
        status: 400,
        message: "Invalid folder name",
      })
    })

    it("rejects '.' folder name", async () => {
      await expect(filesService.createFolder(null, ".", ownerId)).rejects.toMatchObject({
        status: 400,
        message: "Invalid folder name",
      })
    })

    it("creates folder with valid name", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.create).mockResolvedValue({ resource: undefined } as any)

      const result = await filesService.createFolder(null, "Documents", ownerId)

      expect(db.items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Documents",
          type: "folder",
          ownerId,
        })
      )
      expect(result).toHaveProperty("id")
    })
  })

  describe("list", () => {
    it("filters by ownerId and parentId", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchNext: vi.fn().mockResolvedValue({
          resources: [
            { id: "file-1", ownerId, parentId: null, name: "doc.txt", type: "file" },
            { id: "folder-1", ownerId, parentId: null, name: "Folder", type: "folder" },
          ],
          continuationToken: undefined,
        }),
      } as any)

      const result = await filesService.list(null, ownerId)

      // HPK list: no @ownerId param — partition key prefix [ownerId, parentId]
      // scopes the query; only @parentId appears in the SQL params.
      expect(db.items.query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining("c.parentId = @parentId"),
          parameters: expect.arrayContaining([{ name: "@parentId", value: null }]),
        }),
        expect.objectContaining({
          maxItemCount: 100,
          partitionKey: [ownerId, null],
        }),
      )
      expect(result.entries).toHaveLength(2)
      expect(result.cursor).toBe(null)
    })

    it("sorts folders before files, then alphabetically (per page)", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchNext: vi.fn().mockResolvedValue({
          resources: [
            { id: "file-1", ownerId, parentId: null, name: "b.txt", type: "file" },
            { id: "folder-1", ownerId, parentId: null, name: "A", type: "folder" },
            { id: "file-2", ownerId, parentId: null, name: "a.txt", type: "file" },
          ],
          continuationToken: undefined,
        }),
      } as any)

      const result = await filesService.list(null, ownerId)

      expect(result.entries[0].name).toBe("A")
      expect(result.entries[1].name).toBe("a.txt")
      expect(result.entries[2].name).toBe("b.txt")
    })

    it("returns cursor when Cosmos has more pages", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchNext: vi.fn().mockResolvedValue({
          resources: [{ id: "f1", ownerId, parentId: null, name: "x", type: "file" }],
          continuationToken: "next-page-token",
        }),
      } as any)

      const result = await filesService.list(null, ownerId, { pageSize: 1 })
      // Cursor is JSON-encoded { phase, token } so the next call knows which
      // phase to resume and which Cosmos continuation token to pass.
      expect(result.cursor).toBe(JSON.stringify({ phase: "own", token: "next-page-token" }))
    })

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
    it("issues a CONTAINS query scoped to the owner partition", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchNext: vi.fn().mockResolvedValue({
          resources: [
            { id: "file-1", ownerId, parentId: null, name: "report.txt", type: "file" },
          ],
          continuationToken: undefined,
        }),
      } as any)

      const result = await filesService.search(ownerId, "rep")

      expect(db.items.query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining("CONTAINS(LOWER(c.name), LOWER(@q))"),
          parameters: expect.arrayContaining([
            { name: "@ownerId", value: ownerId },
            { name: "@q", value: "rep" },
          ]),
        }),
        expect.objectContaining({ maxItemCount: 50 }),
      )
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].name).toBe("report.txt")
    })

    it("includes a type filter when supplied", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchNext: vi.fn().mockResolvedValue({
          resources: [],
          continuationToken: undefined,
        }),
      } as any)

      await filesService.search(ownerId, "x", { type: "folder" })

      expect(db.items.query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining("c.type = @type"),
          parameters: expect.arrayContaining([{ name: "@type", value: "folder" }]),
        }),
        expect.any(Object),
      )
    })

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

  describe("delete", () => {
    it("deletes file and blob", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/blob-provider")

      const mockStore = {
        exists: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        upload: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue({ stream: null, metadata: {} }),
        copy: vi.fn().mockResolvedValue(undefined),
        deletePrefix: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getBlobStore).mockResolvedValue(mockStore)
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "file-1", ownerId, type: "file", blobName: "vault/blobs/file-1" },
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      } as any)

      const result = await filesService.delete("file-1", ownerId)

      expect(mockStore.delete).toHaveBeenCalledWith("vault/blobs/file-1")
      expect(db.item("file-1").delete).toHaveBeenCalled()
      expect(result).toEqual({ deleted: 1 })
    })

    it("deletes folder and cascades to direct children", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/blob-provider")

      const mockStore = {
        exists: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        upload: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue({ stream: null, metadata: {} }),
        copy: vi.fn().mockResolvedValue(undefined),
        deletePrefix: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getBlobStore).mockResolvedValue(mockStore)

      // BFS: first query returns the two children, second (for child-folder
      // which is type "file") never fires — only type:"folder" children are
      // enqueued.
      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            { id: "child-1", type: "file", blobName: "vault/blobs/child-1" },
            { id: "child-2", type: "file", blobName: null },
          ],
        }),
      } as any)
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "folder-1", ownerId, type: "folder" },
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      } as any)

      const result = await filesService.delete("folder-1", ownerId)

      // folder-1 + child-1 + child-2 = 3
      expect(result.deleted).toBe(3)
      expect(mockStore.delete).toHaveBeenCalledWith("vault/blobs/child-1")
      expect(mockStore.delete).toHaveBeenCalledTimes(1)
    })

    it("recursively deletes nested subfolders and their blobs", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/blob-provider")

      const mockStore = {
        exists: vi.fn().mockResolvedValue(true),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        upload: vi.fn().mockResolvedValue(undefined),
        download: vi.fn().mockResolvedValue({ stream: null, metadata: {} }),
        copy: vi.fn().mockResolvedValue(undefined),
        deletePrefix: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(getBlobStore).mockResolvedValue(mockStore)

      // Tree: root-folder → sub-folder → deep-file
      //                   → root-file
      //
      // BFS order: query("root-folder") → [sub-folder, root-file]
      //            query("sub-folder")  → [deep-file]
      //            query("deep-file")   → never called (type:"file")
      vi.mocked(db.items.query)
        .mockReturnValueOnce({
          // children of root-folder
          fetchAll: vi.fn().mockResolvedValue({
            resources: [
              { id: "sub-folder", type: "folder", blobName: null },
              { id: "root-file", type: "file", blobName: "vault/blobs/root-file" },
            ],
          }),
        } as any)
        .mockReturnValueOnce({
          // children of sub-folder
          fetchAll: vi.fn().mockResolvedValue({
            resources: [
              { id: "deep-file", type: "file", blobName: "vault/blobs/deep-file" },
            ],
          }),
        } as any)

      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "root-folder", ownerId, type: "folder" },
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      } as any)

      const result = await filesService.delete("root-folder", ownerId)

      // root-folder + sub-folder + root-file + deep-file = 4
      expect(result.deleted).toBe(4)
      expect(mockStore.delete).toHaveBeenCalledWith("vault/blobs/root-file")
      expect(mockStore.delete).toHaveBeenCalledWith("vault/blobs/deep-file")
      expect(mockStore.delete).toHaveBeenCalledTimes(2)
    })

    it("throws 403 when ownerId does not match", async () => {
      const { db } = await import("../db")

      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "file-1", ownerId: "other-user-id", type: "file" },
        }),
      } as any)

      await expect(filesService.delete("file-1", ownerId)).rejects.toMatchObject({
        status: 403,
        message: "Forbidden",
      })
    })
  })

  describe("quickLinks", () => {
    it("filters by ownerId", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            { isFavorite: "1", deletedAt: null },
            { modifiedAt: "2024-01-01T00:00:00Z", deletedAt: null },
            { tags: JSON.stringify(["tag1"]), deletedAt: null },
            { deletedAt: "2024-01-01T00:00:00Z" },
          ],
        }),
      } as any)

      const result = await filesService.quickLinks(ownerId)

      expect(db.items.query).toHaveBeenCalledWith({
        query: expect.stringContaining("c.ownerId = @ownerId"),
        parameters: expect.arrayContaining([{ name: "@ownerId", value: ownerId }]),
      })
      expect(result).toHaveProperty("starred")
      expect(result).toHaveProperty("recent")
      expect(result).toHaveProperty("tags")
      expect(result).toHaveProperty("trash")
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

    it("move: Cosmos 429 on replace → HTTPException 429", async () => {
      const { db } = await import("../db")
      vi.mocked(db.item).mockReturnValue({
        read: vi.fn().mockResolvedValue({
          resource: { id: "f1", ownerId, parentId: null, type: "file" },
        }),
        replace: vi.fn().mockRejectedValue(makeCosmosError(429)),
      } as any)
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
