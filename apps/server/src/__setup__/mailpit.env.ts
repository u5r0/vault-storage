import { inject } from "vitest"

/**
 * Per-worker setup — runs before any server module loads so SMTP is wired
 * to Mailpit before `nodemailer.createTransport(SMTP_URL)` evaluates.
 */
process.env.SMTP_URL   = inject("smtpUrl")
process.env.EMAIL_FROM = "noreply@vault.test"
process.env.APP_URL    = "http://localhost:5173"
