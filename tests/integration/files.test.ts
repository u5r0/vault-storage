import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import type { Hono } from "hono"
import type { ListFilesResult, VaultEntry } from "@vault/sdk"

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

let app: Hono

beforeAll(async () => {
  // Imported lazily so `azurite.env.ts` (per-worker setup) has already
  // populated AZURE_STORAGE_* before `server/lib/azure.ts` reads env.
  const { createApp } = await import("../../apps/server/src/app")
  app = createApp()
})

beforeEach(async () => {
  // Wipe the test container between tests so each one starts clean.
  const { getBlobStore } = await import("../../apps/server/src/lib/azure")
  const store = await getBlobStore()
  await store.deletePrefix("")
})

async function listRoot(): Promise<ListFilesResult> {
  const res = await app.request("/api/files")
  expect(res.status).toBe(200)
  return (await res.json()) as ListFilesResult
}

async function listAt(path: string): Promise<ListFilesResult> {
  const res = await app.request(`/api/files?path=${encodeURIComponent(path)}`)
  expect(res.status).toBe(200)
  return (await res.json()) as ListFilesResult
}

async function uploadText(path: string, name: string, body: string, type = "text/plain") {
  const fd = new FormData()
  fd.set("path", path)
  fd.set("files", new File([body], name, { type }))
  const res = await app.request("/api/files/upload", { method: "POST", body: fd })
  expect(res.status).toBe(201)
  return (await res.json()) as { uploaded: VaultEntry[] }
}

describe("GET /api/files", () => {
  it("returns an empty list for an empty container", async () => {
    const data = await listRoot()
    expect(data.path).toBe("")
    expect(data.entries).toEqual([])
  })
})

describe("POST /api/files/folder", () => {
  it("creates a folder visible in the parent listing", async () => {
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "", name: "Movies" }),
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { path: string; type: string }
    expect(created).toEqual({ path: "Movies", type: "folder" })

    const list = await listRoot()
    expect(list.entries).toHaveLength(1)
    expect(list.entries[0]).toMatchObject({
      name: "Movies",
      path: "Movies",
      type: "folder",
    })
  })
})

describe("POST /api/files/upload", () => {
  it("uploads a file and exposes it in the listing with metadata", async () => {
    const { uploaded } = await uploadText("", "hello.txt", "hello world")
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]).toMatchObject({
      name: "hello.txt",
      path: "hello.txt",
      type: "file",
      size: "hello world".length,
      contentType: "text/plain",
    })

    const list = await listRoot()
    const file = list.entries.find((e) => e.name === "hello.txt")
    expect(file).toBeDefined()
    expect(file).toMatchObject({ type: "file", size: 11 })
  })

  it("uploads into a nested folder", async () => {
    await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "", name: "Documents" }),
    })
    await uploadText("Documents", "note.md", "# hi", "text/markdown")

    const list = await listAt("Documents")
    const names = list.entries.map((e) => e.name)
    expect(names).toContain("note.md")
  })
})

describe("GET /api/files/download", () => {
  it("returns the bytes that were uploaded", async () => {
    await uploadText("", "greet.txt", "bonjour")
    const res = await app.request("/api/files/download?path=greet.txt")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/plain")
    expect(await res.text()).toBe("bonjour")
  })
})

describe("PATCH /api/files/rename", () => {
  it("moves a file to a new path", async () => {
    await uploadText("", "old.txt", "stays the same")

    const res = await app.request("/api/files/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "old.txt", to: "new.txt" }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ path: "new.txt" })

    const list = await listRoot()
    const names = list.entries.map((e) => e.name)
    expect(names).toContain("new.txt")
    expect(names).not.toContain("old.txt")

    const dl = await app.request("/api/files/download?path=new.txt")
    expect(await dl.text()).toBe("stays the same")
  })
})

describe("GET /api/files/sas", () => {
  it("returns a SAS upload URL for a valid path", async () => {
    const res = await app.request("/api/files/sas?path=via-sas.txt")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { uploadUrl: string }
    expect(body.uploadUrl).toContain("via-sas.txt")
    expect(body.uploadUrl).toMatch(/[?&]sig=/)
  })

  it("rejects invalid filenames", async () => {
    const res = await app.request("/api/files/sas?path=..")
    expect(res.status).toBe(400)
  })

  it("supports direct PUT upload through the SAS URL", async () => {
    const sasRes = await app.request("/api/files/sas?path=sas-direct.txt")
    expect(sasRes.status).toBe(200)
    const { uploadUrl } = (await sasRes.json()) as { uploadUrl: string }

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "text/plain",
      },
      body: "uploaded via sas",
    })
    expect(putRes.ok).toBe(true)

    const list = await listRoot()
    expect(list.entries.find((e) => e.name === "sas-direct.txt")).toMatchObject({
      type: "file",
      size: "uploaded via sas".length,
    })
  })
})

describe("DELETE /api/files", () => {
  it("deletes a single file", async () => {
    await uploadText("", "trash.txt", "bye")

    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "trash.txt", isFolder: false }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 1 })

    const list = await listRoot()
    expect(list.entries.find((e) => e.name === "trash.txt")).toBeUndefined()
  })

  it("deletes a folder and all its descendants", async () => {
    await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "", name: "Junk" }),
    })
    await uploadText("Junk", "a.txt", "a")
    await uploadText("Junk", "b.txt", "b")

    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "Junk", isFolder: true }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deleted: number }
    // 2 uploaded files + 1 .vault-keep marker
    expect(body.deleted).toBeGreaterThanOrEqual(2)

    const list = await listRoot()
    expect(list.entries.find((e) => e.name === "Junk")).toBeUndefined()
  })
})
