import { inject } from "vitest"

/**
 * Per-worker setup — runs before any server module loads so SMTP is wired
 * to Mailpit before `nodemailer.createTransport()` evaluates.
 */
process.env.SMTP_HOST   = inject("smtpHost")
process.env.SMTP_PORT   = inject("smtpPort")
process.env.SMTP_SECURE = inject("smtpSecure")
process.env.AUTH_SECRET = "integration-test-auth-secret"
process.env.JWT_SECRET  = "integration-test-jwt-secret"
process.env.EMAIL_FROM  = "noreply@vault.test"
process.env.APP_URL     = "http://localhost:3000"
