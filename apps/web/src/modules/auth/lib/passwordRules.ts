/**
 * Password validation rules per ADR 0002 (amended by ADR 0019).
 *
 * Hard requirements (block submission):
 * - ≥ 12 characters
 * - at least one letter (A–Z or a–z)
 * - at least one digit (0–9)
 *
 * Strength tiers (informational only):
 * - Weak  — fails any hard requirement
 * - Fair  — 12–15 chars, letters + digits, no mixed case
 * - Good  — 12–15 chars, letters + digits, mixed case
 * - Strong — ≥ 16 chars, letters + digits (mixed case optional)
 *
 * Mirrors `passwordSchema` in `@vault/sdk` so client-side and server-side
 * validation never disagree.
 */

export interface PasswordValidation {
  valid: boolean
  errors: string[]
  hints: PasswordHint[]
  strength: 0 | 1 | 2 | 3 | 4 // 0=empty, 1=weak, 2=fair, 3=good, 4=strong
  strengthLabel: "" | "Weak" | "Fair" | "Good" | "Strong"
}

export interface PasswordHint {
  /** Stable id so the UI can key on it. */
  id: "length" | "letters" | "digits" | "mixedCase" | "lengthBoost"
  /** True when the rule is satisfied. */
  satisfied: boolean
  /** Whether failing this rule blocks submission. */
  required: boolean
  /** Human-readable description. */
  message: string
}

export function validatePassword(password: string): PasswordValidation {
  const len       = password.length
  const hasLetter = /[A-Za-z]/.test(password)
  const hasDigit  = /\d/.test(password)
  const hasUpper  = /[A-Z]/.test(password)
  const hasLower  = /[a-z]/.test(password)
  const mixedCase = hasUpper && hasLower
  const meetsMin  = len >= 12

  // Hard requirements
  const valid = meetsMin && hasLetter && hasDigit

  const errors: string[] = []
  if (!meetsMin)  errors.push("Password must be at least 12 characters.")
  if (!hasLetter) errors.push("Password must contain a letter.")
  if (!hasDigit)  errors.push("Password must contain a digit.")

  // Tiering
  let strength: 0 | 1 | 2 | 3 | 4 = 0
  if (len === 0)        strength = 0
  else if (!valid)      strength = 1                    // Weak
  else if (len >= 16)   strength = 4                    // Strong
  else if (mixedCase)   strength = 3                    // Good (12–15 + mixed case)
  else                  strength = 2                    // Fair (12–15, letters + digits)

  const labels = ["", "Weak", "Fair", "Good", "Strong"] as const

  // Realtime hints — three required rules + two advisory upgrades
  const hints: PasswordHint[] = [
    {
      id: "length",
      satisfied: meetsMin,
      required: true,
      message: "At least 12 characters",
    },
    {
      id: "letters",
      satisfied: hasLetter,
      required: true,
      message: "Contains a letter",
    },
    {
      id: "digits",
      satisfied: hasDigit,
      required: true,
      message: "Contains a digit",
    },
    {
      id: "mixedCase",
      satisfied: valid && mixedCase,
      required: false,
      message: "Mix uppercase and lowercase for stronger",
    },
    {
      id: "lengthBoost",
      satisfied: valid && len >= 16,
      required: false,
      message: "16+ characters is strongest",
    },
  ]

  return {
    valid,
    errors,
    hints,
    strength,
    strengthLabel: labels[strength],
  }
}
