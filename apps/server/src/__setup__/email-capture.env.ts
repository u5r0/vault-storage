/**
 * Per-worker setup — runs before any server module loads so the email module
 * initializes with the test secrets and (crucially) without RESEND_API_KEY,
 * which makes `lib/email.ts` capture messages in-memory instead of hitting
 * the Resend API.
 */
process.env.AUTH_SECRET = "integration-test-auth-secret"
process.env.JWT_SECRET  = "integration-test-jwt-secret"
process.env.EMAIL_FROM  = "noreply@vault.test"
process.env.APP_URL     = "http://localhost:3000"
