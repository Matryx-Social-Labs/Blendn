import { getReportTypeLabel, type BlockedUser, type ReportType } from './safetyUtils'

/**
 * "Blocked Sep 12 · Harassment" in three runs (Flow 6 `blocked`): the words, the date (Geist Mono), and the reason after it.
 *
 * The reason is the report's label, never the raw enum ("Reason: inappropriate_messages"), and is left out when it is not one of
 * them. A date that cannot be read leaves just "Blocked".
 */
export function blockedLine(user: Pick<BlockedUser, 'blocked_at' | 'reason'>, now = new Date()): { detail: string; mono?: string; tail?: string } {
  const at = new Date(user.blocked_at)
  const when = Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: at.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      })
  const label = user.reason ? getReportTypeLabel(user.reason as ReportType) : null
  const reason = label === 'Unknown' ? null : label
  return {
    detail: when ? 'Blocked ' : 'Blocked',
    ...(when ? { mono: when } : {}),
    ...(reason ? { tail: ` · ${reason}` } : {}),
  }
}
