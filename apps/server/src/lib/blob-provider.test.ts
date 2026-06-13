import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

/**
 * Provider selection is the only piece of `blob-provider` that's not
 * already exercised end-to-end by the integration suite (controllers
 * → Azure adapter against Azurite) or the lib integration test
 * (R2 adapter against RustFS). These tests close the loop: the env
 * var routes to the right adapter, and bad values fail fast.
 *
 * Module state (the `_store` cache) carries between tests in the same
 * worker, so we `vi.resetModules()` per case to get a clean read of
 * `process.env` on each import.
 */

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  // Clear blob-related env so each test starts from a known state.
  delete process.env.BLOB_PROVIDER
  delete process.env.AZURE_STORAGE_CONNECTION_STRING
  delete process.env.AZURE_STORAGE_ACCOUNT_NAME
  delete process.env.AZURE_STORAGE_ACCOUNT_KEY
  delete process.env.R2_ACCESS_KEY_ID
  delete process.env.R2_SECRET_ACCESS_KEY
  delete process.env.R2_ACCOUNT_ID
  delete process.env.R2_ENDPOINT
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("blob-provider selection", () => {
  it("defaults to azure when BLOB_PROVIDER is unset", async () => {
    const { getProvider } = await import("./blob-provider")
    expect(getProvider()).toBe("azure")
  })

  it("returns 'r2' when BLOB_PROVIDER=r2", async () => {
    process.env.BLOB_PROVIDER = "r2"
    const { getProvider } = await import("./blob-provider")
    expect(getProvider()).toBe("r2")
  })

  it("returns 'azure' when BLOB_PROVIDER=azure", async () => {
    process.env.BLOB_PROVIDER = "azure"
    const { getProvider } = await import("./blob-provider")
    expect(getProvider()).toBe("azure")
  })

  it("rejects unknown providers with a clear message", async () => {
    process.env.BLOB_PROVIDER = "s3"
    const { getProvider } = await import("./blob-provider")
    expect(() => getProvider()).toThrow(/Invalid BLOB_PROVIDER/)
  })
})

describe("blob-provider — getBlobStore returns the right adapter", () => {
  it("returns an R2BlobStore when BLOB_PROVIDER=r2", async () => {
    process.env.BLOB_PROVIDER = "r2"
    process.env.R2_ACCESS_KEY_ID = "test"
    process.env.R2_SECRET_ACCESS_KEY = "test"
    process.env.R2_ENDPOINT = "http://127.0.0.1:9000"

    const { getBlobStore } = await import("./blob-provider")
    const { R2BlobStore } = await import("./r2-blob-store")
    const store = await getBlobStore()
    expect(store).toBeInstanceOf(R2BlobStore)
  })

  it("returns an AzureBlobStore when BLOB_PROVIDER=azure", async () => {
    process.env.BLOB_PROVIDER = "azure"
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      "DefaultEndpointsProtocol=http;" +
      "AccountName=devstoreaccount1;" +
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
      "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"

    // Stub `createIfNotExists` so the test doesn't need a running Azurite —
    // we're testing routing, not the adapter's behavior.
    const { BlobServiceClient } = await import("@azure/storage-blob")
    const realFromConn = BlobServiceClient.fromConnectionString
    const fromConnSpy = vi
      .spyOn(BlobServiceClient, "fromConnectionString")
      .mockImplementation((cs) => {
        const real = realFromConn.call(BlobServiceClient, cs)
        const container = real.getContainerClient("vault")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(container as any).createIfNotExists = vi.fn().mockResolvedValue({})
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(real as any).getContainerClient = () => container
        return real
      })

    try {
      const { getBlobStore } = await import("./blob-provider")
      const { AzureBlobStore } = await import("./azure-blob-store")
      const store = await getBlobStore()
      expect(store).toBeInstanceOf(AzureBlobStore)
    } finally {
      fromConnSpy.mockRestore()
    }
  })
})

describe("blob-provider — isBlobConfigured", () => {
  it("returns true for r2 when access key + secret + (account or endpoint) are set", async () => {
    process.env.BLOB_PROVIDER = "r2"
    process.env.R2_ACCESS_KEY_ID = "k"
    process.env.R2_SECRET_ACCESS_KEY = "s"
    process.env.R2_ENDPOINT = "http://x"
    const { isBlobConfigured } = await import("./blob-provider")
    expect(isBlobConfigured()).toBe(true)
  })

  it("returns false for r2 when credentials are missing", async () => {
    process.env.BLOB_PROVIDER = "r2"
    const { isBlobConfigured } = await import("./blob-provider")
    expect(isBlobConfigured()).toBe(false)
  })

  it("returns true for azure when a connection string is set", async () => {
    process.env.BLOB_PROVIDER = "azure"
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=k;"
    const { isBlobConfigured } = await import("./blob-provider")
    expect(isBlobConfigured()).toBe(true)
  })

  it("returns false for azure when no credentials are set", async () => {
    process.env.BLOB_PROVIDER = "azure"
    const { isBlobConfigured } = await import("./blob-provider")
    expect(isBlobConfigured()).toBe(false)
  })
})
