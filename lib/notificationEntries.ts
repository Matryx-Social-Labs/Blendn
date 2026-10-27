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
  | { type: 'footer'; key: 'footer'; more: boolean }

export function buildEntries(groups: FeedGroups, { allWaiting, hasMore }: { allWaiting: boolean; hasMore: boolean }): NotificationEntry[] {
  const entries: NotificationEntry[] = []
  if (groups.waiting.length) {
    entries.push({ type: 'waiting', key: 'waiting', rows: allWaiting ? groups.waiting : groups.waiting.slice(0, WAITING_SHOWN), total: groups.waiting.length })
  }
  for (const [title, rows] of [
    ['New', groups.fresh],
    ['Earlier', groups.earlier],
  ] as const) {
    if (!rows.length) continue
    entries.push({ type: 'header', key: `header:${title}`, title })
    for (const row of rows) entries.push({ type: 'row', key: `row:${row.id}`, row })
  }
  if (entries.length) entries.push({ type: 'footer', key: 'footer', more: hasMore })
  return entries
}

/** Where a row sits in the list: Waiting on you's card is one entry, so a row in it is the card's index. */
export function entryIndexOf(entries: readonly NotificationEntry[], id: string): number {
  return entries.findIndex((e) => (e.type === 'waiting' ? e.rows.some((r) => r.id === id) : e.type === 'row' && e.row.id === id))
}
