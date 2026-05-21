import { inject } from "vitest"

// Belt-and-suspenders: ensure each worker process also trusts the emulator cert.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const cosmosDbName = inject("cosmosDbName")
const cosmosContainer = inject("cosmosContainer")

if (cosmosDbName) {
  process.env.COSMOS_DB_DATABASE = cosmosDbName as string
}
if (cosmosContainer) {
  process.env.COSMOS_DB_CONTAINER = cosmosContainer as string
}
