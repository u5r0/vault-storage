/**
 * Seed script — populates the dev storage backend (Azurite) with a sample
 * folder tree and a few files via the public API. Doubles as an end-to-end
 * smoke test of the Azure code path.
 *
 * Usage:
 *   1. Start Azurite + API:    pnpm dev   (or `pnpm azurite` + `pnpm dev:api`)
 *   2. In another terminal:    pnpm seed
 */
import "dotenv/config"
import { createVaultClient } from "@vault/sdk"

const API_URL = process.env.SEED_API_URL || `http://localhost:${process.env.PORT || 3001}`
const client = createVaultClient(API_URL)

type FolderSpec = {
  path: string
  name: string
}

type FileSpec = {
  path: string
  name: string
  content: string
  contentType: string
}

const folders: FolderSpec[] = [
  { path: "", name: "Movies" },
  { path: "Movies", name: "Action" },
  { path: "Movies", name: "Documentary" },
  { path: "", name: "Documents" },
  { path: "Documents", name: "Notes" },
  { path: "", name: "Music" },
  { path: "Music", name: "Albums" },
]

const files: FileSpec[] = [
  {
    path: "Documents",
    name: "README.txt",
    contentType: "text/plain",
    content:
      "Welcome to your Vault.\n\nThis sample data was created by `pnpm seed`.\n",
  },
  {
    path: "Documents/Notes",
    name: "ideas.md",
    contentType: "text/markdown",
    content:
      "# Ideas\n\n- Add tags\n- Add stars\n- Build search\n- Implement trash\n",
  },
  {
    path: "Documents",
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
    await client.createFolder({ path: spec.path, name: spec.name })
    console.log(`  + folder  ${spec.path ? spec.path + "/" : ""}${spec.name}`)
  } catch (e) {
    // Folder marker is just a placeholder blob; idempotent enough for seeding.
    console.log(`  · folder  ${spec.path ? spec.path + "/" : ""}${spec.name} (exists)`)
  }
}

async function uploadFile(spec: FileSpec) {
  const blob = new Blob([spec.content], { type: spec.contentType })
  const file = new File([blob], spec.name, { type: spec.contentType })
  await client.uploadFiles({ path: spec.path, files: [file] })
  console.log(`  + file    ${spec.path}/${spec.name}`)
}

async function main() {
  console.log(`Seeding ${API_URL}…`)
  await waitForApi()
  console.log("API ready.\n")

  console.log("Folders:")
  for (const f of folders) await createFolderIfMissing(f)

  console.log("\nFiles:")
  for (const f of files) await uploadFile(f)

  console.log("\nVerifying root listing:")
  const root = await client.listFiles()
  for (const entry of root.entries) {
    console.log(`  ${entry.type === "folder" ? "📁" : "📄"} ${entry.name}`)
  }

  console.log("\nSeed complete.")
}

main().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
