/**
 * The Pulse feed's list logic, kept out of the screen so it can be tested.
 *
 * `app/(tabs)/events.tsx` is three thousand lines of render; the two decisions
 * here — how a second page joins the first, and which empty state an empty
 * feed is — were each wrong once in ways no render would show.
 */

/**
 * Page two onto page one, without repeats.
 *
 * The feed is sorted by start time and the server pages by offset, so an event
 * published (or a clock that ticks past a start) between two requests shifts
 * every later row by one and the next page repeats the last row of this one.
 * Two rows with one key is a React warning and a card drawn twice. The first
 * copy wins: it is the one already on screen.
 */
export function mergeEventPage<T extends { id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map((e) => e.id))
  const added: T[] = []
  for (const e of next) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    added.push(e)
  }
  return added.length === 0 ? current : [...current, ...added]
}

/**
 * Whether asking for another page could return anything.
 *
 * A short page is the last one. Without this, reaching the bottom of a
 * twelve-event city asked for page two every time the list settled near its
 * end, and each empty answer was a request that could never have helped.
 */
export function pageHasMore(received: number, pageSize: number): boolean {
  return received >= pageSize
}

export type PulseEmptyKind = 'search' | 'filters' | 'noCity' | 'notLive' | 'quiet'

/**
 * Which empty state an empty feed is.
 *
 * Four situations that look identical as an empty array and mean different
 * things. A search miss is about the query and a filtered miss is about the
 * filters — neither is a statement about the city, and answering either with
 * "Nothing on in Bengaluru" tells somebody the city is empty when it is not.
 * Search wins over filters: the query is the more recent, more specific ask.
 */
export function pulseEmptyKind(input: {
  searching: boolean
  filtered: boolean
  city: string | null
  notLiveHere: boolean
}): PulseEmptyKind {
  if (input.searching) return 'search'
  if (input.filtered) return 'filters'
  if (!input.city) return 'noCity'
  if (input.notLiveHere) return 'notLive'
  return 'quiet'
}

/** The title and the one line under it, for each empty state. */
export function pulseEmptyCopy(
  kind: PulseEmptyKind,
  { city, term }: { city: string | null; term: string }
): { title: string; message: string } {
  switch (kind) {
    case 'search':
      return {
        title: 'No matches',
        message: `Nothing here matches “${term}”${city ? ` in ${city}` : ''}.`,
      }
    case 'filters':
      return {
        title: 'No matches',
        message: city ? `Nothing matches these filters in ${city}.` : 'Nothing matches these filters.',
      }
    case 'noCity':
      return { title: 'No events yet', message: 'There are no published events to show right now.' }
    case 'notLive':
      // The board's Canada frame (Waymo's shape): what is missing, then where we are. Demand is already recorded (`recordCityDemand`).
      return {
        title: `We’re not in ${city} yet`,
        message: 'You’re early, and we’ve counted you in. The more people ask, the sooner we open here.',
      }
    case 'quiet':
      return {
        title: `Nothing on in ${city}`,
        message: 'Nothing is on here at the moment. Try another city, or check back.',
      }
  }
}

const WEEK_MS = 7 * 86_400_000

/**
 * A quiet week's end (Flow 3 · Pulse, Canada): "That's everything in Toronto this week." Only when it is true: the whole
 * list is loaded (no page may follow) and every event in it starts within the week.
 */
export function quietWeekEnd(events: readonly { start_time: string }[], s: { hasMore: boolean; now: number }): boolean {
  if (s.hasMore || events.length === 0) return false
  return events.every((e) => Date.parse(e.start_time) < s.now + WEEK_MS)
}

/** How many cities "Where Blend'n is on" lists. */
export const WHERE_WE_ARE_MAX = 4

/**
 * "Where Blend'n is on", under a city we are not in yet: the open cities with events, busiest first, each with its count
 * grouped ("1,240 events"), or no count under five (the floor every count on the Pulse keeps).
 */
export function whereWeAre<C extends { city: string; eventCount: number; access?: 'full' | 'comingSoon' }>(
  options: readonly C[],
  max: number = WHERE_WE_ARE_MAX
): { city: C; count: string | null }[] {
  return options
    .filter((o) => o.access !== 'comingSoon' && o.eventCount > 0)
    .sort((a, b) => b.eventCount - a.eventCount || a.city.localeCompare(b.city))
    .slice(0, max)
    .map((city) => ({ city, count: city.eventCount >= 5 ? `${city.eventCount.toLocaleString('en-US')} events` : null }))
}
