import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import type { ListFilesResult, VaultEntry } from "@vault/sdk"
import { useFilesFixture, parseCookies } from "../__setup__/fixtures"

/**
 * Integration tests for the `/api/files` HTTP surface, exercising the real
 * Azure SDK against an in-memory Azurite (booted in __setup__/azurite.global.ts)
 * and Cosmos DB emulator (booted in __setup__/cosmos.global.ts).
 *
 * No mocks except email (SMTP boundary). We call `app.request(...)` directly
 * so the entire stack runs inside the test process.
 *
 * See ADR 0016 Phase D3, ADR 0017.
 */

vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))

const getApp = useFilesFixture()

// Default authenticated user — registered once in beforeAll, persists across
// tests because useFilesFixture only clears file/blob entries (not users).
let defaultCookies = ""
const tokenStore = new Map<string, string>()

beforeAll(async () => {
  const { sendVerificationEmail } = await import("../lib/email")
  vi.mocked(sendVerificationEmail).mockImplementation(async (email: string, token: string) => {
    tokenStore.set(email, token)
  })

  const app = getApp()
  const email = "default@example.com"
  const password = "testpassword123456"

  await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  const verifyToken = tokenStore.get(email)!
  await app.request(`/api/auth/verify?token=${verifyToken}`)
  tokenStore.clear()

  const loginRes = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  defaultCookies = parseCookies(loginRes)
})

afterEach(() => {
  tokenStore.clear()
})

// ── Authenticated helpers ────────────────────────────────────────────────────

async function listRoot(): Promise<ListFilesResult> {
  const app = getApp()
  const res = await app.request("/api/files", { headers: { Cookie: defaultCookies } })
  expect(res.status).toBe(200)
  return (await res.json()) as ListFilesResult
}

async function listAt(entityId: string | null): Promise<ListFilesResult> {
  const app = getApp()
  const query = entityId ? `?entityId=${encodeURIComponent(entityId)}` : ""
  const res = await app.request(`/api/files${query}`, { headers: { Cookie: defaultCookies } })
  expect(res.status).toBe(200)
  return (await res.json()) as ListFilesResult
}

async function uploadText(parentId: string | null, name: string, body: string, type = "text/plain") {
  const app = getApp()
  const fd = new FormData()
  if (parentId) fd.set("parentId", parentId)
  fd.set("files", new File([body], name, { type }))
  const res = await app.request("/api/files/upload", {
    method: "POST",
    headers: { Cookie: defaultCookies },
    body: fd,
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { uploaded: VaultEntry[] }
}

// ── CRUD tests ───────────────────────────────────────────────────────────────

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
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "Movies" }),
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { id: string; parentId: string | null; type: string }
    expect(created.type).toBe("folder")
    expect(created.parentId).toBe(null)

    const list = await listRoot()
    expect(list.entries).toHaveLength(1)
    expect(list.entries[0]).toMatchObject({ name: "Movies", type: "folder" })
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
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
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
    const res = await app.request(`/api/files/download?id=${fileId}`, {
      headers: { Cookie: defaultCookies },
    })
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
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: fileId, name: "new.txt" }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: fileId, name: "new.txt" })

    const list = await listRoot()
    const names = list.entries.map((e: VaultEntry) => e.name)
    expect(names).toContain("new.txt")
    expect(names).not.toContain("old.txt")

    const dl = await app.request(`/api/files/download?id=${fileId}`, {
      headers: { Cookie: defaultCookies },
    })
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
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
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
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "Junk" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    await uploadText(folder.id, "a.txt", "a")
    await uploadText(folder.id, "b.txt", "b")

    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: folder.id }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deleted: number }
    expect(body.deleted).toBeGreaterThanOrEqual(3)

    const list = await listRoot()
    expect(list.entries.find((e: VaultEntry) => e.name === "Junk")).toBeUndefined()
  })
})

describe("PATCH /api/files/move", () => {
  it("moves a file into a folder", async () => {
    const app = getApp()
    const folderRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "Archive" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    const { uploaded } = await uploadText(null, "report.txt", "contents")
    const fileId = uploaded[0].id

    const res = await app.request("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
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
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "Temp" }),
    })
    const folder = (await folderRes.json()) as { id: string }
    const { uploaded } = await uploadText(folder.id, "note.txt", "hi")
    const fileId = uploaded[0].id

    const res = await app.request("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: fileId, parentId: null }),
    })
    expect(res.status).toBe(200)

    const root = await listRoot()
    expect(root.entries.find((e: VaultEntry) => e.name === "note.txt")).toBeDefined()
  })
})

// ── Error paths ──────────────────────────────────────────────────────────────

describe("File API error paths", () => {
  it("returns 404 for non-existent file download", async () => {
    const app = getApp()
    const res = await app.request(
      "/api/files/download?id=00000000-0000-0000-0000-000000000000",
      { headers: { Cookie: defaultCookies } },
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 for invalid UUID format", async () => {
    const app = getApp()
    const res = await app.request("/api/files/download?id=invalid-uuid", {
      headers: { Cookie: defaultCookies },
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 for missing id parameter", async () => {
    const app = getApp()
    const res = await app.request("/api/files/download", {
      headers: { Cookie: defaultCookies },
    })
    expect(res.status).toBe(400)
  })

  it("rejects invalid folder names with path separators", async () => {
    const app = getApp()
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "invalid/folder" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects folder names with control characters", async () => {
    const app = getApp()
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "invalid\x00folder" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects folder names that are too long", async () => {
    const app = getApp()
    const longName = "a".repeat(256)
    const res = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: longName }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects rename with invalid UUID", async () => {
    const app = getApp()
    const res = await app.request("/api/files/rename", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: "invalid-uuid", name: "newname" }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects move with invalid UUID", async () => {
    const app = getApp()
    const res = await app.request("/api/files/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: "invalid-uuid", parentId: null }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects delete with invalid UUID", async () => {
    const app = getApp()
    const res = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: "invalid-uuid" }),
    })
    expect(res.status).toBe(400)
  })
})

// ── Auth enforcement ─────────────────────────────────────────────────────────

describe("Auth enforcement on file routes", () => {
  it("unauthenticated list -> 401", async () => {
    const app = getApp()
    const res = await app.request("/api/files")
    expect(res.status).toBe(401)
  })

  it("unauthenticated upload -> 401", async () => {
    const app = getApp()
    const fd = new FormData()
    fd.set("files", new File(["test"], "test.txt", { type: "text/plain" }))
    const res = await app.request("/api/files/upload", { method: "POST", body: fd })
    expect(res.status).toBe(401)
  })

  it("unauthenticated download -> 401", async () => {
    const app = getApp()
    const res = await app.request("/api/files/download?id=00000000-0000-0000-0000-000000000000")
    expect(res.status).toBe(401)
  })

  it("user A cannot list user B's files", async () => {
    const app = getApp()
    const { sendVerificationEmail } = await import("../lib/email")

    const emailA = `usera+${Date.now()}@example.com`
    const emailB = `userb+${Date.now()}@example.com`
    const password = "testpassword123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password }),
    })
    const tokenA = tokenStore.get(emailA)!
    await app.request(`/api/auth/verify?token=${tokenA}`)
    const loginA = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password }),
    })
    const cookiesA = parseCookies(loginA)

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    })
    const tokenB = tokenStore.get(emailB)!
    await app.request(`/api/auth/verify?token=${tokenB}`)
    const loginB = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    })
    const cookiesB = parseCookies(loginB)

    const folderResA = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookiesA },
      body: JSON.stringify({ parentId: null, name: "UserAFolder" }),
    })
    expect(folderResA.status).toBe(201)
    const folderA = await folderResA.json()

    const listB = await app.request("/api/files", { headers: { Cookie: cookiesB } })
    expect(listB.status).toBe(200)
    expect((await listB.json()).entries).toHaveLength(0)

    const listA = await app.request("/api/files", { headers: { Cookie: cookiesA } })
    expect(listA.status).toBe(200)
    const listAData = await listA.json()
    expect(listAData.entries).toHaveLength(1)
    expect(listAData.entries[0].id).toBe(folderA.id)
  })

  it("user A cannot delete user B's file", async () => {
    const app = getApp()

    const emailA = `usera+${Date.now()}@example.com`
    const emailB = `userb+${Date.now()}@example.com`
    const password = "testpassword123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password }),
    })
    const tokenA = tokenStore.get(emailA)!
    await app.request(`/api/auth/verify?token=${tokenA}`)
    const loginA = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password }),
    })
    const cookiesA = parseCookies(loginA)

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    })
    const tokenB = tokenStore.get(emailB)!
    await app.request(`/api/auth/verify?token=${tokenB}`)
    const loginB = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    })
    const cookiesB = parseCookies(loginB)

    const folderResA = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookiesA },
      body: JSON.stringify({ parentId: null, name: "UserAFolder" }),
    })
    const folderA = await folderResA.json()

    const deleteB = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: cookiesB },
      body: JSON.stringify({ id: folderA.id }),
    })
    expect(deleteB.status).toBe(403)
  })
})
