import { z } from "zod"

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  ALLOWED_ORIGIN: z.url().default("http://localhost:3000"),
  BLOB_PROVIDER: z.enum(["azure", "r2"]).default("azure"),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_KEY: z.string().optional(),
  AZURE_STORAGE_CONTAINER_NAME: z.string().default("vault"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("vault"),
  R2_ENDPOINT: z.url().optional(),
  COSMOS_DB_ENDPOINT: z.url().default("https://localhost:8081"),
  COSMOS_DB_KEY: z.string().optional(),
  COSMOS_DB_DATABASE: z.string().default("vault"),
  COSMOS_DB_CONTAINER: z.string().default("vault_entries"),
  COSMOS_DB_LOOKUP_CONTAINER: z.string().default("vault_lookup"),
  COSMOS_DB_AUTH_CONTAINER: z.string().default("vault_auth"),
  AUTH_SECRET: z.string(),
  JWT_SECRET: z.string(),
  ACCESS_EXPIRES_SECONDS: z.coerce.number().default(15 * 60),
  REFRESH_EXPIRES_SECONDS: z.coerce.number().default(7 * 24 * 60 * 60),
  LOGIN_STALL_MS: z.coerce.number().default(250),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  APP_URL: z.url().default("http://localhost:3000"),
  MAX_UPLOAD_MB: z.coerce.number().default(100),
  RATE_LIMIT_DISABLED: z.string().optional().default("0"),
  SEED_API_URL: z.url().optional(),
})

export type ServerEnv = z.infer<typeof ServerEnvSchema>

let _serverConfig: ServerEnv | null = null

const EMULATOR_KEY =
  "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="

export function getServerConfig(): ServerEnv {
  if (!_serverConfig) {
    // eslint-disable-next-line no-process-env
    const env = { ...process.env }
    
    // Set emulator key if needed (before validation)
    const endpoint = env.COSMOS_DB_ENDPOINT || "https://localhost:8081"
    if (!env.COSMOS_DB_KEY && endpoint.includes("localhost")) {
      env.COSMOS_DB_KEY = EMULATOR_KEY
    }
    
    const parsed = ServerEnvSchema.safeParse(env)
    if (!parsed.success) {
      const errors = (parsed.error as any).errors?.map((e: any) => {
        const path = e.path.join(".")
        const message = e.message
        return `  ${path}: ${message}`
      }).join("\n")
      throw new Error(
        `[config] Invalid server environment variables:\n${errors || "Unknown error"}\n\n` +
        `See .env.schema for required variables.`
      )
    }
    _serverConfig = parsed.data
  }
  return _serverConfig
}

export function resetConfigs() {
  _serverConfig = null
}
