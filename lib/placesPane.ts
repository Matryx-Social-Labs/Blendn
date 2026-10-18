/**
 * The Places pane's three strata, as plain data (guidelines/places/places.js
 * `placesPane`): Live now (tiles, the only place with photos), Open tonight
 * (rows) and the quiet places folded behind one line. Pure, so the sorting
 * into strata, the type filter, the paging rule and the words are tested
 * without a render.
 *
 * The server decides what is listed and in what order (nearest first with a
 * fix); nothing here filters by time, so the list and the map cannot disagree
 * with it. Live is a bucket, never a number, and never who.
 */

import type { VenueListItem } from './apiClient'
import { liveNowLabel } from './home'
import { clockTime, startsLabel } from './roomMoments'

/** The chip row: the label the design prints and the server's `venueType` it asks for (null: all). */
export const PLACE_TYPES = [
  { label: 'All', venueType: null },
  { label: 'Bars', venueType: 'pub_bar' },
  { label: 'Breweries', venueType: 'brewery' },
  { label: 'Clubs', venueType: 'nightclub' },
  { label: 'Live music', venueType: 'live_music_venue' },
  { label: 'Cafés', venueType: 'cafe' },
] as const

export type PlaceTypeFilter = (typeof PLACE_TYPES)[number]['venueType']

/** The plates `VenuePlate` draws; a server type with none gets the bar's. */
export type PlateKey = 'brewery' | 'gardenBar' | 'bar' | 'club' | 'liveMusic' | 'cafe' | 'restaurant'

const PLATE_BY_TYPE: Record<string, PlateKey> = {
  pub_bar: 'bar',
  brewery: 'brewery',
  cafe: 'cafe',
  // A restaurant reuses the café's plate (owner's ruling on A87): VenuePlate does it.
  restaurant: 'restaurant',
  lounge_rooftop: 'gardenBar',
  nightclub: 'club',
  live_music_venue: 'liveMusic',
}

/** Which plate a venue_type is drawn on. */
export function plateFor(venueType: string | null | undefined): PlateKey {
  return (venueType && PLATE_BY_TYPE[venueType]) || 'bar'
}

/** The area a place is named by on its lines: the street address, else the city. */
export const placeArea = (venue: { address: string | null; city: string | null }) => venue.address?.trim() || venue.city?.trim() || null

/** "350 m" under a kilometre (to the nearest 50), "4.8 km" above; null with no fix. */
export function distanceText(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null
  return km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1)} km`
}

/** Tonight's event at a place, in the one date grammar: "Live", "In 25 min", "9 PM". Null when it is another day. */
export function tonightEvent(
  next: VenueListItem['nextEvent'],
  now: number
): { id: string; title: string; when: string; cover: string | null } | null {
  if (!next) return null
  const start = new Date(next.startTime)
  if (Number.isNaN(start.getTime())) return null
  const today = new Date(now)
  const sameDay = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth() && start.getDate() === today.getDate()
  const label = startsLabel({ startsAt: next.startTime, endsAt: next.endTime }, now)
  // Running now counts whatever day it started; an ended one is nothing to show.
  if (label.kind === 'ended' || (label.kind !== 'live' && !sameDay)) return null
  return { id: next.id, title: next.title, when: label.text || clockTime(start.getTime()), cover: next.coverImageUrl }
}

export type PlaceStrata = {
  /** 5–9, 10–19 and 20+ live. */
  live: VenueListItem[]
  /** Under 5 live, with an event tonight. */
  open: VenueListItem[]
  /** Everything else. */
  quiet: VenueListItem[]
}

/** Sorts a page-by-page list into the strata, keeping the server's order inside each. */
export function splitPlaces(venues: readonly VenueListItem[], now: number): PlaceStrata {
  const live: VenueListItem[] = []
  const open: VenueListItem[] = []
  const quiet: VenueListItem[] = []
  for (const venue of venues) {
    if (venue.liveNow && venue.liveNow !== 'quiet') live.push(venue)
    else if (tonightEvent(venue.nextEvent, now)) open.push(venue)
    else quiet.push(venue)
  }
  return { live, open, quiet }
}

/** "3 places" / "1 place". */
export const placesCount = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`

/**
 * The fold's line. The list is paged: while there are pages left, the number is
 * what has been read so far, so it says "N+" rather than a total it does not know.
 */
export function quietLine(count: number, more: boolean): string {
  const n = `${count}${more ? '+' : ''}`
  return `${n} quiet ${count === 1 && !more ? 'place' : 'places'}`
}

/** "Under 5 live" for a bucket the row prints; null for a viewer the server tells nothing. */
export const bucketLabel = (bucket: VenueListItem['liveNow']) => (bucket ? liveNowLabel(bucket) : null)

/**
 * Pages read on their own while the quiet places are folded, for a server that
 * cannot order live first: Live now and Open tonight are found among the
 * nearest few dozen; past that nothing is read until the person unfolds the
 * quiet places and scrolls (thousands of venues: an eager read of all of them
 * would be a hundred requests for a fold).
 * ponytail: the cap is the fallback for a server without the echo.
 */
export const EAGER_PAGES = 3

/**
 * The drawer's peek line (Places.html 04): what is true tonight in one line.
 * Counts are what has been read; while pages remain they say "N+". Null while
 * nothing is known, so a loading or failed list shows no line.
 */
export function peekLine(strata: PlaceStrata, more: boolean): string | null {
  const live = strata.live.length
  const open = strata.open.length
  if (live + open + strata.quiet.length === 0) return null
  const n = (count: number) => `${count}${more ? '+' : ''}`
  return `${n(live)} ${live === 1 && !more ? 'place' : 'places'} live · ${n(open)} open tonight`
}

/**
 * Whether the end of the list may read another page now. With a server that
 * orders live first the strata arrive in order, so folded it reads exactly as
 * far as the last live or open venue (until a quiet one shows up) with no cap;
 * without, only the first few pages.
 */
export function mayReadNext(
  state: { page: number; hasMore: boolean; orderedLive?: boolean },
  quietOpen: boolean,
  reachedQuiet = false
): boolean {
  if (!state.hasMore) return false
  if (quietOpen) return true
  return state.orderedLive ? !reachedQuiet : state.page < EAGER_PAGES
}

export type PlaceRow =
  | { kind: 'live'; key: 'live'; venues: VenueListItem[] }
  | { kind: 'openHeader'; key: 'openHeader'; count: number }
  | { kind: 'open'; key: string; venue: VenueListItem }
  | { kind: 'fold'; key: 'fold'; count: number; more: boolean; open: boolean }
  | { kind: 'quiet'; key: string; venue: VenueListItem }

/** The flat list the pane renders (one virtualised FlatList; the live tiles are a single horizontal row). */
export function placeRows(strata: PlaceStrata, quietOpen: boolean, more: boolean): PlaceRow[] {
  const rows: PlaceRow[] = []
  if (strata.live.length) rows.push({ kind: 'live', key: 'live', venues: strata.live })
  if (strata.open.length) {
    rows.push({ kind: 'openHeader', key: 'openHeader', count: strata.open.length })
    for (const venue of strata.open) rows.push({ kind: 'open', key: `open:${venue.id}`, venue })
  }
  if (strata.quiet.length) {
    rows.push({ kind: 'fold', key: 'fold', count: strata.quiet.length, more, open: quietOpen })
    if (quietOpen) for (const venue of strata.quiet) rows.push({ kind: 'quiet', key: `quiet:${venue.id}`, venue })
  }
  return rows
}

/** What a tile, a row or a quiet row is read as: name, type, distance, live bucket, tonight's event. */
/** `now` only for a row whose words change with the clock (a tile, an open row); a quiet row passes none, so its memo holds. */
export function placeLabel(venue: VenueListItem, now?: number): string {
  const tonight = now === undefined ? null : tonightEvent(venue.nextEvent, now)
  return [
    venue.name,
    venue.venueTypeLabel,
    distanceText(venue.distance),
    bucketLabel(venue.liveNow),
    tonight ? `${tonight.when}, ${tonight.title}` : null,
  ]
    .filter(Boolean)
    .join('. ')
}
