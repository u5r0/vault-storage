import { describe, it, expect, vi, beforeEach } from "vitest"
import { HTTPException } from "hono/http-exception"
import { filesService } from "./files"

vi.mock("../db", () => ({
  db: {
    items: {
      query: vi.fn(),
      create: vi.fn(),
    },
    item: vi.fn(),
  },
}))

vi.mock("../lib/azure", () => ({
  env: { maxUploadMb: 100 },
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
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            { id: "file-1", ownerId, parentId: null, name: "doc.txt", type: "file" },
            { id: "folder-1", ownerId, parentId: null, name: "Folder", type: "folder" },
          ],
        }),
      } as any)

      const result = await filesService.list(null, ownerId)

      expect(db.items.query).toHaveBeenCalledWith({
        query: expect.stringContaining("c.ownerId = @ownerId"),
        parameters: expect.arrayContaining([{ name: "@ownerId", value: ownerId }]),
      })
      expect(result).toHaveLength(2)
    })

    it("sorts folders before files, then alphabetically", async () => {
      const { db } = await import("../db")

      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            { id: "file-1", ownerId, parentId: null, name: "b.txt", type: "file" },
            { id: "folder-1", ownerId, parentId: null, name: "A", type: "folder" },
            { id: "file-2", ownerId, parentId: null, name: "a.txt", type: "file" },
          ],
        }),
      } as any)

      const result = await filesService.list(null, ownerId)

      expect(result[0].name).toBe("A")
      expect(result[1].name).toBe("a.txt")
      expect(result[2].name).toBe("b.txt")
    })
  })

  describe("delete", () => {
    it("deletes file and blob", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/azure")

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

    it("deletes folder and cascades to children", async () => {
      const { db } = await import("../db")
      const { getBlobStore } = await import("../lib/azure")

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
      vi.mocked(db.items.query).mockReturnValue({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [
            { id: "child-1", blobName: "vault/blobs/child-1" },
            { id: "child-2", blobName: null },
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

      expect(result.deleted).toBeGreaterThanOrEqual(3)
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
})
