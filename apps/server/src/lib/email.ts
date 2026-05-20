import nodemailer from "nodemailer"

const SMTP_URL = process.env.SMTP_URL || "smtp://localhost:1025"
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@vault.app"
const APP_URL = process.env.APP_URL || "http://localhost:5173"

const transporter = nodemailer.createTransport(SMTP_URL)

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

  await transporter.sendMail({
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

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: "Reset Your Vault Password",
    html,
  })
}
