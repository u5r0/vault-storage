import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Readable } from "node:stream"
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { R2BlobStore } from "./r2-blob-store"
import type { BlobListItem } from "./storage"

/**
 * Integration tests for `R2BlobStore` against a real S3-compatible store.
 *
 * Mirrors what `controllers/files.test.ts` does for `AzureBlobStore` against
 * Azurite. Uses RustFS (booted via `docker compose up -d rustfs`) to exercise
 * the full S3 protocol path — list, presigned URLs, batch deletes — without
 * touching production R2.
 *
 * RustFS is expected on `http://127.0.0.1:9000` with the dev credentials
 * declared in `docker-compose.yml`.
 */

const RUSTFS_ENDPOINT = "http://127.0.0.1:9000"
const RUSTFS_ACCESS_KEY = "rustfsadmin"
const RUSTFS_SECRET_KEY = "rustfsadmin"

// Unique per run so concurrent runs / leftover state can't collide.
const TEST_BUCKET = `vault-r2-test-${Date.now()}`

let store: R2BlobStore
let admin: S3Client

async function waitForRustFs(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${RUSTFS_ENDPOINT}/`)
      // Any HTTP response (even 403/AccessDenied for unauthenticated root)
      // means the server is up and speaking S3.
      if (res.status > 0) return
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : ""
  throw new Error(
    `RustFS not reachable at ${RUSTFS_ENDPOINT} after ${timeoutMs / 1000}s${detail}. ` +
      `Run \`docker compose up -d rustfs\` and check \`docker ps --filter name=vault-rustfs\`.`,
  )
}

async function emptyAndDropBucket(bucket: string): Promise<void> {
  // RustFS, like S3, refuses DeleteBucket on a non-empty bucket. Drain
  // every key first.
  let token: string | undefined
  do {
    const res = await admin.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
    }))
    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        await admin.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  await admin.send(new DeleteBucketCommand({ Bucket: bucket }))
}

beforeAll(async () => {
  await waitForRustFs()

  admin = new S3Client({
    region: "auto",
    endpoint: RUSTFS_ENDPOINT,
    credentials: {
      accessKeyId: RUSTFS_ACCESS_KEY,
      secretAccessKey: RUSTFS_SECRET_KEY,
    },
    forcePathStyle: true,
  })

  await admin.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))

  store = new R2BlobStore({
    accountId: "unused-for-rustfs",
    accessKeyId: RUSTFS_ACCESS_KEY,
    secretAccessKey: RUSTFS_SECRET_KEY,
    bucket: TEST_BUCKET,
    endpoint: RUSTFS_ENDPOINT,
  })
}, 30_000)

afterAll(async () => {
  if (admin) {
    await emptyAndDropBucket(TEST_BUCKET).catch(() => {
      /* best-effort cleanup */
    })
    admin.destroy()
  }
}, 30_000)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readViaPresigned(path: string): Promise<string> {
  const { url } = await store.createDownloadUrl(path, { expiresMinutes: 5 })
  const res = await fetch(url)
  expect(res.ok).toBe(true)
  return res.text()
}

async function collectList(prefix: string): Promise<BlobListItem[]> {
  const items: BlobListItem[] = []
  for await (const item of store.list(prefix)) items.push(item)
  return items
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("R2BlobStore (against RustFS)", () => {
  describe("upload + presigned download", () => {
    it("round-trips a Buffer payload", async () => {
      const path = "round-trip/buffer.txt"
      await store.upload(path, Buffer.from("hello buffer"), { contentType: "text/plain" })

      const meta = await store.stat(path)
      expect(meta!.path).toBe(path)
      expect(meta!.contentType).toBe("text/plain")
      expect(meta!.size).toBe(Buffer.byteLength("hello buffer"))
      expect(await readViaPresigned(path)).toBe("hello buffer")
    })

    it("round-trips a Node Readable stream", async () => {
      const path = "round-trip/stream.txt"
      const source = Readable.from(["chunk-1 ", "chunk-2 ", "chunk-3"])
      await store.upload(path, source, { contentType: "text/plain" })

      expect(await readViaPresigned(path)).toBe("chunk-1 chunk-2 chunk-3")
    })

    it("round-trips an AsyncIterable<Uint8Array>", async () => {
      const path = "round-trip/async-iter.bin"
      async function* gen() {
        yield new Uint8Array([0x68, 0x69]) // "hi"
        yield new Uint8Array([0x21]) // "!"
      }
      await store.upload(path, gen())
      const meta = await store.stat(path)
      expect(meta!.contentType).toBe("application/octet-stream") // default
      expect(await readViaPresigned(path)).toBe("hi!")
    })
  })

  describe("exists", () => {
    it("returns true after upload, false otherwise", async () => {
      const path = "exists/key"
      expect(await store.exists(path)).toBe(false)
      await store.upload(path, Buffer.from("x"))
      expect(await store.exists(path)).toBe(true)
    })

    it("returns false for keys that do not exist", async () => {
      expect(await store.exists("no-such/key/anywhere")).toBe(false)
    })
  })

  describe("stat", () => {
    it("returns null for missing keys (no throw)", async () => {
      expect(await store.stat("never-existed")).toBeNull()
    })

    it("returns size + contentType + modifiedAt for existing keys", async () => {
      const path = "stat/info.json"
      const body = `{"hello":"world"}`
      await store.upload(path, Buffer.from(body), { contentType: "application/json" })

      const meta = await store.stat(path)
      expect(meta).not.toBeNull()
      expect(meta!.path).toBe(path)
      expect(meta!.size).toBe(Buffer.byteLength(body))
      expect(meta!.contentType).toBe("application/json")
      expect(meta!.modifiedAt).toBeInstanceOf(Date)
    })
  })

  describe("list", () => {
    const prefix = "listing/"

    beforeAll(async () => {
      // listing/a.txt
      // listing/b.txt
      // listing/sub/inner.txt   → groups under "listing/sub/" common prefix
      // listing/sub/deeper/x    → also under "listing/sub/" (not flattened)
      await store.upload(`${prefix}a.txt`, Buffer.from("A"), { contentType: "text/plain" })
      await store.upload(`${prefix}b.txt`, Buffer.from("B"), { contentType: "text/plain" })
      await store.upload(`${prefix}sub/inner.txt`, Buffer.from("inner"))
      await store.upload(`${prefix}sub/deeper/x`, Buffer.from("deep"))
    })

    it("yields top-level files plus folder common prefixes (hierarchical)", async () => {
      const items = await collectList(prefix)

      const files = items.filter((i) => i.kind === "file")
      const folders = items.filter((i) => i.kind === "folder")

      expect(files.map((f) => (f as Extract<BlobListItem, { kind: "file" }>).metadata.name).sort())
        .toEqual(["a.txt", "b.txt"])
      expect(folders.map((f) => (f as Extract<BlobListItem, { kind: "folder" }>).path)).toEqual([
        "listing/sub",
      ])
    })

    it("populates file metadata with size + lastModified + full path", async () => {
      const items = await collectList(prefix)
      const a = items.find(
        (i) => i.kind === "file" && i.metadata.name === "a.txt",
      ) as Extract<BlobListItem, { kind: "file" }> | undefined

      expect(a).toBeDefined()
      expect(a!.metadata.path).toBe(`${prefix}a.txt`)
      expect(a!.metadata.size).toBe(1)
      expect(a!.metadata.modifiedAt).toBeInstanceOf(Date)
    })
  })

  describe("copy", () => {
    it("copies an object to a new key, leaving the source intact", async () => {
      const from = "copy/src.txt"
      const to = "copy/dst.txt"
      await store.upload(from, Buffer.from("payload"), { contentType: "text/plain" })

      await store.copy(from, to)

      expect(await store.exists(from)).toBe(true)
      expect(await store.exists(to)).toBe(true)

      expect(await readViaPresigned(to)).toBe("payload")
    })
  })

  describe("delete", () => {
    it("removes the object and subsequent exists() returns false", async () => {
      const path = "delete/single.txt"
      await store.upload(path, Buffer.from("bye"))
      await store.delete(path)
      expect(await store.exists(path)).toBe(false)
    })
  })

  describe("deletePrefix", () => {
    it("recursively deletes every key under the prefix and returns the count", async () => {
      const prefix = "purge/"
      // Plant a mix of nested files; deletePrefix uses flat listing so it
      // must reach into nested "folders" too.
      await store.upload(`${prefix}a.txt`, Buffer.from("a"))
      await store.upload(`${prefix}b.txt`, Buffer.from("b"))
      await store.upload(`${prefix}sub/c.txt`, Buffer.from("c"))
      await store.upload(`${prefix}sub/deep/d.txt`, Buffer.from("d"))

      const deleted = await store.deletePrefix(prefix)
      expect(deleted).toBe(4)

      // Verify nothing remains under the prefix.
      const remaining = await collectList(prefix)
      expect(remaining).toEqual([])
    })

    it("returns 0 when the prefix is already empty", async () => {
      expect(await store.deletePrefix("does-not-exist/")).toBe(0)
    })
  })

  describe("createUploadUrl", () => {
    it("generates a URL that accepts a direct PUT", async () => {
      const path = "presigned/upload.txt"
      const { url, expiresAt } = await store.createUploadUrl(path, {
        contentType: "text/plain",
        expiresMinutes: 5,
      })

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:9000\//)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now())

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "presigned body",
      })
      expect(res.ok).toBe(true)

      // Round-trip through the adapter: upload via presigned URL, read via presigned GET.
      expect(await readViaPresigned(path)).toBe("presigned body")
    })
  })

  describe("createDownloadUrl", () => {
    it("generates a URL that returns the object on GET", async () => {
      const path = "presigned/download.txt"
      await store.upload(path, Buffer.from("downloadable"), { contentType: "text/plain" })

      const { url, expiresAt } = await store.createDownloadUrl(path, { expiresMinutes: 5 })
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now())

      const res = await fetch(url)
      expect(res.ok).toBe(true)
      expect(await res.text()).toBe("downloadable")
    })
  })
})
