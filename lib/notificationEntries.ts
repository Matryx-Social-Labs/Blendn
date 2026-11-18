import { WAITING_SHOWN, type FeedGroups, type FeedRow } from './notificationRows'

/**
 * The Notifications list as flat entries (Flow 9 · 9.2 frame 05): Waiting on you is one entry, a card of up to
 * three rows ("See all N" opens the rest), then New and Earlier each a header and its rows, then the foot.
 * Pure, so what the screen draws in each state is pinned without a render.
 */
export type NotificationEntry =
  | { type: 'waiting'; key: 'waiting'; rows: FeedRow[]; total: number }
  | { type: 'header'; key: string; title: string }
  | { type: 'row'; key: string; row: FeedRow }
  /** `cleared`: the list was cleared and nothing has landed since; the foot is the one line that says so, not the retention footnote. */
  | { type: 'footer'; key: 'footer'; more: boolean; cleared: boolean }

/**
 * `waitingTotal` is the shared lists' count (SCRUM-1062), which may run past the rows read so far; absent, the rows are counted.
 * `lift` is the request a push or link landed on: first in Waiting on you for this visit, even from behind See all (Flow 9 A · 2).
 */
export function buildEntries(
  groups: FeedGroups,
  {
    allWaiting,
    hasMore,
    waitingTotal = groups.waiting.length,
    lift,
    cleared = false,
  }: { allWaiting: boolean; hasMore: boolean; waitingTotal?: number; lift?: string | null; cleared?: boolean }
): NotificationEntry[] {
  const entries: NotificationEntry[] = []
  if (groups.waiting.length) {
    const landed = groups.waiting.find((r) => r.id === lift)
    const waiting = landed ? [landed, ...groups.waiting.filter((r) => r !== landed)] : groups.waiting
    const rows = allWaiting ? waiting : waiting.slice(0, WAITING_SHOWN)
    entries.push({ type: 'waiting', key: 'waiting', rows, total: waitingTotal })
  }
  for (const [title, rows] of [
    ['New', groups.fresh],
    ['Earlier', groups.earlier],
  ] as const) {
    if (!rows.length) continue
    entries.push({ type: 'header', key: `header:${title}`, title })
    for (const row of rows) entries.push({ type: 'row', key: `row:${row.id}`, row })
  }
  if (entries.length) entries.push({ type: 'footer', key: 'footer', more: hasMore, cleared: cleared && !groups.fresh.length && !groups.earlier.length })
  return entries
}

/** Whether a row is, or holds (`folded`), the notification `id`. */
export const rowHolds = (row: FeedRow, id: string) => row.id === id || !!row.folded?.includes(id)

/** Where a row sits in the list: Waiting on you's card is one entry, so a row in it is the card's index; a folded row is found by any it holds. */
export function entryIndexOf(entries: readonly NotificationEntry[], id: string): number {
  return entries.findIndex((e) => (e.type === 'waiting' ? e.rows.some((r) => rowHolds(r, id)) : e.type === 'row' && rowHolds(e.row, id)))
}
