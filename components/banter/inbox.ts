/**
 * The Banter's pure pieces: how a row says *when*, who said the line it
 * previews, and what it says for a message that isn't text.
 *
 * Kept out of the components so the suite (node, no renderer) can call them.
 * No `toLocaleDateString()` anywhere: its output changes with the device's
 * locale and OS version, and a list whose timestamps change shape between two
 * phones is not one design.
 */

import { MONTHS, WEEKDAYS } from '../../lib/time'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

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

/**
 * What a row says for a message that isn't plain text (R3-D5 5.6): a photo
 * or a video is "Photo" / "Video"; an announcement is "Announcement · Toit:
 * {text}"; a sponsored message is never the preview (null: the row keeps its
 * time and says nothing rather than an advert). The server's bracketed kinds
 * (`[image]`) and broadcast prefixes are its bookkeeping, never shown.
 * ponytail: the server still writes these into the content (SCRUM-625); this
 * reads them until it sends the kind.
 */
export function previewText(raw: string): string | null {
  const text = raw.trim()
  if (/^📣\s*\[Sponsored\]/u.test(text)) return null
  const announcement = text.match(/^📢\s*\[Announcement from\s+(.+?)\]\s*\n?([\s\S]*)$/u)
  if (announcement) return `Announcement · ${announcement[1].trim()}: ${announcement[2].replace(/\s+/g, ' ').trim()}`
  if (/^\[(image|photo)\]$/i.test(text)) return 'Photo'
  if (/^\[video\]$/i.test(text)) return 'Video'
  return text
}
