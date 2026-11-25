import { whenLabel } from './pulse'

/**
 * Room info (Flow 5 C6, I-A): the words the sheet says, kept apart from the sheet so each rule has its own test.
 */

/** Who hosts, as the sheet shows it: the organisation's public name, or nobody. */
export type RoomHost = { name: string }

/**
 * The host is the org, never a person (hosts-see-pseudonyms-only; NOTES.md names flag 3). The event detail's
 * `organizer` is the org's public name; the server sends `id: null` when the platform stands in (a curated event
 * nobody has claimed is "Blendn", a venue's day is the venue), and that is not somebody running the night: no row
 * (owner call D2, recommended A).
 */
export function roomHost(organizer: { id?: string | null; name?: string | null } | null | undefined): RoomHost | null {
  const name = organizer?.name?.trim()
  if (!organizer?.id || !name) return null
  return { name }
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
