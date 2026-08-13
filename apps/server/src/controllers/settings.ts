import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { authenticate } from "../middleware/authenticate.js"
import { userRateLimit } from "../middleware/rate-limit.js"
import { createUserReadLimiter, createUserWriteLimiter } from "../lib/rate-limiter.js"
import { UpdateSettingsInput } from "@vault/sdk"
import { settingsService } from "../services/settings.js"

const readLimiter  = createUserReadLimiter()
const writeLimiter = createUserWriteLimiter()

const settings = new Hono()

settings.use("*", authenticate())

settings.get("/", userRateLimit(readLimiter), async (c) => {
  const ownerId = (c as any).get("userId") as string
  const result = await settingsService.getSettings(ownerId)
  return c.json(result)
})

settings.patch(
  "/",
  userRateLimit(writeLimiter),
  zValidator("json", UpdateSettingsInput),
  async (c) => {
    const ownerId = (c as any).get("userId") as string
    const { maxUploadMb } = c.req.valid("json")
    const result = await settingsService.updateMaxUploadMb(ownerId, maxUploadMb)
    return c.json(result)
  },
)

export default settings
