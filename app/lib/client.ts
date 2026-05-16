import { createVaultClient } from "@vault/sdk"

export const client = createVaultClient(import.meta.env.VITE_API_URL || "http://localhost:3001")
