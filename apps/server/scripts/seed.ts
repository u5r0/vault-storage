/**
 * Seed script — populates the dev storage backend (Azurite + Cosmos DB) with a sample
 * folder tree and a few files via the public API. Doubles as an end-to-end
 * smoke test of the Azure code path.
 *
 * Usage:
 *   1. Start docker-compose:  docker compose up -d
 *   2. Start API:            pnpm dev:api
 *   3. In another terminal:  pnpm seed
 */
import "dotenv/config"
import { createVaultClient } from "@vault/sdk"
import { v4 as uuidv4 } from "uuid"
import { hashPassword } from "../src/lib/auth"
import { db } from "../src/db"
import { getContainer } from "../src/lib/azure"

const API_URL = process.env.SEED_API_URL || `http://localhost:${process.env.PORT || 3001}`
const client = createVaultClient(API_URL)

// Demo user details for development/testing
const DEMO_USER = {
  email: "demo@vault.app",
  password: "demo123456",
  name: "Demo User",
}

type FolderSpec = {
  name: string
}

type FileSpec = {
  parentId: string | null
  name: string
  content: string
  contentType: string
}

const folders: FolderSpec[] = [
  { name: "Movies" },
  { name: "Documents" },
  { name: "Music" },
]

// Will be populated with IDs after creation
const folderIds: Record<string, string> = {}

const subFolders: Array<{ parentId: string; name: string }> = [
  { parentId: "Movies", name: "Action" },
  { parentId: "Movies", name: "Documentary" },
  { parentId: "Documents", name: "Notes" },
  { parentId: "Music", name: "Albums" },
]

const files: FileSpec[] = [
  {
    parentId: "Documents",
    name: "README.txt",
    contentType: "text/plain",
    content:
      "Welcome to your Vault.\n\nThis sample data was created by `pnpm seed`.\n",
  },
  {
    parentId: "Notes",
    name: "ideas.md",
    contentType: "text/markdown",
    content:
      "# Ideas\n\n- Add tags\n- Add stars\n- Build search\n- Implement trash\n",
  },
  {
    parentId: "Documents",
    name: "config.json",
    contentType: "application/json",
    content: JSON.stringify({ theme: "dark", layout: "list" }, null, 2),
  },
]

async function waitForApi(timeoutMs = 15_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${API_URL}/api/health`)
      if (r.ok) {
        const j = (await r.json()) as { azureConfigured: boolean }
        if (j.azureConfigured) return
        throw new Error("Azure not configured — check .env")
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`API not reachable at ${API_URL} after ${timeoutMs}ms`)
}

async function createFolderIfMissing(spec: FolderSpec) {
  try {
    const result = await client.createFolder({ parentId: null, name: spec.name })
    folderIds[spec.name] = result.id
    console.log(`  + folder  ${spec.name} (${result.id})`)
  } catch (e: any) {
    // Folder might already exist
    console.log(`  · folder  ${spec.name} (exists or error: ${e.message})`)
  }
}

async function createSubFolder(spec: { parentId: string; name: string }) {
  const parentId = folderIds[spec.parentId]
  if (!parentId) {
    console.log(`  ! subfolder ${spec.name} - parent ${spec.parentId} not found`)
    return
  }
  try {
    const result = await client.createFolder({ parentId, name: spec.name })
    folderIds[spec.name] = result.id
    console.log(`  + subfolder  ${spec.name} under ${spec.parentId} (${result.id})`)
  } catch (e: any) {
    console.log(`  · subfolder  ${spec.name} (exists or error: ${e.message})`)
  }
}

async function uploadFile(spec: FileSpec) {
  const parentId = spec.parentId ? folderIds[spec.parentId] : null
  const blob = new Blob([spec.content], { type: spec.contentType })
  const file = new File([blob], spec.name, { type: spec.contentType })
  await client.uploadFiles({ parentId: parentId ?? undefined, files: [file] })
  console.log(`  + file    ${spec.name} under ${spec.parentId || "root"}`)
}

async function withRetry<T>(fn: () => Promise<T>, operation: string, maxRetries = 5): Promise<T> {
  let lastError: Error = new Error("Max retries exceeded")
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      lastError = e
      if (e.code === 429 || e.message?.includes("429") || e.message?.includes("Too many")) {
        const delay = Math.pow(2, attempt) * 1000 // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        console.log(`    ${operation} rate limited, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw e // Non-rate-limit errors should fail immediately
      }
    }
  }
  throw lastError
}

async function cleanup() {
  console.log("Cleaning up existing data...")

  // Delete all blobs from Azure container
  try {
    const container = await getContainer()
    console.log("  Deleting blobs...")
    for await (const blob of container.listBlobsFlat()) {
      await container.deleteBlob(blob.name)
    }
    console.log("  Blobs deleted")
  } catch (e: any) {
    console.log(`  Blob cleanup failed: ${e.message}`)
  }

  // Delete all documents from Cosmos DB (except demo user) with retry
  try {
    console.log("  Deleting documents...")
    const { resources } = await withRetry(
      () => db.items.query("SELECT * FROM c").fetchAll(),
      "Query"
    )
    console.log(`    Found ${resources.length} documents`)
    for (const item of resources) {
      try {
        if (item.email !== DEMO_USER.email) {
          // Use email as partition key for users, id for other documents
          const partitionKey = item.email || item.id
          await withRetry(
            () => db.item(item.id, partitionKey).delete(),
            `Delete ${item.id}`
          )
        }
      } catch (deleteError: any) {
        if (deleteError.code !== 404) {
          console.log(`    Failed to delete ${item.id}: ${deleteError.message}`)
        }
      }
    }
    console.log("  Documents deleted (demo user preserved)")
  } catch (e: any) {
    console.log(`  Document cleanup failed: ${e.message}`)
    console.log(`  Continuing anyway...`)
  }

  console.log("Cleanup complete.\n")
}

async function createDemoUserIfMissing() {
  try {
    // First check if user exists and update it if missing type field
    const querySpec = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: DEMO_USER.email }],
    }
    const { resources } = await db.items.query(querySpec).fetchAll()
    const existingUser = resources[0]

    if (existingUser) {
      // Update existing user to add type field if missing
      if (!existingUser.type) {
        const passwordHash = await hashPassword(DEMO_USER.password)
        await db.item(existingUser.id, DEMO_USER.email).replace({
          ...existingUser,
          type: "user",
          passwordHash,
          verified: "1",
        })
        console.log(`  Demo user updated with type field: ${DEMO_USER.email}`)
      } else {
        console.log(`  Demo user already exists with correct schema: ${DEMO_USER.email}`)
      }
      return
    }

    // Create verified user directly in database (bypasses magic link)
    const passwordHash = await hashPassword(DEMO_USER.password)
    const userId = uuidv4()
    await db.items.create({
      id: userId,
      type: "user",
      email: DEMO_USER.email,
      passwordHash,
      verified: "1",
      createdAt: new Date().toISOString(),
    })
    console.log(`  Demo user created: ${DEMO_USER.email}`)
  } catch (e: any) {
    if (e.code === 409) {
      console.log(`  Demo user already exists: ${DEMO_USER.email}`)
    } else if (e.code === 429) {
      console.log(`  Rate limited - retrying in 1s...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
      await createDemoUserIfMissing()
    } else {
      console.log(`  Demo user creation failed: ${e.message}`)
      console.log(`  Error code: ${e.code}`)
      console.log(`  Continuing anyway...`)
    }
  }
}

async function main() {
  console.log(`Seeding ${API_URL}…`)
  await waitForApi()
  console.log("API ready.\n")

  // Cleanup existing data
  await cleanup()

  // Create demo user directly in database (bypasses magic link verification)
  console.log("Creating demo user...")
  await createDemoUserIfMissing()

  console.log("\nDemo user credentials:")
  console.log(`  Email:    ${DEMO_USER.email}`)
  console.log(`  Password: ${DEMO_USER.password}`)
  console.log(`  Name:     ${DEMO_USER.name}\n`)

  console.log("Root folders:")
  for (const f of folders) await createFolderIfMissing(f)

  console.log("\nSubfolders:")
  for (const f of subFolders) await createSubFolder(f)

  console.log("\nFiles:")
  for (const f of files) await uploadFile(f)

  console.log("\nVerifying root listing:")
  const root = await client.listFiles()
  for (const entry of root.entries) {
    console.log(`  ${entry.type === "folder" ? "📁" : "📄"} ${entry.name} (${entry.id})`)
  }

  console.log("\nSeed complete.")
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
