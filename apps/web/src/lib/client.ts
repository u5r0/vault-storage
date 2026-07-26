import { createVaultClient, type VaultStore } from "@vault/sdk"
import { getClientConfig } from "./env"

const API_BASE = getClientConfig().VITE_API_URL || ""

export const client: VaultStore = createVaultClient(API_BASE)
