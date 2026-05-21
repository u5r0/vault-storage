import { describe, it, expect } from "vitest"
import type { ListFilesResult, VaultEntry } from "@vault/sdk"
import { useFilesFixture } from "../../fixtures"

/**
 * Integration tests for the `/api/files` HTTP surface, exercising the real
 * Azure SDK against an in-memory Azurite (booted in tests/setup/azurite.global.ts).
 *
 * No mocks. We call `app.request(...)` directly so the entire stack runs
 * inside the test process — Hono middleware, Zod validation, the
 * AzureBlobStore adapter, and Azurite's blob server.
 *
 * See ADR 0005 Phase A.
 */

const getApp = useFilesFixture()

async function listRoot(): Promise<ListFilesResult> {
  const app = getApp()
  const res = await app.request("/api/files")
  expect(res.status).toBe(200)
  return (await res.json()) as ListFilesResult
}

async function listAt(entityId: string | null): Promise<ListFilesResult> {
  const app = getApp()
  const query = entityId ? `?entityId=${encodeURIComponent(entityId)}` : ""
  const res = await app.request(`/api/files${query}`)
  expect(res.status).toBe(200)
  return (await res.json()) as ListFilesResult
}

async function uploadText(parentId: string | null, name: string, body: string, type = "text/plain") {
  const app = getApp()
  const fd = new FormData()
  if (parentId) {
    fd.set("parentId", parentId)
  }
  fd.set("files", new File([body], name, { type }))
  const res = await app.request("/api/files/upload", { method: "POST", body: fd })
  expect(res.status).toBe(201)
  return (await res.json()) as { uploaded: VaultEntry[] }
}

describe("GET /api/files", () => {
  it("returns an empty list for an empty container", async () => {
    const data = await listRoot()
    expect(data.entityId).toBe(null)
    expect(data.entries).toEqual([])
  })
})

describe("POST /api/files/folder", () => {
  it("creates a folder visible in the parent listing", async () => {
    const app = getApp()
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Movies" }),
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { id: string; parentId: string | null; type: string }
    expect(created.type).toBe("folder")
    expect(created.parentId).toBe(null)

    const list = await listRoot()
    expect(list.entries).toHaveLength(1)
    expect(list.entries[0]).toMatchObject({
      name: "Movies",
      type: "folder",
    })
  })
})

describe("POST /api/files/upload", () => {
  it("uploads a file and exposes it in the listing with metadata", async () => {
    const { uploaded } = await uploadText(null, "hello.txt", "hello world")
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]).toMatchObject({
      name: "hello.txt",
      type: "file",
      size: "hello world".length,
      contentType: "text/plain",
    })

    const list = await listRoot()
    const file = list.entries.find((e: VaultEntry) => e.name === "hello.txt")
    expect(file).toBeDefined()
    expect(file).toMatchObject({ type: "file", size: 11 })
  })

  it("uploads into a nested folder", async () => {
    const app = getApp()
    const folderRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Documents" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    await uploadText(folder.id, "note.md", "# hi", "text/markdown")

    const list = await listAt(folder.id)
    const names = list.entries.map((e: VaultEntry) => e.name)
    expect(names).toContain("note.md")
  })
})

describe("GET /api/files/download", () => {
  it("returns the bytes that were uploaded", async () => {
    const app = getApp()
    const { uploaded } = await uploadText(null, "greet.txt", "bonjour")
    const fileId = uploaded[0].id
    const res = await app.request(`/api/files/download?id=${fileId}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/plain")
    expect(await res.text()).toBe("bonjour")
  })
})

describe("PATCH /api/files/rename", () => {
  it("renames a file", async () => {
    const app = getApp()
    const { uploaded } = await uploadText(null, "old.txt", "stays the same")
    const fileId = uploaded[0].id

    const res = await app.request("/api/files/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fileId, name: "new.txt" }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: fileId, name: "new.txt" })

    const list = await listRoot()
    const names = list.entries.map((e: VaultEntry) => e.name)
    expect(names).toContain("new.txt")
    expect(names).not.toContain("old.txt")

    const dl = await app.request(`/api/files/download?id=${fileId}`)
    expect(await dl.text()).toBe("stays the same")
  })
})

describe("DELETE /api/files", () => {
  it("deletes a single file", async () => {
    const app = getApp()
    const { uploaded } = await uploadText(null, "trash.txt", "bye")
    const fileId = uploaded[0].id

    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fileId }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 1 })

    const list = await listRoot()
    expect(list.entries.find((e: VaultEntry) => e.name === "trash.txt")).toBeUndefined()
  })

  it("deletes a folder and all its descendants", async () => {
    const app = getApp()
    const folderRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Junk" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    await uploadText(folder.id, "a.txt", "a")
    await uploadText(folder.id, "b.txt", "b")

    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: folder.id }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deleted: number }
    expect(body.deleted).toBeGreaterThanOrEqual(3) // 2 files + 1 folder

    const list = await listRoot()
    expect(list.entries.find((e: VaultEntry) => e.name === "Junk")).toBeUndefined()
  })
})

describe("PATCH /api/files/move", () => {
  it("moves a file into a folder", async () => {
    const app = getApp()
    const folderRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Archive" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    const { uploaded } = await uploadText(null, "report.txt", "contents")
    const fileId = uploaded[0].id

    const res = await app.request("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fileId, parentId: folder.id }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: fileId, parentId: folder.id })

    const root = await listRoot()
    expect(root.entries.find((e: VaultEntry) => e.name === "report.txt")).toBeUndefined()

    const inside = await listAt(folder.id)
    expect(inside.entries.find((e: VaultEntry) => e.name === "report.txt")).toBeDefined()
  })

  it("moves a file back to root (parentId: null)", async () => {
    const app = getApp()
    const folderRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "Temp" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    const { uploaded } = await uploadText(folder.id, "note.txt", "hi")
    const fileId = uploaded[0].id

    const res = await app.request("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fileId, parentId: null }),
    })
    expect(res.status).toBe(200)

    const root = await listRoot()
    expect(root.entries.find((e: VaultEntry) => e.name === "note.txt")).toBeDefined()
  })
})

describe("File API error paths", () => {
  it("returns 404 for non-existent file download", async () => {
    const app = getApp()
    const res = await app.request("/api/files/download?id=00000000-0000-0000-0000-000000000000")
    expect(res.status).toBe(404)
  })

  it("returns 404 for invalid UUID format", async () => {
    const app = getApp()
    const res = await app.request("/api/files/download?id=invalid-uuid")
    expect(res.status).toBe(404)
  })

  it("returns 400 for missing id parameter", async () => {
    const app = getApp()
    const res = await app.request("/api/files/download")
    expect(res.status).toBe(400)
  })

  it("rejects invalid folder names with path separators", async () => {
    const app = getApp()
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "invalid/folder" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects folder names with control characters", async () => {
    const app = getApp()
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: "invalid\x00folder" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects folder names that are too long", async () => {
    const app = getApp()
    const longName = "a".repeat(256)
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null, name: longName }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects rename with invalid UUID", async () => {
    const app = getApp()
    const res = await app.request("/api/files/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "invalid-uuid", name: "newname" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects move with invalid UUID", async () => {
    const app = getApp()
    const res = await app.request("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "invalid-uuid", parentId: null }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects delete with invalid UUID", async () => {
    const app = getApp()
    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "invalid-uuid" }),
    })
    expect(res.status).toBe(400)
  })
})
