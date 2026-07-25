import crypto from "crypto"
import { getServerConfig } from "./env"
const serverConfig = getServerConfig()
const TOKEN_EXPIRY_SECONDS = 15 * 60 // 15 minutes

interface MagicLinkToken {
  userId: string
  email: string
  expiresAt: number
  nonce: string
  type: "email-verification" | "password-reset" | "login"
}

export function generateMagicLinkToken(
  userId: string,
  email: string,
  type: MagicLinkToken["type"] = "email-verification"
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS
  const nonce = crypto.randomBytes(16).toString("base64url")

  const payload: MagicLinkToken = { userId, email, expiresAt, nonce, type }
  const token = Buffer.from(JSON.stringify(payload)).toString("base64url")

  const signature = crypto
    .createHmac("sha256", serverConfig.AUTH_SECRET)
    .update(token)
    .digest("base64url")

  return `${token}.${signature}`
}

export function verifyMagicLinkToken(token: string): MagicLinkToken | null {
  try {
    const [payload, signature] = token.split(".")

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", serverConfig.AUTH_SECRET)
      .update(payload)
      .digest("base64url")

    if (signature !== expectedSignature) return null

    // Decode and verify expiration
    const data: MagicLinkToken = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    )

    if (data.expiresAt < Math.floor(Date.now() / 1000)) return null

    return data
  } catch {
    return null
  }
}
