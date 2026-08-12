import { beforeAll, afterEach } from 'vitest'
import { clearCapturedEmails } from './email-capture.js'
import { entryPartitionKey } from '../lib/entry-lookup.js'

/**
 * Test fixtures following Epic Web patterns.
 *
 * Fixtures offload complexity from test cases to where it belongs—in the test setup.
 * This reduces duplication and makes tests more readable.
 */

let app: any
let entries: any
let lookup: any
let authContainer: any
let blobStore: any

/**
 * Setup the Hono app instance
 */
export async function setupApp() {
  if (!app) {
    const { createApp } = await import('../app.js')
    app = createApp()
  }
  return app
}

/**
 * Resolve the three logical Cosmos containers (ADR 0028 §3.1):
 *  - entries:       file/folder docs, HPK [/ownerId, /parentId, /id]
 *  - lookup:        id → HPK pointer records, keyed by /id
 *  - authContainer: user / refresh_token / spent_token docs, keyed by /id
 *
 * Cleanup must delete each doc with the partition key its container actually
 * uses, so keep the containers distinct rather than routing everything through
 * the entries proxy.
 */
export async function setupContainers() {
  if (!entries || !lookup || !authContainer) {
    const db = await import('../db.js')
    entries = db.entries
    lookup = db.lookup
    authContainer = db.authContainer
  }
  return { entries, lookup, authContainer }
}

/**
 * Setup the blob store instance — uses the provider abstraction so the
 * fixture works for both Azure (Azurite) and R2 (RustFS) test runs.
 */
export async function setupBlobStore() {
  if (!blobStore) {
    const { getBlobStore } = await import('../lib/blob-provider.js')
    blobStore = await getBlobStore()
  }
  return blobStore
}

/**
 * Cleanup database users. User docs live in the auth container, keyed by /id.
 */
export async function clearUsers() {
  const { authContainer } = await setupContainers()
  const { resources } = await authContainer.items.query("SELECT * FROM c WHERE c.type = 'user'").fetchAll()
  for (const user of resources) {
    await authContainer.item(user.id, user.id).delete()
  }
}

/**
 * Cleanup refresh tokens. Refresh-token docs live in the auth container,
 * keyed by /id.
 */
export async function clearRefreshTokens() {
  const { authContainer } = await setupContainers()
  const { resources } = await authContainer.items.query("SELECT * FROM c WHERE c.type = 'refresh_token'").fetchAll()
  for (const token of resources) {
    await authContainer.item(token.id, token.id).delete()
  }
}

/**
 * Cleanup all data across the three containers. Entries docs need the full
 * hierarchical partition key; auth docs and lookup pointers are keyed by /id.
 */
export async function clearDatabase() {
  const { entries, lookup, authContainer } = await setupContainers()

  const { resources: entryDocs } = await entries.items
    .query("SELECT c.id, c.ownerId, c.parentId FROM c")
    .fetchAll()
  for (const doc of entryDocs) {
    await entries.item(doc.id, entryPartitionKey({ id: doc.id, ownerId: doc.ownerId, parentId: doc.parentId ?? null })).delete()
  }

  for (const container of [lookup, authContainer]) {
    const { resources } = await container.items.readAll().fetchAll()
    for (const doc of resources) {
      if (doc.id) await container.item(doc.id, doc.id).delete()
    }
  }
}

/**
 * Cleanup file/folder entries (+ their lookup pointers) and spent-token docs —
 * preserves users and refresh tokens. Used by useFilesFixture so a registered
 * user can persist across tests in a suite.
 *
 * Entries deletes use the full [ownerId, parentId, id] hierarchical key;
 * spent-token docs live in the auth container and are keyed by /id.
 */
export async function clearFileEntries() {
  const { entries, lookup, authContainer } = await setupContainers()

  const { resources: fileDocs } = await entries.items
    .query("SELECT c.id, c.ownerId, c.parentId FROM c WHERE c.type = 'file' OR c.type = 'folder'")
    .fetchAll()
  for (const doc of fileDocs) {
    await entries.item(doc.id, entryPartitionKey({ id: doc.id, ownerId: doc.ownerId, parentId: doc.parentId ?? null })).delete()
    await lookup.item(doc.id, doc.id).delete().catch(() => {})
  }

  const { resources: spentTokens } = await authContainer.items
    .query("SELECT * FROM c WHERE c.type = 'spent_token'")
    .fetchAll()
  for (const doc of spentTokens) {
    await authContainer.item(doc.id, doc.id).delete()
  }
}

/**
 * Cleanup blob store
 */
export async function clearBlobStore() {
  const store = await setupBlobStore()
  await store.deletePrefix("")
}

/**
 * Use auth test fixture - sets up app and clears auth-related data
 * Returns the app instance for use in tests
 */
export function useAuthFixture() {
  let appInstance: any

  beforeAll(async () => {
    appInstance = await setupApp()
  })

  afterEach(async () => {
    await clearCapturedEmails()
    await clearUsers()
    await clearRefreshTokens()
  })

  return () => appInstance
}

/**
 * Use files test fixture - sets up app and clears files-related data
 * Returns the app instance for use in tests
 */
export function useFilesFixture() {
  let appInstance: any

  beforeAll(async () => {
    appInstance = await setupApp()
  })

  afterEach(async () => {
    await clearCapturedEmails()
    await clearBlobStore()
    await clearFileEntries()
  })

  return () => appInstance
}

/**
 * Extract a valid `Cookie` request header string from a response's Set-Cookie headers.
 *
 * `headers.get("set-cookie")` joins multiple Set-Cookie values with ", " which embeds
 * cookie attributes (Path, HttpOnly, SameSite…) into the string. Sending that verbatim
 * as a Cookie header breaks cookie parsers for any cookie that isn't first in the list.
 * This helper pulls only the name=value part from every Set-Cookie entry.
 */
export function parseCookies(res: Response): string {
  const getSetCookie = (res.headers as any).getSetCookie
  const parts: string[] = typeof getSetCookie === "function"
    ? getSetCookie.call(res.headers)
    : (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,\s]+=)/)
  return parts.map((s) => s.split(";")[0].trim()).join("; ")
}
