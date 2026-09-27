/**
 * The Banter's pure pieces: how a row says *when*, which bucket it sits in, and
 * who said the line it previews.
 *
 * Kept out of the components so the suite (node, no renderer) can call them.
 * No `toLocaleDateString()` anywhere: its output changes with the device's
 * locale and OS version, and a list whose timestamps change shape between two
 * phones is not one design.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Whole calendar days between `then` and `now` — 0 today, 1 yesterday. */
const calendarDaysAgo = (then: Date, now: Date) =>
  Math.round((startOfDay(now) - startOfDay(then)) / (24 * HOUR))

const toDate = (time: string | number | Date | null | undefined): Date | null => {
  if (time === null || time === undefined || time === '' || time === 0) return null
  const d = time instanceof Date ? time : new Date(time)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * A row's timestamp, as short as it can be and still be read without thinking.
 *
 * "now" · "5m" · "3h" (earlier today) · "Yesterday" · "Tue" (this past week) ·
 * "Oct 4" (this year) · "Oct 4, 2025". A time in the future — a skewed clock —
 * is "now" rather than a negative number.
 */
export function inboxTimeLabel(
  time: string | number | Date | null | undefined,
  now: Date = new Date()
): string {
  const then = toDate(time)
  if (!then) return ''
  const diff = now.getTime() - then.getTime()
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  const days = calendarDaysAgo(then, now)
  if (days <= 0) return `${Math.floor(diff / HOUR)}h`
  if (days === 1) return 'Yesterday'
  if (days < 7) return WEEKDAYS[then.getDay()]
  const monthDay = `${MONTHS[then.getMonth()]} ${then.getDate()}`
  return then.getFullYear() === now.getFullYear() ? monthDay : `${monthDay}, ${then.getFullYear()}`
}

export type ActivityBucket = 'Today' | 'This week' | 'Earlier'

/**
 * Which heading a row sits under, by its last activity.
 *
 * "This week" is the same seven days in which a row's time is a weekday, so a
 * "Tue" never appears under "Earlier". A conversation nobody has written in
 * (`sortTime` 0) is "Earlier" — an empty room is not news.
 */
export function activityBucket(sortTime: number, now: Date = new Date()): ActivityBucket {
  const then = toDate(sortTime)
  if (!then) return 'Earlier'
  const days = calendarDaysAgo(then, now)
  if (days <= 0) return 'Today'
  if (days < 7) return 'This week'
  return 'Earlier'
}

/**
 * Newest-first rows cut into their buckets, in order, empty buckets dropped.
 *
 * Expects the rows already sorted: it groups, it does not re-sort.
 */
export function bucketRows<T extends { sortTime: number }>(
  rows: T[],
  now: Date = new Date()
): { title: ActivityBucket; rows: T[] }[] {
  const order: ActivityBucket[] = ['Today', 'This week', 'Earlier']
  const byBucket = new Map<ActivityBucket, T[]>()
  for (const row of rows) {
    const bucket = activityBucket(row.sortTime, now)
    const list = byBucket.get(bucket)
    if (list) list.push(row)
    else byBucket.set(bucket, [row])
  }
  return order.filter((t) => byBucket.has(t)).map((title) => ({ title, rows: byBucket.get(title)! }))
}

/**
 * A preview line with who said it: "You: …" for your own, "Mika: …" for
 * somebody else's in a room, nothing for the other person in a DM (it is their
 * thread; naming them again is noise).
 */
export function previewWithSender(
  text: string,
  sender: { fromMe?: boolean; name?: string | null }
): string {
  if (sender.fromMe) return `You: ${text}`
  const name = sender.name?.trim()
  return name ? `${name}: ${text}` : text
}

/** "You're here · 12 in the room" — the count left off when there isn't one. */
export function liveRoomMeta(count: number | null | undefined): string {
  return count && count > 0 ? `You're here · ${count} in the room` : "You're here"
}
