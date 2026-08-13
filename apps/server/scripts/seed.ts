/**
 * Seed script — populates the dev storage backend via the API, exercising the
 * same code path as production (SDK → API → Cosmos + Azurite).
 *
 * Usage:
 *   1. Start docker-compose:  docker compose up -d
 *   2. Start API:             pnpm dev:api
 *   3. In another terminal:   pnpm seed
 */
import "dotenv/config"
import { createVaultClient } from "@vault/sdk"
import { entries as entriesContainer, authContainer } from "../src/db"
import { getBlobStore } from "../src/lib/blob-provider"
import { generateMagicLinkToken } from "../src/lib/magic-link"
import { getServerConfig } from "../src/lib/env"
import { entryPartitionKey } from "../src/lib/entry-lookup"

const serverConfig = getServerConfig()
const API_URL = serverConfig.SEED_API_URL || `http://localhost:${serverConfig.PORT}`
const client = createVaultClient(API_URL)

/**
 * Password must satisfy RegisterBody rules (ADR 0002 / schemas.ts):
 * ≥ 12 chars, at least one letter, at least one digit.
 */
const DEMO_USER = {
  email: "demo@vault.app",
  password: "Demo12345678",
  name: "Demo User",
}

const FILES_PER_UPLOAD = 10

// ── Types ────────────────────────────────────────────────────────────────────

type FileSpec = {
  parentPath: string
  name: string
  content: string
  contentType: string
}

type FolderSpec = {
  parentPath: string | null
  name: string
}

const folderIds = new Map<string, string>()

// ── Folder structure ─────────────────────────────────────────────────────────

const folderSpecs: FolderSpec[] = [
  { parentPath: null, name: "Documents" },
  { parentPath: null, name: "Photos" },
  { parentPath: null, name: "Music" },
  { parentPath: null, name: "Movies" },
  { parentPath: null, name: "Projects" },
  { parentPath: null, name: "Archive" },
  { parentPath: null, name: "Downloads" },
  { parentPath: null, name: "Inbox" },
  { parentPath: "Documents", name: "Reports" },
  { parentPath: "Documents", name: "Invoices" },
  { parentPath: "Documents", name: "Contracts" },
  { parentPath: "Documents", name: "Notes" },
  { parentPath: "Photos", name: "2024" },
  { parentPath: "Photos", name: "2025" },
  { parentPath: "Photos", name: "Family" },
  { parentPath: "Music", name: "Albums" },
  { parentPath: "Music", name: "Playlists" },
  { parentPath: "Movies", name: "Action" },
  { parentPath: "Movies", name: "Documentary" },
]

// ── File generators ──────────────────────────────────────────────────────────

const txt = (s: string) => ({ contentType: "text/plain", content: s })
const md = (s: string) => ({ contentType: "text/markdown", content: s })
const json = (o: unknown) => ({ contentType: "application/json", content: JSON.stringify(o, null, 2) })

const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
const subjects = ["alpha","beta","gamma","delta","omega","phoenix","atlas","horizon","summit","voyager"]

function generateFiles(): FileSpec[] {
  const files: FileSpec[] = []

  files.push({ parentPath: "Documents", name: "README.md", ...md(
    "# Vault demo dataset\n\nTry:\n- search **report**, **invoice**, **2024**, **vacation**\n- open **Photos/2024** to see pagination kick in (>100 items)\n- ⌘K / Ctrl+K to focus search\n",
  )})

  for (const s of subjects) files.push({ parentPath: "Inbox", name: `${s}-spec.md`, ...md(`# ${s} spec\n\nDraft notes for project ${s}.`) })
  for (const m of months) files.push({ parentPath: "Inbox", name: `meeting-${m}-2025.txt`, ...txt(`Meeting notes for ${m} 2025.`) })

  for (const year of [2024, 2025]) {
    for (const q of [1, 2, 3, 4]) files.push({ parentPath: "Documents.Reports", name: `report-q${q}-${year}.md`, ...md(`# Q${q} ${year} report\n\nSummary, metrics, outlook.`) })
    for (const m of months.slice(0, year === 2025 ? 8 : 12)) files.push({ parentPath: "Documents.Reports", name: `report-${m}-${year}.md`, ...md(`# ${m} ${year} report\n`) })
  }

  for (const year of [2024, 2025]) {
    for (let i = 1; i <= 12; i++) {
      const num = String(i).padStart(2, "0")
      files.push({ parentPath: "Documents.Invoices", name: `invoice-${year}-${num}.pdf.txt`, ...txt(`Invoice #${year}${num}\nAmount: $${(i * 137) % 5000}.00\n`) })
    }
  }

  for (const s of subjects) files.push({ parentPath: "Documents.Contracts", name: `contract-${s}.md`, ...md(`# Contract: ${s}\n\nSigned 2025.`) })
  files.push({ parentPath: "Documents.Contracts", name: "nda-template.md", ...md("# NDA template\n") })
  files.push({ parentPath: "Documents.Contracts", name: "saas-agreement.md", ...md("# SaaS agreement\n") })

  files.push({ parentPath: "Documents.Notes", name: "ideas.md", ...md("# Ideas\n\n- Add tags\n- Add stars\n- Build search\n- Implement trash\n") })
  files.push({ parentPath: "Documents.Notes", name: "todo.md", ...md("# Todo\n\n- [ ] write design doc\n- [x] fix login bug\n") })
  files.push({ parentPath: "Documents.Notes", name: "config.json", ...json({ theme: "dark", layout: "list" }) })
  for (const s of subjects.slice(0, 7)) files.push({ parentPath: "Documents.Notes", name: `note-${s}.md`, ...md(`# Note: ${s}\n`) })

  const events2024 = ["vacation","birthday","wedding","trip","family","hike","concert","graduation"]
  for (let i = 0; i < 120; i++) {
    files.push({ parentPath: "Photos.2024", name: `${events2024[i % 8]}-${months[i % 12]}-2024-${String(i + 1).padStart(3, "0")}.jpg`, ...txt(`fake jpeg bytes for ${events2024[i % 8]} #${i + 1}`) })
  }

  const events2025 = ["beach","summit","festival","trip","skiing","park"]
  for (let i = 0; i < 80; i++) {
    files.push({ parentPath: "Photos.2025", name: `${events2025[i % 6]}-${months[i % 12]}-2025-${String(i + 1).padStart(3, "0")}.jpg`, ...txt(`fake jpeg bytes for ${events2025[i % 6]} #${i + 1}`) })
  }

  for (let i = 0; i < 20; i++) files.push({ parentPath: "Photos.Family", name: `family-portrait-${String(i + 1).padStart(2, "0")}.jpg`, ...txt(`portrait #${i + 1}`) })

  for (const s of subjects) files.push({ parentPath: "Music.Albums", name: `${s}-album.txt`, ...txt(`Album metadata for ${s}.`) })
  for (let i = 0; i < 5; i++) files.push({ parentPath: "Music.Albums", name: `mixtape-${String(i + 1).padStart(2, "0")}.txt`, ...txt(`Mixtape #${i + 1}`) })

  const moods = ["focus","chill","workout","morning","evening","drive","rainy-day","summer","winter","party"]
  for (const m of moods) files.push({ parentPath: "Music.Playlists", name: `${m}-playlist.json`, ...json({ mood: m, tracks: 12 }) })

  const action = ["city-of-shadows","thunder-strike","iron-horizon","rapid-fire","midnight-run","steel-fury","echo-protocol","ghost-blade","neon-knights","savage-tide","burning-skyline","cobra-code"]
  for (const t of action) files.push({ parentPath: "Movies.Action", name: `${t}.txt`, ...txt(`Movie metadata: ${t}`) })

  const docs = ["the-quiet-ocean","voices-of-the-summit","code-of-the-city","silent-frontiers","rivers-of-glass","after-the-storm","circuits-of-tomorrow","the-long-road","an-honest-craft","open-fields"]
  for (const t of docs) files.push({ parentPath: "Movies.Documentary", name: `${t}.txt`, ...txt(`Documentary: ${t}`) })

  for (const s of subjects) files.push({ parentPath: "Projects", name: `${s}-roadmap.md`, ...md(`# ${s} roadmap\n\nMilestones, timelines, owners.`) })
  files.push({ parentPath: "Projects", name: "kickoff-2025.md", ...md("# 2025 kickoff\n") })
  files.push({ parentPath: "Projects", name: "retro-template.md", ...md("# Retro template\n") })

  for (let i = 0; i < 15; i++) files.push({ parentPath: "Archive", name: `legacy-export-${String(i + 1).padStart(3, "0")}.json`, ...json({ exportId: i + 1, createdAt: `2023-${String((i % 12) + 1).padStart(2, "0")}-15` }) })

  for (let i = 0; i < 10; i++) files.push({ parentPath: "Downloads", name: `installer-v${i + 1}.0.0.txt`, ...txt(`Pretend installer payload v${i + 1}.0.0`) })
  for (let i = 0; i < 10; i++) files.push({ parentPath: "Downloads", name: `receipt-${String(i + 1).padStart(3, "0")}.txt`, ...txt(`Receipt #${i + 1}`) })

  return files
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForApi(timeoutMs = 15_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${API_URL}/api/health`)
      if (r.ok) return
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`API not reachable at ${API_URL} after ${timeoutMs}ms`)
}

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 5): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (i === retries) throw e
      const msg = (e?.message ?? "").toLowerCase()
      const retryable =
        msg.includes("too many") || msg.includes("backend throttled") ||
        msg.includes("timeout") || msg.includes("etimedout") ||
        msg.includes("econnreset") || msg.includes("socket hang up")
      if (!retryable) throw e
      const delay = Math.min(1000 * Math.pow(2, i), 10_000)
      console.log(`    ${label}: retry ${i + 1}/${retries} in ${delay}ms…`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error("unreachable")
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("Cleaning up existing data…")

  try {
    // Wipe every blob via the configured provider's adapter — works for
    // Azure (Azurite) and R2 (RustFS / production R2) without branching.
    const store = await getBlobStore()
    const count = await store.deletePrefix("")
    console.log(`  ${count} blob(s) deleted`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  blob cleanup: ${msg}`)
  }

  // Auth docs (user, refresh_token, spent_token) live in vault_auth keyed by
  // /id — simple scalar partition key, no HPK needed.
  try {
    const { resources: authDocs } = await authContainer.items
      .query({ query: "SELECT c.id, c.type FROM c" })
      .fetchAll()
    const authToDelete = authDocs.filter((d: unknown) => {
      const doc = d as { type?: string }
      return ["user", "refresh_token", "spent_token"].includes(doc.type ?? "")
    })
    for (const doc of authToDelete) {
      const { id } = doc as { id: string }
      await authContainer.item(id, id).delete()
    }
    const authCounts = authToDelete.reduce((acc: Record<string, number>, d: unknown) => {
      const doc = d as { type: string }
      acc[doc.type] = (acc[doc.type] ?? 0) + 1
      return acc
    }, {})
    console.log(`  cleared auth docs:`, authCounts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`auth doc cleanup failed: ${msg}`, { cause: e })
  }

  // File/folder docs live in vault_entries with HPK [/ownerId, /parentId, /id].
  // SELECT must return ownerId and parentId so we can build the full partition
  // key array — a scalar /id delete is rejected by the vnext emulator on a
  // MultiHash container.
  try {
    const { resources: entryDocs } = await entriesContainer.items
      .query({ query: "SELECT c.id, c.type, c.ownerId, c.parentId FROM c" })
      .fetchAll()
    const entriesToDelete = entryDocs.filter((d: unknown) => {
      const doc = d as { type?: string }
      return ["file", "folder"].includes(doc.type ?? "")
    })
    for (const doc of entriesToDelete) {
      const { id, ownerId, parentId } = doc as { id: string; ownerId: string; parentId: string | null }
      // Full HPK array [ownerId, parentId, id] required for MultiHash container.
      await entriesContainer.item(id, entryPartitionKey({ id, ownerId, parentId })).delete()
    }
    const entryCounts = entriesToDelete.reduce((acc: Record<string, number>, d: unknown) => {
      const doc = d as { type: string }
      acc[doc.type] = (acc[doc.type] ?? 0) + 1
      return acc
    }, {})
    console.log(`  cleared entry docs:`, entryCounts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`entry doc cleanup failed: ${msg}`, { cause: e })
  }

  console.log()
}

// ── Demo user ────────────────────────────────────────────────────────────────

/**
 * Provision the demo user through the API, then exchange a locally-generated
 * magic-link token to become verified AND authenticated.
 *
 * The register call still runs through the real API (creating the user and
 * queuing its email), but instead of reading that email back out of a shared
 * SMTP inbox we generate the identical token ourselves using the shared
 * AUTH_SECRET and hand it to client.verify() — the same endpoint the email
 * link would hit. This removes the Mailpit/nodemailer dependency without
 * bypassing the verification code path (ADR 0019 §B6).
 *
 * Flow:
 *   register → find user in Cosmos → generateMagicLinkToken(id, email, type)
 *   → client.verify(token) → user verified + SDK cookie jar has session cookies
 */
async function ensureDemoUser(): Promise<void> {
  // POST /api/auth/register — always returns 200 regardless of whether the
  // email is new, already verified, or unverified.
  await client.register({
    email: DEMO_USER.email,
    password: DEMO_USER.password,
    name: DEMO_USER.name,
  })

  // Find the freshly-created user to determine its id and verified state.
  // Poll briefly: Cosmos session consistency can lag a write from a separate
  // process (the API server) to this one (the seed CLI).
  const user = await pollForUser(DEMO_USER.email)

  // Mirrors the API's register()/requestMagicLink() token choice:
  //   unverified → email-verification token
  //   verified   → login token
  const tokenType = user.verified === "1" ? "login" : "email-verification"
  const token = generateMagicLinkToken(user.id, user.email, tokenType)

  // client.verify() calls GET /api/auth/verify through the SDK's request()
  // method, which captures the Set-Cookie headers into the tough-cookie jar.
  // The /verify endpoint issues session cookies per ADR 0019 §B6, so after
  // this call the SDK is fully authenticated for all subsequent API calls.
  await client.verify(token)

  // Self-check: prove that DEMO_USER.password actually authenticates against
  // the stored hash. A separate client (fresh cookie jar) so the verify
  // session can't mask a broken password login.
  const probe = createVaultClient(API_URL)
  try {
    await probe.login({ email: DEMO_USER.email, password: DEMO_USER.password })
  } catch (e: any) {
    throw new Error(
      `Demo user provisioned but password login failed: ${e.message ?? e}. ` +
      `This usually means a stale duplicate user document survived cleanup.`, { cause: e },
    )
  }

  console.log(`  demo user ready: ${DEMO_USER.email}`)
}

async function pollForUser(email: string, timeoutMs = 10_000): Promise<any> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { resources } = await authContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.type = @type AND c.email = @email",
        parameters: [
          { name: "@type", value: "user" },
          { name: "@email", value: email },
        ],
      })
      .fetchAll()
    if (resources.length > 0) return resources[0]
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Demo user not found after register: ${email}`)
}

// ── Seed via SDK ─────────────────────────────────────────────────────────────

async function createFolders() {
  for (const spec of folderSpecs) {
    const parentId = spec.parentPath ? folderIds.get(spec.parentPath) ?? null : null
    const result = await withRetry(
      () => client.createFolder({ parentId, name: spec.name }),
      `folder ${spec.name}`,
    )
    const path = spec.parentPath ? `${spec.parentPath}.${spec.name}` : spec.name
    folderIds.set(path, result.id)
  }
}

async function uploadFiles(files: FileSpec[]) {
  const byParent = new Map<string, FileSpec[]>()
  for (const f of files) {
    const list = byParent.get(f.parentPath) ?? []
    list.push(f)
    byParent.set(f.parentPath, list)
  }

  let done = 0
  for (const [parentPath, list] of byParent) {
    const parentId = folderIds.get(parentPath)
    if (!parentId) { console.log(`  ! skipped ${list.length} files — parent ${parentPath} unknown`); continue }

    for (let i = 0; i < list.length; i += FILES_PER_UPLOAD) {
      const batch = list.slice(i, i + FILES_PER_UPLOAD)
      const fileObjects = batch.map((spec) => {
        const blob = new Blob([spec.content], { type: spec.contentType })
        return new File([blob], spec.name, { type: spec.contentType })
      })

      await withRetry(
        () => client.uploadFiles({ parentId, files: fileObjects }),
        `upload to ${parentPath}`,
      )

      done += batch.length
      process.stdout.write(`  ${done}/${files.length}\r`)
    }
  }
  process.stdout.write(`  ${done}/${files.length} ✓\n`)
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${API_URL}…\n`)

  await waitForApi()
  console.log("API ready.\n")

  await cleanup()

  console.log("Demo user:")
  await ensureDemoUser()
  console.log(`  Credentials: ${DEMO_USER.email} / ${DEMO_USER.password}\n`)

  console.log(`Creating ${folderSpecs.length} folders…`)
  await createFolders()
  console.log(`  ${folderIds.size} folder(s) created\n`)

  const files = generateFiles()
  console.log(`Uploading ${files.length} files…`)
  await uploadFiles(files)

  console.log("\nSeed complete ✓")
  console.log("  Photos/2024 has 120+ items (exercises pagination)")
  console.log("  Search: 'report', 'invoice', 'vacation', 'alpha'")
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message ?? err)
  process.exit(1)
})
