import type { BlockedUser } from './safetyUtils'
import { calendarDate } from './time'

/**
 * "Blocked 12 Sep · Rooftop Mixer" in three runs (Flow 6 `blocked`): the words, the date (Geist Mono), and where you blocked
 * them (`seen_in`, the server's; SCRUM-1082), so two people you never saw named read as two different rows. A deleted account
 * says "Deleted account" and nothing else (Me + settings A 06). A date that cannot be read leaves just "Blocked".
 */
export function blockedLine(
  user: Pick<BlockedUser, 'blocked_at'> & Partial<Pick<BlockedUser, 'seen_in' | 'account_deleted'>>,
  now = new Date()
): { detail: string; mono?: string; tail?: string } {
  if (user.account_deleted) return { detail: 'Deleted account' }
  const when = calendarDate(user.blocked_at, { now }) || null
  const where = user.seen_in?.trim() || null
  return {
    detail: when ? 'Blocked ' : 'Blocked',
    ...(when ? { mono: when } : {}),
    ...(where ? { tail: ` · ${where}` } : {}),
  }
}

/** The row's name: one you were allowed to see, else the pseudonym you saw them as, else "Someone". */
export function blockedName(user: Pick<BlockedUser, 'blocked_user_name'> & Partial<Pick<BlockedUser, 'seen_as'>>): string {
  return user.blocked_user_name?.trim() || user.seen_as?.trim() || 'Someone'
}
