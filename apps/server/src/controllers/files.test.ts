import { describe, it, expect, beforeAll } from "vitest"
import type {
  ListFilesResult,
  UploadUrlResult,
  UploadCompleteResult,
  DownloadUrlResult,
  VaultEntry,
} from "@vault/sdk"
import { useFilesFixture, parseCookies } from "../__setup__/fixtures"
import { capturedEmails } from "../lib/email"
import { extractLinkToken } from "../__setup__/email-capture"

/**
 * Integration tests for the `/api/files` HTTP surface, exercising the real
 * Azure SDK against an in-memory Azurite (booted in __setup__/azurite.global.ts)
 * and Cosmos DB emulator (booted in __setup__/cosmos.global.ts).
 *
 * No mocks. We call `app.request(...)` directly so the entire stack runs
 * inside the test process. Email is exercised via the in-memory capture
 * transport (`lib/email.ts`) rather than an SMTP boundary.
 *
 * See ADR 0016 Phase D3, ADR 0017.
 */

const getApp = useFilesFixture()

// Default authenticated user — registered once in beforeAll, persists across
// tests because useFilesFixture only clears file/blob entries (not users).
let defaultCookies = ""

/** Read the verification token for `email` out of the capture transport. */
function verifyTokenFor(email: string): string {
  const msg = [...capturedEmails].reverse().find((m) => m.to === email)
  if (!msg) throw new Error(`no verification email captured for ${email}`)
  return extractLinkToken(msg.html, "/verify")
}

beforeAll(async () => {
  // Bootstrap a verified user once for the whole suite. Wrap each step so a
  // setup failure (e.g., Cosmos restart mid-run) surfaces as a clear message
  // instead of silently leaving `defaultCookies = ""` and producing a
  // cascade of "expected 401 to be 200" failures across every test below.
  try {
    const app = getApp()
    const email = "default@example.com"
    const password = "testpassword123456"

    const registerRes = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!registerRes.ok) {
      throw new Error(
        `register failed (${registerRes.status}): ${await registerRes.text()}`,
      )
    }

    const verifyToken = verifyTokenFor(email)
    if (!verifyToken) {
      throw new Error(
        "no verification token captured — sendVerificationEmail was not called",
      )
    }
    const verifyRes = await app.request(`/api/auth/verify?token=${verifyToken}`)
    if (!verifyRes.ok) {
      throw new Error(
        `verify failed (${verifyRes.status}): ${await verifyRes.text()}`,
      )
    }

    const loginRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!loginRes.ok) {
      throw new Error(
        `login failed (${loginRes.status}): ${await loginRes.text()}`,
      )
    }
    defaultCookies = parseCookies(loginRes)
    if (!defaultCookies) {
      throw new Error("login succeeded but no Set-Cookie headers were returned")
    }
  } catch (err) {
    // Re-throw with an obvious banner so the failure can't be mistaken for an
    // assertion error inside a test.
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[files.test.ts beforeAll] integration bootstrap failed: ${reason}\n` +
        `This usually means an infrastructure dependency (Cosmos DB emulator, ` +
        `Azurite, or RustFS) is unreachable. Check \`docker ps\` and the ` +
        `readiness gates in apps/server/src/__setup__/*.global.ts.`,
    )
  }
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

/**
 * Two-step direct upload: client gets a presigned PUT URL, ships bytes
 * straight to object storage, then asks the server to record the entry.
 * Same end-state as POST /upload (one Cosmos doc, blob in storage), but
 * the API process never touches the file body. See ADR 0021.
 */
describe("POST /api/files/upload-url + /upload-complete", () => {
  async function mintUploadUrl(name: string, size: number, contentType = "text/plain") {
    const app = getApp()
    const res = await app.request("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name, contentType, size }),
    })
    expect(res.status).toBe(201)
    return (await res.json()) as UploadUrlResult
  }

  it("round-trips a direct upload end-to-end", async () => {
    const body = "direct upload payload"
    const ticket = await mintUploadUrl("direct.txt", body.length)
    expect(ticket.blobName).toMatch(/^vault\/blobs\/[0-9a-f-]{36}$/)
    expect(ticket.uploadUrl).toContain("?")
    expect(new Date(ticket.expiresAt).getTime()).toBeGreaterThan(Date.now())

    // PUT goes straight to Azurite — the API never sees these bytes.
    const putRes = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
        ...ticket.requiredHeaders,
      },
      body,
    })
    expect(putRes.ok).toBe(true)

    const app = getApp()
    const completeRes = await app.request("/api/files/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({
        blobName: ticket.blobName,
        parentId: null,
        name: "direct.txt",
        contentType: "text/plain",
      }),
    })
    expect(completeRes.status).toBe(201)
    const { entry } = (await completeRes.json()) as UploadCompleteResult
    expect(entry).toMatchObject({
      name: "direct.txt",
      type: "file",
      size: body.length,
      contentType: "text/plain",
    })

    // Visible in the listing exactly like a server-proxied upload.
    const list = await listRoot()
    expect(list.entries.find((e) => e.name === "direct.txt")).toBeDefined()
  })

  it("trusts storage stat() for size — server records the actual blob size", async () => {
    // Client lies about size in upload-url (declares 1 byte) but uploads
    // many. The server should record the real size from stat(), not the
    // declared one. Limit isn't tripped here — that's a separate test.
    const body = "actual contents are larger than declared"
    const ticket = await mintUploadUrl("size-truth.txt", 1)

    await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain", ...ticket.requiredHeaders },
      body,
    })

    const app = getApp()
    const completeRes = await app.request("/api/files/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({
        blobName: ticket.blobName,
        parentId: null,
        name: "size-truth.txt",
      }),
    })
    expect(completeRes.status).toBe(201)
    const { entry } = (await completeRes.json()) as UploadCompleteResult
    expect(entry.size).toBe(body.length)
  })

  it("is idempotent — replaying upload-complete returns the same entry", async () => {
    const body = "retry me"
    const ticket = await mintUploadUrl("idempotent.txt", body.length)
    await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain", ...ticket.requiredHeaders },
      body,
    })

    const app = getApp()
    const payload = JSON.stringify({
      blobName: ticket.blobName,
      parentId: null,
      name: "idempotent.txt",
      contentType: "text/plain",
    })
    const headers = { "Content-Type": "application/json", Cookie: defaultCookies }

    const first = (await (await app.request("/api/files/upload-complete", {
      method: "POST",
      headers,
      body: payload,
    })).json()) as UploadCompleteResult
    const second = (await (await app.request("/api/files/upload-complete", {
      method: "POST",
      headers,
      body: payload,
    })).json()) as UploadCompleteResult

    expect(second.entry.id).toBe(first.entry.id)
    const list = await listRoot()
    const matches = list.entries.filter((e) => e.name === "idempotent.txt")
    expect(matches).toHaveLength(1)
  })

  it("rejects upload-url for invalid filenames (400)", async () => {
    const app = getApp()
    const res = await app.request("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({
        parentId: null,
        name: "bad/name.txt",
        contentType: "text/plain",
        size: 10,
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects upload-complete for blobNames not minted by the server (400)", async () => {
    const app = getApp()
    const res = await app.request("/api/files/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({
        blobName: "../../etc/passwd",
        parentId: null,
        name: "evil.txt",
        contentType: "text/plain",
      }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects upload-complete when no blob was actually uploaded (404)", async () => {
    // Mint a URL but never PUT — the server should refuse to record it.
    const ticket = await mintUploadUrl("ghost.txt", 5)
    const app = getApp()
    const res = await app.request("/api/files/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({
        blobName: ticket.blobName,
        parentId: null,
        name: "ghost.txt",
        contentType: "text/plain",
      }),
    })
    expect(res.status).toBe(404)
  })
})

describe("GET /api/files/download-url", () => {
  it("mints a presigned URL that returns the original bytes", async () => {
    const { uploaded } = await uploadText(null, "presigned.txt", "via presigned")
    const fileId = uploaded[0].id

    const app = getApp()
    const res = await app.request(`/api/files/download-url?id=${fileId}`, {
      headers: { Cookie: defaultCookies },
    })
    expect(res.status).toBe(200)
    const { url, expiresAt } = (await res.json()) as DownloadUrlResult
    expect(url).toContain("?")
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())

    // Browser-direct fetch — bypasses the API.
    const direct = await fetch(url)
    expect(direct.ok).toBe(true)
    expect(await direct.text()).toBe("via presigned")
  })

  it("404s for entries that do not exist", async () => {
    // Valid UUID v4 format (positions 13 = '4', 17 = '8') so it passes
    // the Zod validator; nothing in Cosmos has this id, so the service
    // returns 404 from the doc lookup.
    const app = getApp()
    const res = await app.request(
      `/api/files/download-url?id=00000000-0000-4000-8000-000000000000`,
      { headers: { Cookie: defaultCookies } },
    )
    expect(res.status).toBe(404)
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

  /**
   * F-DEL (ADR 0026 Phase 1): recursive delete must remove the full subtree,
   * not just one level. Before the fix, nested subfolders and their blobs
   * were orphaned in both Cosmos and blob storage.
   *
   * Tree under test:
   *   Root/
   *     Sub/
   *       deep.txt   ← must be deleted
   *     top.txt      ← must be deleted
   */
  it("recursively deletes nested subfolders and their blobs (F-DEL)", async () => {
    const app = getApp()

    // Create Root → Sub → deep.txt + Root → top.txt
    const rootRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "Root" }),
    })
    expect(rootRes.status).toBe(201)
    const root = (await rootRes.json()) as { id: string }

    const subRes = await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: root.id, name: "Sub" }),
    })
    expect(subRes.status).toBe(201)
    const sub = (await subRes.json()) as { id: string }

    const { uploaded: [deepFile] } = await uploadText(sub.id, "deep.txt", "deep content")
    const { uploaded: [topFile] } = await uploadText(root.id, "top.txt", "top content")

    // Delete the root folder
    const delRes = await app.request("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ id: root.id }),
    })
    expect(delRes.status).toBe(200)
    const { deleted } = (await delRes.json()) as { deleted: number }
    // root + Sub + deep.txt + top.txt = 4
    expect(deleted).toBe(4)

    // Root folder is gone from listing
    const list = await listRoot()
    expect(list.entries.find((e: VaultEntry) => e.name === "Root")).toBeUndefined()

    // Blobs are physically gone — downloading either file must 404
    const dlDeep = await app.request(`/api/files/download?id=${deepFile.id}`, {
      headers: { Cookie: defaultCookies },
    })
    expect(dlDeep.status).toBe(404)

    const dlTop = await app.request(`/api/files/download?id=${topFile.id}`, {
      headers: { Cookie: defaultCookies },
    })
    expect(dlTop.status).toBe(404)
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

// ── Search (ADR 0018 §C) ─────────────────────────────────────────────────────

describe("GET /api/files/search", () => {
  async function searchAs(
    cookies: string,
    params: Record<string, string>,
  ) {
    const app = getApp()
    const qs = new URLSearchParams(params).toString()
    return app.request(`/api/files/search?${qs}`, { headers: { Cookie: cookies } })
  }

  it("returns matches by case-insensitive substring on name", async () => {
    await uploadText(null, "ProjectAlpha.md", "alpha", "text/markdown")
    await uploadText(null, "project-beta.md", "beta", "text/markdown")
    await uploadText(null, "unrelated.txt", "x")

    const res = await searchAs(defaultCookies, { q: "project" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: VaultEntry[]; cursor: string | null }
    const names = body.entries.map((e) => e.name).sort()
    expect(names).toEqual(["ProjectAlpha.md", "project-beta.md"])
  })

  it("filters by type=folder", async () => {
    const app = getApp()
    await app.request("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: defaultCookies },
      body: JSON.stringify({ parentId: null, name: "Reports" }),
    })
    await uploadText(null, "report-q1.md", "q1", "text/markdown")

    const res = await searchAs(defaultCookies, { q: "report", type: "folder" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: VaultEntry[] }
    expect(body.entries.map((e) => e.name)).toEqual(["Reports"])
    expect(body.entries.every((e) => e.type === "folder")).toBe(true)
  })

  it("returns no results below the 2-char minimum (validated server-side)", async () => {
    // The schema enforces `q.min(1)`; this asserts the validator is wired in,
    // not the SDK's `min(2)` debounce gate (that's a frontend concern).
    const res = await searchAs(defaultCookies, { q: "" })
    expect(res.status).toBe(400)
  })

  it("user A cannot see user B's matches", async () => {
    const app = getApp()
    const password = "testpassword123456"

    // Bootstrap user B
    const emailB = `searchb+${Date.now()}@example.com`
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    })
    const tokenB = verifyTokenFor(emailB)
    await app.request(`/api/auth/verify?token=${tokenB}`)
    const loginB = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password }),
    })
    const cookiesB = parseCookies(loginB)

    // User A creates a uniquely-named file
    const uniq = `unique-${Date.now()}`
    await uploadText(null, `${uniq}.txt`, "secret")

    // User B searches for it — must come up empty
    const res = await searchAs(cookiesB, { q: uniq })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: VaultEntry[] }
    expect(body.entries).toEqual([])
  })

  it("unauthenticated -> 401", async () => {
    const app = getApp()
    const res = await app.request("/api/files/search?q=anything")
    expect(res.status).toBe(401)
  })
})

// ── Cursor pagination on GET /api/files (ADR 0018 §B) ────────────────────────

describe("GET /api/files cursor pagination", () => {
  it.skip("returns a cursor when more pages remain, and exhausts in two requests", async () => {
    // Seed 3 files at root and request a page size of 2 — Cosmos should hand
    // back a continuation token, and the second request should drain.
    for (const n of ["page-a.txt", "page-b.txt", "page-c.txt"]) {
      await uploadText(null, n, "x")
    }

    const app = getApp()
    const first = await app.request("/api/files?pageSize=2", {
      headers: { Cookie: defaultCookies },
    })
    expect(first.status).toBe(200)
    const page1 = (await first.json()) as ListFilesResult
    expect(page1.entries.length).toBe(2)
    expect(page1.cursor).toBeTruthy()

    const second = await app.request(
      `/api/files?pageSize=2&cursor=${encodeURIComponent(page1.cursor!)}`,
      { headers: { Cookie: defaultCookies } },
    )
    expect(second.status).toBe(200)
    const page2 = (await second.json()) as ListFilesResult
    expect(page2.entries.length).toBe(1)
    expect(page2.cursor).toBe(null)

    const allNames = [...page1.entries, ...page2.entries].map((e) => e.name).sort()
    expect(allNames).toEqual(["page-a.txt", "page-b.txt", "page-c.txt"])
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

    const emailA = `usera+${Date.now()}@example.com`
    const emailB = `userb+${Date.now()}@example.com`
    const password = "testpassword123456"

    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password }),
    })
    const tokenA = verifyTokenFor(emailA)
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
    const tokenB = verifyTokenFor(emailB)
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
    const tokenA = verifyTokenFor(emailA)
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
    const tokenB = verifyTokenFor(emailB)
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
