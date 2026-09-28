/**
 * The letters a person with no photo is drawn as: first and last word's first
 * letters, "?" when there is no name. One helper so the Banter row and the
 * conversation header say the same thing about the same person.
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase() || '?'
}
