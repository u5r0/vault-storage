# ADR 0002: Password Requirements

**Status:** Accepted
**Date:** 2026-05-20

## Decision

Password requirements prioritize length over complexity:

- **Minimum length:** 12 characters
- **Recommended length:** 16+ characters
- **Special characters:** Not required
- **Complexity:** Only mixed case + numbers for strength indicator

## Rationale

Length provides exponentially more security than complexity. A 16-character password with only lowercase letters has more entropy than an 8-character password with mixed case, numbers, and symbols.

## Implementation

**Backend validation:**
- Minimum 12 characters enforced on registration
- No special character requirements

**Frontend:**
- Password strength indicator based on length, case, numbers
- UI hints recommended length (16+ characters)
- Minimum validation before form submission

## Consequences

**Positive:**
- Easier for users to remember passwords
- Reduces password fatigue
- Still maintains strong security through length
- Aligns with modern security guidance (NIST SP 800-63B)

**Negative:**
- May feel less secure to users accustomed to complexity requirements
- Requires user education on length importance

## References

- NIST Digital Identity Guidelines (SP 800-63B)
