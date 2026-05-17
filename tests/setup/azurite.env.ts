import { inject } from "vitest"

/**
 * Per-worker setup. Runs BEFORE any test file's imports, so the server
 * modules see the right `AZURE_STORAGE_CONNECTION_STRING` when they
 * read `process.env` at module load.
 */
process.env.AZURE_STORAGE_CONNECTION_STRING = inject("azuriteConnectionString")
process.env.AZURE_STORAGE_CONTAINER_NAME = inject("azuriteContainer")
// Defaults that the server reads but we don't care about for tests:
process.env.PORT ??= "0"
process.env.ALLOWED_ORIGIN ??= "http://localhost"
