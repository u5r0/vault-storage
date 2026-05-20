# ADR 0001: Authentication System

**Status:** Accepted
**Date:** 2026-05-20
**Updated:** 2026-05-20 (Rate limiting strategy)

## Decision

Implement a complete authentication system with the following features:

- Email/password login with Argon2id password hashing
- Magic link authentication for passwordless access
- Email verification via magic links
- Password reset flow
- JWT-based session management (access + refresh tokens)
- Multi-layered rate limiting strategy (email-based, volumetric, IP-based)
- Account lockout after 5 failed login attempts (30min lock)
- HttpOnly cookie-based session storage

## Technical Details

**Backend:**
- Password hashing: Argon2id (memoryCost: 65536, timeCost: 3, parallelism: 4)
- Token signing: HMAC-SHA256 with `AUTH_SECRET`
- Session tokens: JWT (access: 15min, refresh: 7 days)
- Rate limiting: `rate-limiter-flexible` with multi-layered strategy
- Email delivery: Mailpit (dev), configurable SMTP (prod)

**Frontend:**
- Auth composable with API integration
- Login, signup, forgot password, reset password views
- Route guards protecting authenticated routes
- Theme-consistent UI across all auth pages

## Rate Limiting Strategy

Multi-layered approach to balance security with user experience:

**Layer 1: Identity-Based (Primary Filter)**
- Auth endpoints: Email-based limiting (20 requests per 15 minutes per email)
- Storage endpoints: User-ID based limiting (500MB per 15 minutes per user)
- Prevents single-user abuse regardless of IP sharing

**Layer 2: Volumetric/Byte-Based (Storage Protection)**
- Upload endpoints: Limit total megabytes uploaded per window
- Protects storage backend and cloud budget from draining
- 500MB upload limit per 15-minute rolling window per user

**Layer 3: IP-Based (Emergency Brake)**
- All endpoints: 1000 requests per minute per IP
- Catches malicious scrapers, brute-force bots, layer-7 DDoS
- Very high limits to avoid affecting legitimate users behind NAT

## Consequences

**Positive:**
- Industry-standard authentication security
- Passwordless option improves UX
- Multi-layered rate limiting prevents abuse while supporting shared IPs
- Volumetric limiting protects storage costs
- Account lockout adds additional security layer

**Negative:**
- Requires email service for production
- Additional infrastructure (Mailpit in dev)
- Increased complexity compared to no auth
- Rate limiting requires in-memory storage (can upgrade to Redis for distributed systems)

## References

- Private ADR: `docs/adr-private/0011-auth-implementation-status-and-email-verification.md`
