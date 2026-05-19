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
import { nanoid } from "nanoid"

const API_URL = process.env.SEED_API_URL || `http://localhost:${process.env.PORT || 3001}`
const client = createVaultClient(API_URL)

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

async function main() {
  console.log(`Seeding ${API_URL}…`)
  await waitForApi()
  console.log("API ready.\n")

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
