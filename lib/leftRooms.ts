import type { CheckInResult } from './apiClient'

/**
 * `left` from a check-in or Go Live answer, as names. Absent on an older server: none. A body that is not an array is
 * none too (the route is the server's, the type is ours).
 */
export function leftNames(data: Pick<CheckInResult, 'left'> | null | undefined): string[] {
  const left = data?.left
  if (!Array.isArray(left)) return []
  return left.flatMap((l) => (typeof l?.name === 'string' && l.name.trim() ? [l.name.trim()] : []))
}

/** "You left {A}." for the first room a check-in or Go Live took you out of, or null. */
export function youLeftLine(data: Pick<CheckInResult, 'left'> | null | undefined): string | null {
  const [first] = leftNames(data)
  return first ? `You left ${first}.` : null
}
