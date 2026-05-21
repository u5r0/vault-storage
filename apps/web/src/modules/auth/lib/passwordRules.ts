/**
 * Password validation rules per ADR 0002.
 * Length-first: minimum 12 characters, recommended 16+.
 * No special character requirements.
 */

export interface PasswordValidation {
  valid: boolean
  errors: string[]
  strength: 0 | 1 | 2 | 3 | 4  // 0=empty, 1=weak, 2=fair, 3=good, 4=strong
  strengthLabel: string
}

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = []

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters.")
  }

  const len = password.length
  let strength: 0 | 1 | 2 | 3 | 4 = 0
  if (len > 0)  strength = 1
  if (len >= 8)  strength = 2
  if (len >= 12) strength = 3
  if (len >= 16) strength = 4

  const labels = ["", "Weak", "Fair", "Good", "Strong"] as const

  return {
    valid: errors.length === 0,
    errors,
    strength,
    strengthLabel: labels[strength],
  }
}
