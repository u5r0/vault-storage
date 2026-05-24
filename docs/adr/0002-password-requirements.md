# ADR 0002: Password Requirements

**Status:** Accepted
**Date:** 2026-05-20
**Amended:** 2026-05-24 (ADR 0019 — letters + digits become a hard requirement; tier definitions revised)

## Decision

Password requirements prioritize length over complexity, with two minimum-composition rules to block trivially weak passwords.

**Hard requirements (block submission on either side of the wire):**

- Minimum length: **12 characters**
- Must contain at least one **letter** (`A-Z` or `a-z`)
- Must contain at least one **digit** (`0-9`)

**Recommendations (advisory; do not block submission):**

- Recommended length: 16+ characters
- Mixed case is encouraged but not required

**Special characters:** Not required.

## Rationale

Length provides exponentially more security than complexity. A 16-character password with only lowercase letters has more entropy than an 8-character password with mixed case, numbers, and symbols. The letters-and-digits rule catches degenerate cases (e.g., a 12-character all-digit string) without imposing meaningful friction on real users. Aligned with NIST SP 800-63B guidance.

## Strength Tiers

The frontend strength indicator maps `(length, composition)` to one of four tiers:

| Length | Composition                     | Tier       | Submit allowed? |
|--------|----------------------------------|------------|-----------------|
| `< 12` | any                              | **Weak**   | No              |
| `≥ 12` | missing letters or missing digits | **Weak**   | No              |
| 12–15  | letters + digits, no mixed case  | **Fair**   | Yes             |
| 12–15  | letters + digits + mixed case    | **Good**   | Yes             |
| `≥ 16` | letters + digits (mixed case optional) | **Strong** | Yes             |

The form's submit button is gated on validity (length ≥ 12, has letter, has digit), not on tier. The tier is purely informational.

## Implementation

**Wire contract (`@vault/sdk`):** A single `passwordSchema` Zod definition is the source of truth for both sides. It encodes the three hard requirements (length, letter, digit) and is reused by `RegisterBody` and `ResetPasswordBody`.

**Backend validation:** Endpoints validate via `zValidator` against the SDK schema. No additional length checks in route handlers (those are removed in favor of trusting the schema).

**Frontend validation:** `apps/web/src/modules/auth/lib/passwordRules.ts` mirrors the same hard requirements and adds:

- **Realtime hints** rendered as a checklist below the password field, showing what is satisfied and what is still missing or what would upgrade the tier:
  - At least 12 characters (required)
  - Contains a letter (required)
  - Contains a digit (required)
  - Mix uppercase and lowercase for stronger (advisory)
  - 16+ characters is strongest (advisory)
- Strength indicator (1–4 bars) tied to the tier table above.

The submit button uses `validation.valid`, not a hand-rolled length check.

## Consequences

**Positive:**
- Easier for users to remember passwords
- Reduces password fatigue
- Still maintains strong security through length plus minimal composition
- Aligns with modern security guidance (NIST SP 800-63B)
- Single Zod schema enforces the same rules client-side and server-side

**Negative:**
- May feel less secure to users accustomed to complexity requirements
- Letters-and-digits rule blocks a small set of long-but-trivial passwords (e.g., a passphrase of all letters); mitigated by hint UI explaining the requirement in real time

## References

- NIST Digital Identity Guidelines (SP 800-63B)
- ADR 0019 (private) — `build-reasoning/adr-vault-storage/0019-signup-workflow-fixes-and-adr-alignment.md` — the audit that drove this amendment
