# ADR 0001: Authentication System

**Status:** Accepted
**Date:** 2026-05-20
**Updated:** 2026-05-20 (Rate limiting strategy)
**Amended:** 2026-05-24 (ADR 0019 — rate-limit numbers reconciled with code; secrets split clarified)
**Amended:** 2026-06-24 (per-user limit split into read/write buckets; centralized secret config via `lib/config.ts` noted)

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
- Token signing — two distinct secrets:
  - `AUTH_SECRET` — HMAC-SHA256 for magic-link tokens (`apps/server/src/lib/magic-link.ts`)
  - `JWT_SECRET` — HS256 for access and refresh JWTs (`apps/server/src/lib/auth.ts`, `apps/server/src/lib/cookies.ts`)
- Session tokens: JWT (access: 15min, refresh: 7 days)
- Rate limiting: `rate-limiter-flexible` with multi-layered strategy
- Email delivery: Mailpit (dev), configurable SMTP (prod)

**Frontend:**
- Auth composable with API integration
- Login, signup, forgot password, reset password views
- Route guards protecting authenticated routes
- Theme-consistent UI across all auth pages

## Rate Limiting Strategy

Multi-layered approach to balance security with user experience.

**Layer 1: Identity-Based (Primary Filter)**

Per-bucket limits as configured in `apps/server/src/lib/rate-limiter.ts`:

| Endpoint            | Limit                          |
|---------------------|--------------------------------|
| `register`          | 5 per 15 min per email         |
| `login`             | 10 per 15 min per email        |
| `magic-link`        | 5 per 15 min per email         |
| `password-reset`    | 5 per 60 min per email         |
| `resend-verification` | 5 per 15 min per email (shares the magic-link bucket) |
| Per-user reads (list, download, quick-links) | 600 per minute per user |
| Per-user writes (upload, rename, move, delete, folder) | 120 per minute per user |
| Storage uploads     | 500 MB per 15 min per user     |

Identity-based limiting (email or user ID) prevents single-user abuse regardless of IP sharing.

Reads and writes have separate budgets because list/download/search operations are idempotent and cheap relative to mutations. The split is implemented via `createUserReadLimiter` and `createUserWriteLimiter` factory functions in `lib/rate-limiter.ts`.

**Layer 2: Volumetric/Byte-Based (Storage Protection)**
- Upload endpoints: 500 MB per 15-minute rolling window per user
- Protects storage backend and cloud budget from draining

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

- Private ADRs (in `build-reasoning/adr-vault-storage/`):
  - `0011-auth-implementation-status-and-email-verification.md` — implementation status and magic-link design
  - `0019-signup-workflow-fixes-and-adr-alignment.md` — signup-workflow fixes, ADR alignment, timing-safe failure paths
