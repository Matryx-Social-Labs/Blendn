import type { ShareEvent } from '../components/ds/LinkPreviewCard'
import type { ShareTarget } from '../components/ds/ShareSheet'
import { inviteMessage } from './friends'
import { clockTime } from './roomMoments'
import { eventLink, shareability, venueLink } from './shareLinks'
import { calendarDate, clockIn, dateIn, MONTHS, weekdayIn, WEEKDAYS } from './time'

/**
 * What an event or a venue says when it is shared (Flow 16 · 16.1/16.2): the fields the card and the message are made
 * from, and nothing else. Never a count, anything live, who is going, or the person sharing it. An unlisted event is
 * the area only: no venue, no street, on the card or in the message.
 */

/** The event as the detail route sends it (`EventApiItem`), or as much of it as a row carries. */
export type ShareSource = {
  id: string
  title: string
  startTime?: string | null
  start_time?: string | null
  venueName?: string | null
  venue_name?: string | null
  city?: string | null
  coverImageUrl?: string | null
  cover_image_url?: string | null
  status?: string | null
  visibility?: string | null
  /** The event's IANA zone: the card's day and time are its own, not the phone's (RC drive 5 D-4). */
  timezone?: string | null
}

const two = (n: number) => String(n).padStart(2, '0')

/** "9:00 PM": the card's time line keeps its minutes (Geist Mono, a stack of four). */
function stackTime(d: Date, timeZone?: string): string {
  const [h, m] = clockIn(d, timeZone)
  return `${h % 12 === 0 ? 12 : h % 12}:${two(m)} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * The date in the event's own zone (the phone's when none is known), in fixed English short names so a card does not
 * change shape with a locale (RC drive 5 D-4: a Berlin phone said an IST night's time in Berlin's).
 */
export function dateParts(startIso: string | null | undefined, timeZone?: string | null): Pick<ShareEvent, 'date' | 'dateText'> {
  const d = new Date(startIso ?? '')
  if (Number.isNaN(d.getTime())) return { date: { day: '', num: '', month: '', time: '' }, dateText: undefined }
  const zone = timeZone ?? undefined
  const [, mon, day] = dateIn(d, zone)
  const weekday = WEEKDAYS[weekdayIn(d, zone)]
  const month = MONTHS[mon]
  return {
    date: { day: weekday.toUpperCase(), num: two(day), month: month.toUpperCase(), time: stackTime(d, zone) },
    dateText: `${calendarDate(d, { weekday: true, year: false, timeZone: zone })}, ${clockTime(d.getTime(), zone)}`,
  }
}

/**
 * The shareable form of an event, or null for one that may not be shared (private, a draft) or whose list did not say
 * (`shareability` 'unknown': ask the event itself first, `loadShareTarget`).
 */
export function shareEventOf(source: ShareSource): ShareEvent | null {
  const kind = shareability(source)
  if (kind === 'never' || kind === 'unknown') return null
  return {
    title: source.title,
    ...dateParts(source.startTime ?? source.start_time, source.timezone),
    // An unlisted event never carries its venue: nothing downstream can print what it was never given.
    venue: kind === 'unlisted' ? '' : (source.venueName ?? source.venue_name ?? ''),
    area: source.city ?? '',
    cover: source.coverImageUrl || source.cover_image_url || null,
    url: eventLink(source.id),
    cancelled: source.status === 'cancelled',
    unlisted: kind === 'unlisted',
  }
}

export const eventTarget = (source: ShareSource): ShareTarget | null => {
  const event = shareEventOf(source)
  return event ? { kind: 'event', event } : null
}

/** The place line of a message: the venue and its area, or the area alone when unlisted. */
const placeText = (e: ShareEvent) => (e.unlisted ? e.area : [e.venue, e.area].filter(Boolean).join(', '))

/** The exact words that go with the link (the tray shows them under the actions). */
export function shareText(target: ShareTarget): string {
  if (target.kind === 'invite') return inviteMessage(target.url)
  if (target.kind === 'venue') return `${target.name} on Blend’n\n${target.url}`
  const e = target.event
  return [[e.title, e.dateText].filter(Boolean).join(' · '), placeText(e), e.url].filter(Boolean).join('\n')
}

/** The link a target copies. */
export function shareUrl(target: ShareTarget): string | undefined {
  return target.kind === 'event' ? target.event.url : target.url
}

export function venueTarget(venue: { id: string; name: string; venueTypeLabel: string; city: string | null }): ShareTarget {
  return { kind: 'venue', name: venue.name, typeLabel: venue.venueTypeLabel, area: venue.city ?? '', url: venueLink(venue.id) }
}
