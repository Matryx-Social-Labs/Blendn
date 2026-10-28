/**
 * `left` from a check-in or Go Live answer (blendn-admin `LeftRoom`: `{ eventId, kind, name }`), as names. Narrow cast:
 * `CheckInResult` and `GoLiveResult` are `apiClient.ts`'s (SYS-19 declares it). Absent on an older server: none.
 */
export function leftNames(data: unknown): string[] {
  const left = (data as { left?: unknown } | null | undefined)?.left
  if (!Array.isArray(left)) return []
  return left.flatMap((l) => (typeof l?.name === 'string' && l.name.trim() ? [l.name.trim()] : []))
}

/** "You left {A}." for the first room a check-in or Go Live took you out of, or null. */
export function youLeftLine(data: unknown): string | null {
  const [first] = leftNames(data)
  return first ? `You left ${first}.` : null
}
