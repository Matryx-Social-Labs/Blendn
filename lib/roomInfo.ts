import type { OrganizerKind } from './apiClient'
import { whenLabel } from './pulse'

/**
 * Room info (Flow 5 C6, I-A): the words the sheet says, kept apart from the sheet so each rule has its own test.
 */

/** Who hosts, as the sheet shows it: the organisation's public name, or nobody. */
export type RoomHost = { name: string }

/**
 * The host is the org, never a person (hosts-see-pseudonyms-only; NOTES.md names flag 3). The server says whose event it
 * is in `organizer.kind`: only an "org" runs the night. The platform standing in for a curated event nobody has claimed
 * ("Blendn"), a venue's own day and a person's own event (whose name is somebody's own) get no row, and neither does a
 * server that does not say (owner call D2, recommended A).
 */
export function roomHost(organizer: { kind?: OrganizerKind | null; name?: string | null } | null | undefined): RoomHost | null {
  const name = organizer?.name?.trim()
  if (organizer?.kind !== 'org' || !name) return null
  return { name }
}

/**
 * The event page's "By {name}": attribution, not a role, so the org, the venue and Blendn standing in all sign it. A
 * person's own event does not (their name is somebody's own), and neither does a server that does not say (decided per
 * advisor, SCRUM-1115).
 */
export function byLine(organizer: { kind?: OrganizerKind | null; name?: string | null } | null | undefined): string | null {
  const name = organizer?.name?.trim()
  if (!organizer?.kind || organizer.kind === 'person' || !name) return null
  return name
}

/**
 * The line under the event's title: "Tonight · 6 PM · High Ultra Lounge". The time is tonight's session (a festival's
 * day, not its first night), in the event city's day words as of that session's own start, so a room that opened at
 * 6 PM still says "Tonight · 6 PM" at 11.
 */
export function roomInfoLine(
  event: { startTime?: string | null; session?: { startTime: string } | null; timezone?: string | null; venueName?: string | null },
): string {
  const start = event.session?.startTime ?? event.startTime ?? null
  const when = start ? whenLabel(start, new Date(start), event.timezone) : ''
  return [when, event.venueName?.trim()].filter(Boolean).join(' · ')
}

/** "214 here now", the number in full (12,480): the sheet shows the exact count, the bar a compact one. Null under the floor. */
export const hereNowCount = (count: number | null): string | null => (count === null ? null : count.toLocaleString('en-US'))
