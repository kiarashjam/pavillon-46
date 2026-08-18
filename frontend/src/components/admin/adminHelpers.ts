export function adminInitials(first?: string | null, last?: string | null, email?: string | null) {
  const a = (first?.[0] ?? '').toUpperCase()
  const b = (last?.[0] ?? '').toUpperCase()
  if (a || b) return `${a}${b}` || a || b
  return (email?.[0] ?? 'A').toUpperCase()
}

export function adminGreeting(now = new Date()) {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' }
  if (pw.length < 8) return { score: 1, label: 'Too short' }
  let score = 2
  if (pw.length >= 12) score += 1
  if ((/[A-Z]/.test(pw) && /[a-z]/.test(pw)) || /\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4
  const label = clamped === 2 ? 'Fair' : clamped === 3 ? 'Good' : 'Strong'
  return { score: clamped, label }
}
