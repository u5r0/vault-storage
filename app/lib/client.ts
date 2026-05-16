import { createVaultClient, type VaultStore } from "@vault/sdk"

export const client: VaultStore = createVaultClient(import.meta.env.VITE_API_URL || "")
