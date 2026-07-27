import { z } from "zod"

const ClientEnvSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_MAX_UPLOAD_MB: z.coerce.number().default(100),
})

export type ClientEnv = z.infer<typeof ClientEnvSchema>

let _clientConfig: ClientEnv | null = null

export function getClientConfig(): ClientEnv {
  if (!_clientConfig) {
    const parsed = ClientEnvSchema.safeParse(import.meta.env as Record<string, string>)
    if (!parsed.success) {
      const errors = (parsed.error as any).errors?.map((e: any) => {
        const path = e.path.join(".")
        const message = e.message
        return `  ${path}: ${message}`
      }).join("\n")
      throw new Error(
        `[config] Invalid client environment variables:\n${errors || "Unknown error"}`
      )
    }
    _clientConfig = parsed.data
  }
  return _clientConfig
}

export function resetClientConfig() {
  _clientConfig = null
}
