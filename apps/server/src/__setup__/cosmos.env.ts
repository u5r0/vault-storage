import { inject } from "vitest"

// No NODE_TLS_REJECT_UNAUTHORIZED here: the emulator's self-signed cert is
// handled by the scoped https.Agent on the Cosmos client (emulatorTlsAgent in
// apps/server/src/lib/cosmos-credentials.ts), which the app code picks up via
// db.ts. TLS verification stays on process-wide in tests too.

const cosmosDbName = inject("cosmosDbName")
const cosmosEntriesContainer = inject("cosmosEntriesContainer")
const cosmosLookupContainer = inject("cosmosLookupContainer")
const cosmosAuthContainer = inject("cosmosAuthContainer")

if (cosmosDbName) {
  process.env.COSMOS_DB_DATABASE = cosmosDbName
}
// Env var names must match apps/server/src/db.ts's getContainerName() exactly
// — that's the only thing standing between the 3-container test DB and the
// app code resolving the right container per kind.
if (cosmosEntriesContainer) {
  process.env.COSMOS_DB_CONTAINER = cosmosEntriesContainer
}
if (cosmosLookupContainer) {
  process.env.COSMOS_DB_LOOKUP_CONTAINER = cosmosLookupContainer
}
if (cosmosAuthContainer) {
  process.env.COSMOS_DB_AUTH_CONTAINER = cosmosAuthContainer
}
