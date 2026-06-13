import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { UploadManager, type UploadManagerClient } from "./upload-manager"
import type { UploadCompleteResult, UploadUrlResult, VaultEntry } from "./schemas"

/**
 * Unit tests for the framework-agnostic upload runner. We stub the SDK
 * client (no real HTTP) and the global fetch (the PUT step), which lets
 * us exercise the full state machine — pending → uploading → completed,
 * concurrency, cancel — in a Node test env.
 */

function makeFile(name: string, body = "x"): File {
  return new File([body], name, { type: "text/plain" })
}

function makeEntry(id: string, name: string): VaultEntry {
  return {
    id,
    ownerId: null,
    parentId: null,
    name,
    type: "file",
    size: 1,
    contentType: "text/plain",
    blobUrl: `vault/blobs/${id}`,
    isFavorite: false,
    tags: [],
    createdAt: new Date().toISOString(),
    modifiedAt: null,
  }
}

interface StubClient extends UploadManagerClient {
  ticketFor(name: string): UploadUrlResult
}

function makeStubClient(opts: {
  uploadUrlDelayMs?: number
  completeDelayMs?: number
  failOn?: (name: string, step: "url" | "complete") => Error | null
} = {}): StubClient {
  let uploadCounter = 0
  return {
    ticketFor(name: string): UploadUrlResult {
      return {
        blobName: `vault/blobs/${name}-stub-id`,
        uploadUrl: `https://stub.invalid/upload/${name}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        requiredHeaders: {},
      }
    },
    async createUploadUrl(input): Promise<UploadUrlResult> {
      const fail = opts.failOn?.(input.name, "url")
      if (fail) throw fail
      if (opts.uploadUrlDelayMs) {
        await new Promise((r) => setTimeout(r, opts.uploadUrlDelayMs))
      }
      uploadCounter++
      return {
        blobName: `vault/blobs/${input.name}-stub-${uploadCounter}`,
        uploadUrl: `https://stub.invalid/upload/${input.name}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        requiredHeaders: {},
      }
    },
    async completeUpload(input): Promise<UploadCompleteResult> {
      const fail = opts.failOn?.(input.name, "complete")
      if (fail) throw fail
      if (opts.completeDelayMs) {
        await new Promise((r) => setTimeout(r, opts.completeDelayMs))
      }
      return { entry: makeEntry(input.blobName, input.name) }
    },
  }
}

let originalFetch: typeof globalThis.fetch
let putCalls: { url: string; signal?: AbortSignal }[]
let pendingPuts: Array<{ resolve: () => void; reject: (e: Error) => void; signal?: AbortSignal }>

beforeEach(() => {
  originalFetch = globalThis.fetch
  putCalls = []
  pendingPuts = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.useRealTimers()
})

/** Replace global fetch with a stub that resolves successfully. */
function stubFetchSuccess() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    putCalls.push({ url, signal: init?.signal ?? undefined })
    return new Response(null, { status: 201 })
  }) as typeof globalThis.fetch
}

/** Replace global fetch with a stub whose PUTs only resolve when we say so. */
function stubFetchControllable() {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    putCalls.push({ url, signal: init?.signal ?? undefined })
    return new Promise<Response>((resolve, reject) => {
      const entry = {
        resolve: () => resolve(new Response(null, { status: 201 })),
        reject,
        signal: init?.signal ?? undefined,
      }
      pendingPuts.push(entry)
      // Honor abort signal: surface as DOMException-like so the manager
      // converts to "canceled".
      init?.signal?.addEventListener("abort", () => {
        entry.reject(new Error("aborted"))
      })
    })
  }) as typeof globalThis.fetch
}

describe("UploadManager", () => {
  it("runs the three-step flow and surfaces a completed entry", async () => {
    stubFetchSuccess()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 1 })
    const completed = vi.fn()
    mgr.on("completed", completed)

    const handle = mgr.add({ file: makeFile("a.txt"), parentId: null })!
    expect(handle).not.toBeNull()
    expect(handle.state.status).toBe("pending")

    // Spin until the manager finishes the file.
    await vi.waitFor(() => {
      expect(handle.state.status).toBe("completed")
    })

    expect(completed).toHaveBeenCalledTimes(1)
    if (handle.state.status === "completed") {
      expect(handle.state.entry.name).toBe("a.txt")
    }
    expect(putCalls).toHaveLength(1)
  })

  it("respects the concurrency limit", async () => {
    stubFetchControllable()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 2 })

    mgr.add({ file: makeFile("a"), parentId: null })
    mgr.add({ file: makeFile("b"), parentId: null })
    mgr.add({ file: makeFile("c"), parentId: null })

    // Wait until two PUTs are in flight; the third must remain pending.
    await vi.waitFor(() => {
      expect(pendingPuts).toHaveLength(2)
    })

    const states = mgr.list().map((h) => h.state.status)
    expect(states.filter((s) => s === "uploading").length).toBe(2)
    expect(states.filter((s) => s === "pending").length).toBe(1)

    // Resolve the first PUT — concurrency slot frees, third file picks up.
    pendingPuts[0].resolve()
    await vi.waitFor(() => {
      expect(pendingPuts.length).toBeGreaterThanOrEqual(3)
    })
  })

  it("rejects files past maxFiles without queueing them", () => {
    stubFetchSuccess()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 1, maxFiles: 2 })

    expect(mgr.add({ file: makeFile("a"), parentId: null })).not.toBeNull()
    expect(mgr.add({ file: makeFile("b"), parentId: null })).not.toBeNull()
    expect(mgr.add({ file: makeFile("c"), parentId: null })).toBeNull()

    expect(mgr.list()).toHaveLength(2)
  })

  it("rejects files larger than maxFileSize", () => {
    stubFetchSuccess()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { maxFileSize: 1 })

    const big = new File(["xx"], "big.txt", { type: "text/plain" }) // 2 bytes
    expect(mgr.add({ file: big, parentId: null })).toBeNull()
    expect(mgr.list()).toHaveLength(0)
  })

  it("emits an error and stops the file when createUploadUrl throws", async () => {
    stubFetchSuccess()
    const client = makeStubClient({
      failOn: (name, step) =>
        name === "doomed.txt" && step === "url"
          ? new Error("nope")
          : null,
    })
    const mgr = new UploadManager(client, { concurrency: 1 })
    const onError = vi.fn()
    mgr.on("error", onError)

    const handle = mgr.add({ file: makeFile("doomed.txt"), parentId: null })!

    await vi.waitFor(() => {
      expect(handle.state.status).toBe("error")
    })
    if (handle.state.status === "error") {
      expect(handle.state.error.message).toBe("nope")
    }
    expect(onError).toHaveBeenCalledTimes(1)
    // PUT must not have been attempted — error happened before that step.
    expect(putCalls).toHaveLength(0)
  })

  it("emits an error when the PUT step fails (non-2xx)", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 500, statusText: "Server Error" })) as typeof globalThis.fetch
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 1 })
    const onError = vi.fn()
    mgr.on("error", onError)

    const handle = mgr.add({ file: makeFile("a.txt"), parentId: null })!
    await vi.waitFor(() => {
      expect(handle.state.status).toBe("error")
    })
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("transitions to canceled (not error) when cancel() is called mid-flight", async () => {
    stubFetchControllable()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 1 })
    const onError = vi.fn()
    mgr.on("error", onError)

    const handle = mgr.add({ file: makeFile("slow.txt"), parentId: null })!
    await vi.waitFor(() => {
      expect(pendingPuts).toHaveLength(1)
    })

    handle.cancel()

    await vi.waitFor(() => {
      expect(handle.state.status).toBe("canceled")
    })
    // Cancel must not raise the error event — it's a user action, not a fault.
    expect(onError).not.toHaveBeenCalled()
  })

  it("remove() drops the handle from the queue", async () => {
    stubFetchSuccess()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 1 })

    const handle = mgr.add({ file: makeFile("a.txt"), parentId: null })!
    mgr.remove(handle.id)

    expect(mgr.list()).toHaveLength(0)
  })

  it("emits 'change' on add, transition, and remove", async () => {
    stubFetchSuccess()
    const client = makeStubClient()
    const mgr = new UploadManager(client, { concurrency: 1 })
    const onChange = vi.fn()
    mgr.on("change", onChange)

    const handle = mgr.add({ file: makeFile("a.txt"), parentId: null })!
    // At least one change for the add itself.
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1)

    await vi.waitFor(() => {
      expect(handle.state.status).toBe("completed")
    })

    const beforeRemove = onChange.mock.calls.length
    mgr.remove(handle.id)
    expect(onChange.mock.calls.length).toBeGreaterThan(beforeRemove)
  })

  it("forwards parentId through both steps", async () => {
    stubFetchSuccess()
    const createSpy = vi.fn()
    const completeSpy = vi.fn()
    const client: UploadManagerClient = {
      createUploadUrl: async (input) => {
        createSpy(input)
        return {
          blobName: `vault/blobs/${input.name}-id`,
          uploadUrl: `https://stub.invalid/${input.name}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          requiredHeaders: {},
        }
      },
      completeUpload: async (input) => {
        completeSpy(input)
        return { entry: makeEntry("id", input.name) }
      },
    }
    const mgr = new UploadManager(client, { concurrency: 1 })

    const handle = mgr.add({
      file: makeFile("a.txt"),
      parentId: "00000000-0000-0000-0000-000000000abc",
    })!
    await vi.waitFor(() => {
      expect(handle.state.status).toBe("completed")
    })

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "00000000-0000-0000-0000-000000000abc" }),
    )
    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "00000000-0000-0000-0000-000000000abc" }),
    )
  })
})
