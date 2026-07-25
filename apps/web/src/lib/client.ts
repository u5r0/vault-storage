import { createVaultClient, type VaultStore } from "@vault/sdk"
import { getClientConfig } from "./env"

export const client: VaultStore = createVaultClient(getClientConfig().VITE_API_URL || "")
