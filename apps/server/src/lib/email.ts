import nodemailer from "nodemailer"
import { getServerConfig } from "./env.js"

const serverConfig = getServerConfig()

const SMTP_HOST = serverConfig.SMTP_HOST ?? "localhost"
const SMTP_PORT = Number(serverConfig.SMTP_PORT) || 1025
const SMTP_SECURE = serverConfig.SMTP_SECURE === "true"
const SMTP_USER = serverConfig.SMTP_USER
const SMTP_PASS = serverConfig.SMTP_PASS
const EMAIL_FROM = serverConfig.EMAIL_FROM || "noreply@vault.app"
const APP_URL = serverConfig.APP_URL || "http://localhost:3000"

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER && SMTP_PASS ? {
    user: SMTP_USER,
    pass: SMTP_PASS,
  } : undefined,
})

/**
 * Wrap every SMTP send so the underlying nodemailer error (auth failure,
 * unverified from-domain, connection refused) is logged before it propagates.
 * Callers at the service layer still catch and swallow the rejection so a
 * failed delivery never turns a privacy-preserving 200 endpoint into a 500 —
 * but without this log the operator would have no visibility into *why* the
 * mail never arrived. The error is re-thrown so those callers can act on it.
 */
async function sendMail(options: nodemailer.SendMailOptions) {
  try {
    await transporter.sendMail(options)
  } catch (error) {
    console.error("[auth] email send failed", {
      to: options.to,
      subject: options.subject,
      error,
    })
    throw error
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `${APP_URL}/verify?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Vault Account</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #0d9488; }
        .content { padding: 30px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .button:hover { background: #0f766e; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">📁 Vault</div>
        </div>
        <div class="content">
          <h2>Welcome to Vault</h2>
          <p>Click the button below to verify your email address:</p>
          <a href="${verificationUrl}" class="button">Verify Email</a>
          <p>Link expires in 15 minutes.</p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Vault. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: "Verify Your Vault Account",
    html,
  })
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Vault Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #0d9488; }
        .content { padding: 30px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .button:hover { background: #0f766e; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">📁 Vault</div>
        </div>
        <div class="content">
          <h2>Reset Your Password</h2>
          <p>Click the button below to reset your password:</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p>Link expires in 15 minutes.</p>
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Vault. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: "Reset Your Vault Password",
    html,
  })
}


export async function sendAccountLockedEmail(email: string) {
  const resetUrl = `${APP_URL}/forgot-password`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Vault Account Has Been Temporarily Locked</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
        .logo { font-size: 24px; font-weight: bold; color: #0d9488; }
        .content { padding: 30px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .button:hover { background: #0f766e; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
        .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">📁 Vault</div>
        </div>
        <div class="content">
          <h2>Account temporarily locked</h2>
          <p>We detected 5 failed login attempts on your Vault account (<strong>${email}</strong>).</p>
          <p>For your safety, we've temporarily locked the account for 30 minutes. You'll be able to sign in again automatically after that.</p>
          <div class="alert">
            <strong>If this wasn't you,</strong> we recommend resetting your password immediately.
          </div>
          <a href="${resetUrl}" class="button">Reset password</a>
          <p>If you forgot your password and the lockout was your own attempts, you can wait 30 minutes or use the link above to reset.</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Vault. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `

  await sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: "Your Vault Account Has Been Temporarily Locked",
    html,
  })
}
