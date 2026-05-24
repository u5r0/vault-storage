/**
 * Test-side Mailpit client. Used by integration tests to receive the actual
 * email a controller sent, instead of asserting on a `vi.mock` of the email
 * module. Aligns with ADR 0005's Epic Web principle: avoid mocks when a
 * real dependency is cheap.
 *
 * Mailpit HTTP API: https://mailpit.axllent.org/docs/api-v1/
 */

const MAILPIT_API = "http://127.0.0.1:8025"

export interface MailpitMessage {
  ID: string
  From: { Address: string; Name: string }
  To: { Address: string; Name: string }[]
  Subject: string
  Snippet: string
  Created: string
}

export interface MailpitMessageDetail extends MailpitMessage {
  Text: string
  HTML: string
}

/** Drain Mailpit's inbox. Call in afterEach so each test starts clean. */
export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_API}/api/v1/messages`, { method: "DELETE" })
}

/** List all messages (newest first per Mailpit's default ordering). */
export async function listMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT_API}/api/v1/messages`)
  const data = (await res.json()) as { messages?: MailpitMessage[] }
  return data.messages ?? []
}

/** Get all messages addressed to `email`, optionally filtered by subject substring. */
export async function getMessagesFor(
  email: string,
  subjectIncludes?: string,
): Promise<MailpitMessage[]> {
  const all = await listMessages()
  return all.filter(
    (m) =>
      m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()) &&
      (subjectIncludes == null || m.Subject.includes(subjectIncludes)),
  )
}

/** Fetch full body (Text + HTML) by ID. */
export async function getMessage(id: string): Promise<MailpitMessageDetail> {
  const res = await fetch(`${MAILPIT_API}/api/v1/message/${id}`)
  return (await res.json()) as MailpitMessageDetail
}

/**
 * Wait until at least one matching email arrives, then return the latest.
 * Polls because email send is fire-and-forget; the controller responds 200
 * before the SMTP round-trip completes in some paths.
 *
 * Mailpit returns messages newest-first, so `matches[0]` is the most recent.
 * Tests that send multiple emails to the same address within one test should
 * call `clearMailpit()` between phases or use distinct addresses to avoid
 * picking up a stale email from an earlier phase.
 */
export async function waitForMessage(
  email: string,
  opts: { subjectIncludes?: string; timeoutMs?: number } = {},
): Promise<MailpitMessageDetail> {
  const timeout = opts.timeoutMs ?? 5_000
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const matches = await getMessagesFor(email, opts.subjectIncludes)
    if (matches.length > 0) return getMessage(matches[0].ID)
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(
    `No email matching {to: ${email}, subject: ${opts.subjectIncludes ?? "*"}} after ${timeout}ms`,
  )
}

/**
 * Assert no email matching the predicate arrived within `timeoutMs`.
 * Useful for privacy assertions (e.g., forgot-password for unknown email).
 */
export async function expectNoMessage(
  email: string,
  opts: { subjectIncludes?: string; timeoutMs?: number } = {},
): Promise<void> {
  const timeout = opts.timeoutMs ?? 500
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const matches = await getMessagesFor(email, opts.subjectIncludes)
    if (matches.length > 0) {
      throw new Error(
        `Expected no email matching {to: ${email}, subject: ${opts.subjectIncludes ?? "*"}} but found ${matches.length}`,
      )
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

/** Extract the verify/reset URL token from an HTML body. */
export function extractLinkToken(
  html: string,
  path: "/verify" | "/reset-password",
): string {
  // Templates use <a href="${APP_URL}${path}?token=..."> — match that.
  const re = new RegExp(`href="[^"]*${path}\\?token=([^"&]+)`, "i")
  const m = re.exec(html)
  if (!m) throw new Error(`No ${path}?token=... link found in email`)
  return decodeURIComponent(m[1])
}
