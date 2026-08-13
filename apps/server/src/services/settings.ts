import { HTTPException } from "hono/http-exception"
import { authContainer as authDb } from "../db.js"
import { getServerConfig } from "../lib/env.js"

const serverConfig = getServerConfig()

async function readUserDoc(ownerId: string): Promise<any> {
  const { resource: user } = await authDb.item(ownerId, ownerId).read()
  if (!user || user.type !== "user") {
    throw new HTTPException(401, { message: "Unauthenticated" })
  }
  return user
}

export class SettingsService {
  async getSettings(ownerId: string): Promise<{ maxUploadMb: number | null }> {
    const user = await readUserDoc(ownerId)
    return { maxUploadMb: user.maxUploadMb ?? null }
  }

  async updateMaxUploadMb(ownerId: string, maxUploadMb: number | null): Promise<{ maxUploadMb: number | null }> {
    const user = await readUserDoc(ownerId)

    // Global default is the hard cap — a per-account limit can only lower it.
    const cap = serverConfig.MAX_UPLOAD_MB
    const normalized =
      maxUploadMb === null ? null : Math.min(Math.max(1, Math.floor(maxUploadMb)), cap)

    await authDb.item(user.id, user.id).replace({ ...user, maxUploadMb: normalized })
    return { maxUploadMb: normalized }
  }
}

export const settingsService = new SettingsService()
