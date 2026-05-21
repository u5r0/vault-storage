import { setCookie } from "hono/cookie"
import type { Context } from "hono"
import { generateAccessToken, generateRefreshToken, storeRefreshToken } from "./auth"

const ACCESS_EXPIRES_SECS  = Number(process.env.ACCESS_EXPIRES_SECONDS  || 15 * 60)
const REFRESH_EXPIRES_SECS = Number(process.env.REFRESH_EXPIRES_SECONDS || 7 * 24 * 60 * 60)

export async function issueTokens(userId: string, email: string) {
  const access = await generateAccessToken({ id: userId, email })
  const { token: refreshToken, jti } = await generateRefreshToken({ id: userId })
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_SECS * 1000)
  await storeRefreshToken(jti, userId, expiresAt)
  return { access, refreshToken }
}

export function setAuthCookies(c: Context, tokens: { access: string; refreshToken: string }) {
  const isProd = process.env.NODE_ENV === "production"
  setCookie(c, "access", tokens.access, {
    httpOnly: true,
    path: "/",
    maxAge: ACCESS_EXPIRES_SECS,
    sameSite: "Lax",
    secure: isProd,
  })
  setCookie(c, "refresh", tokens.refreshToken, {
    httpOnly: true,
    path: "/",
    maxAge: REFRESH_EXPIRES_SECS,
    sameSite: "Strict",
    secure: isProd,
  })
}

export function clearAuthCookies(c: Context) {
  const isProd = process.env.NODE_ENV === "production"
  setCookie(c, "access",   "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "Lax",    secure: isProd })
  setCookie(c, "refresh",  "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "Strict", secure: isProd })
}
