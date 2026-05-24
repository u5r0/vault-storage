import { beforeAll, afterEach } from 'vitest'
import { clearMailpit } from './mailpit'

/**
 * Test fixtures following Epic Web patterns.
 *
 * Fixtures offload complexity from test cases to where it belongs—in the test setup.
 * This reduces duplication and makes tests more readable.
 */

let app: any
let db: any
let blobStore: any

/**
 * Setup the Hono app instance
 */
export async function setupApp() {
  if (!app) {
    const { createApp } = await import('../app')
    app = createApp()
  }
  return app
}

/**
 * Setup the database instance
 */
export async function setupDb() {
  if (!db) {
    const { db: dbInstance } = await import('../db')
    db = dbInstance
  }
  return db
}

/**
 * Setup the blob store instance
 */
export async function setupBlobStore() {
  if (!blobStore) {
    const { getBlobStore } = await import('../lib/azure')
    blobStore = await getBlobStore()
  }
  return blobStore
}

/**
 * Cleanup database users
 */
export async function clearUsers() {
  const db = await setupDb()
  const { resources } = await db.items.query("SELECT * FROM c WHERE c.type = 'user'").fetchAll()
  for (const user of resources) {
    await db.item(user.id).delete()
  }
}

/**
 * Cleanup refresh tokens
 */
export async function clearRefreshTokens() {
  const db = await setupDb()
  const { resources } = await db.items.query("SELECT * FROM c WHERE c.type = 'refresh_token'").fetchAll()
  for (const token of resources) {
    await db.item(token.id).delete()
  }
}

/**
 * Cleanup all database entries
 */
export async function clearDatabase() {
  const db = await setupDb()
  const { resources } = await db.items.readAll().fetchAll()
  for (const resource of resources) {
    if (resource.id) {
      await db.item(resource.id).delete()
    }
  }
}

/**
 * Cleanup only file/folder/spent_token entries — preserves users and refresh tokens.
 * Used by useFilesFixture so a registered user can persist across tests in a suite.
 */
export async function clearFileEntries() {
  const db = await setupDb()
  const { resources } = await db.items
    .query("SELECT * FROM c WHERE c.type = 'file' OR c.type = 'folder' OR c.type = 'spent_token'")
    .fetchAll()
  for (const resource of resources) {
    await db.item(resource.id).delete()
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
    await clearMailpit()
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
    await clearMailpit()
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
