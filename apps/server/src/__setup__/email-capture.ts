/**
 * Test-side email capture helpers. Integration tests read messages directly
 * from the in-memory `capturedEmails` buffer in `lib/email.ts` instead of
 * polling an SMTP inbox. When `RESEND_API_KEY` is unset, `lib/email.ts`
 * captures every send synchronously, so there is no async delivery window —
 * `waitForMessage` resolves immediately.
 *
 * The shape mirrors the old Mailpit client so existing assertions
 * (`msg.HTML`, `msg.From.Address`) continue to work unchanged.
 */

import { capturedEmails, resetCapturedEmails } from "../lib/email.js"

export interface CapturedMessage {
  ID: string
  From: { Address: string; Name: string }
  To: { Address: string; Name: string }[]
  Subject: string
  Snippet: string
  Created: string
  Text: string
  HTML: string
}

function toCapturedMessage(index: number): CapturedMessage {
  const email = capturedEmails[index]
  return {
    ID: String(index),
    From: { Address: email.from, Name: "" },
    To: [{ Address: email.to, Name: "" }],
    Subject: email.subject,
    Snippet: email.html.replace(/<[^>]*>/g, "").slice(0, 120),
    Created: new Date().toISOString(),
    Text: email.html.replace(/<[^>]*>/g, ""),
    HTML: email.html,
  }
}

/** Drain the capture buffer. Call in afterEach so each test starts clean. */
export async function clearCapturedEmails(): Promise<void> {
  resetCapturedEmails()
}

/** List all captured messages (newest last). */
export async function listMessages(): Promise<CapturedMessage[]> {
  return capturedEmails.map((_, i) => toCapturedMessage(i))
}

/** Get all messages addressed to `email`, optionally filtered by subject substring. */
export async function getMessagesFor(
  email: string,
  subjectIncludes?: string,
): Promise<CapturedMessage[]> {
  const all = await listMessages()
  return all.filter(
    (m) =>
      m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()) &&
      (subjectIncludes == null || m.Subject.includes(subjectIncludes)),
  )
}

/** Fetch full body by ID. */
export async function getMessage(id: string): Promise<CapturedMessage> {
  return toCapturedMessage(Number(id))
}

/**
 * Return the latest matching email. Kept async for API parity with the old
 * Mailpit helper; with the capture transport the message is already available.
 */
export async function waitForMessage(
  email: string,
  opts: { subjectIncludes?: string; timeoutMs?: number } = {},
): Promise<CapturedMessage> {
  const matches = await getMessagesFor(email, opts.subjectIncludes)
  if (matches.length > 0) return matches[matches.length - 1]
  throw new Error(
    `No email matching {to: ${email}, subject: ${opts.subjectIncludes ?? "*"}} was captured`,
  )
}

/**
 * Assert no email matching the predicate was captured.
 * Useful for privacy assertions (e.g., forgot-password for unknown email).
 */
export async function expectNoMessage(
  email: string,
  opts: { subjectIncludes?: string } = {},
): Promise<void> {
  const matches = await getMessagesFor(email, opts.subjectIncludes)
  if (matches.length > 0) {
    throw new Error(
      `Expected no email matching {to: ${email}, subject: ${opts.subjectIncludes ?? "*"}} but found ${matches.length}`,
    )
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
