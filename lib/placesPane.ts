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

import type { IconName } from '../components/ui/Icon'
import type { VenueListItem } from './apiClient'
import { liveNowLabel } from './home'
import { startsLabel } from './roomMoments'
import { venueDayState } from './venueHours'
import { calendarDaysBetween, eventClock } from './time'

/** The chip row: the label the design prints and the server's `venueType` it asks for (null: all). */
export const PLACE_TYPES = [
  { label: 'All', venueType: null },
  { label: 'Bars', venueType: 'pub_bar' },
  { label: 'Breweries', venueType: 'brewery' },
  { label: 'Clubs', venueType: 'nightclub' },
  { label: 'Live music', venueType: 'live_music_venue' },
  { label: 'Rooftops', venueType: 'lounge_rooftop' },
  { label: 'Cafés', venueType: 'cafe' },
] as const

export type PlaceTypeFilter = (typeof PLACE_TYPES)[number]['venueType']

/** The plates `VenuePlate` draws; a server type with none gets the bar's. */
export type PlateKey = 'brewery' | 'gardenBar' | 'bar' | 'club' | 'liveMusic' | 'cafe' | 'restaurant'

const PLATE_BY_TYPE: Record<string, PlateKey> = {
  pub_bar: 'bar',
  brewery: 'brewery',
  cafe: 'cafe',
  // Co-working counts with the cafés (owner): the café's plate, never the bar's fallback (D25).
  coworking: 'cafe',
  // A restaurant reuses the café's plate (owner's ruling on A87): VenuePlate does it.
  restaurant: 'restaurant',
  lounge_rooftop: 'gardenBar',
  nightclub: 'club',
  live_music_venue: 'liveMusic',
}

/**
 * The type a guest reads. The server's label for `other` is "Something else", the organiser's picker word (admin
 * `lib/venue-types.ts`); placeholder copy never reaches a guest, so it reads "Venue" (D24, C38).
 */
const OTHER_LABEL = 'Something else'
export function guestTypeLabel(venue: { venueType?: string | null; venueTypeLabel: string }): string {
  return venue.venueType === 'other' || venue.venueTypeLabel === OTHER_LABEL ? 'Venue' : venue.venueTypeLabel
}

/** Which plate a venue_type is drawn on. */
export function plateFor(venueType: string | null | undefined): PlateKey {
  return (venueType && PLATE_BY_TYPE[venueType]) || 'bar'
}

/** The area a place is named by on its lines: the server's `area` (§C4) when it sends one, else the street address, else the city. */
export const placeArea = (venue: { area?: string | null; address: string | null; city: string | null }) =>
  venue.area?.trim() || venue.address?.trim() || venue.city?.trim() || null

/**
 * The "By area" section (B5) stays hidden until the owner approves the neighbourhood list (the areas are
 * ours to name): a row's own area line is shown, the section and its page are not.
 */
export const SHOW_AREA_SECTION = false

/** An area on the By area grid, from the venue summary (§C5). */
export type PlaceAreaSummary = { slug: string; name: string; count: number; liveCount: number }

/** Ten kilometres and over the decimal is noise ("11 km", not "11.2 km"), and it is what clipped Nearby's column (drive 4 D-4). */
const WHOLE_KM_FROM = 10

/** "350 m" under a kilometre (to the nearest 50), "4.8 km" up to ten, "11 km" from there; null with no fix. */
export function distanceText(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  // Judged on the shown tenth, so 9.96 is "10 km", never "10.0 km".
  const tenths = Math.round(km * 10) / 10
  return tenths < WHOLE_KM_FROM ? `${tenths.toFixed(1)} km` : `${Math.round(km)} km`
}

/** Tonight's event at a place, in the one date grammar: "Live", "In 25 min", "9 PM". Null when it is another day. */
export function tonightEvent(
  next: VenueListItem['nextEvent'],
  now: number
): { id: string; title: string; when: string; cover: string | null } | null {
  if (!next) return null
  const start = new Date(next.startTime)
  if (Number.isNaN(start.getTime())) return null
  // "Tonight" is the event's own day, in its zone when the server names it (admin #749), else the phone's.
  const zone = next.timezone ?? undefined
  const sameDay = calendarDaysBetween(new Date(now), start, zone) === 0
  const label = startsLabel({ startsAt: next.startTime, endsAt: next.endTime, timeZone: zone }, now)
  // Running now counts whatever day it started; an ended one is nothing to show.
  if (label.kind === 'ended' || (label.kind !== 'live' && !sameDay)) return null
  return { id: next.id, title: next.title, when: label.text || eventClock(start.getTime(), zone), cover: next.coverImageUrl }
}

export type PlaceStrata = {
  /** 5–9, 10–19 and 20+ live. */
  live: VenueListItem[]
  /** Under 5 (no live label), with an event tonight. */
  open: VenueListItem[]
  /** Everything else. */
  quiet: VenueListItem[]
}

/**
 * The stratum a venue is in. The server's `tier` where it sends one (it counts a
 * venue as open tonight when it has an event tonight OR its hours cover today,
 * which the client cannot know from an event alone); else judged by the live
 * bucket and tonight's event.
 */
export function tierOf(venue: VenueListItem, now: number): 'live' | 'open' | 'quiet' {
  if (venue.tier === 'live' || venue.tier === 'open' || venue.tier === 'quiet') return venue.tier
  if (venue.liveNow && venue.liveNow !== 'quiet') return 'live'
  return tonightEvent(venue.nextEvent, now) ? 'open' : 'quiet'
}

/** Sorts a page-by-page list into the strata, keeping the server's order inside each. */
export function splitPlaces(venues: readonly VenueListItem[], now: number): PlaceStrata {
  const strata: PlaceStrata = { live: [], open: [], quiet: [] }
  for (const venue of venues) strata[tierOf(venue, now)].push(venue)
  return strata
}

/** "350 m" read aloud: "350 metres", "4.8 kilometres". */
export function spokenDistance(km: number | null | undefined): string | null {
  const text = distanceText(km)
  return text && text.replace(/ m$/, ' metres').replace(/ km$/, ' kilometres')
}

const SPOKEN_BUCKET = { '5-9': '5 to 9 people live', '10-19': '10 to 19 people live', '20+': '20 or more people live' } as const

/** "5 to 9 people live" for a bucket the card prints; null below 5. */
export const spokenBucket = (bucket: VenueListItem['liveNow']) => (bucket && bucket !== 'quiet' ? SPOKEN_BUCKET[bucket] : null)

/**
 * The hours line on an Open tonight card (§C6): "Opens 6 PM" before opening, "Open till 1 AM" while open.
 * The server's `tonight` is wall-clock "HH:MM" in the venue's timezone, so they are formatted as they are
 * (a Date cannot parse them); a close at or before the open runs past midnight. Null when the item has no
 * hours, they are unreadable, or the night is over. The reading is `venueDayState` (`lib/venueHours.ts`), shared with
 * the venue page; a list row has no reset hour, so it passes none.
 */
export function hoursLine(tonight: VenueListItem['tonight'], now: number): { lead: string; time: string } | null {
  const day = venueDayState(tonight, now, null)
  if (!day || day.state === 'closed') return null
  return { lead: day.state === 'opens' ? 'Opens' : 'Open till', time: day.time }
}

/** What a live tile is read as: "{name}. {type}, {area}, {distance}. 10 to 19 people live." */
export function tileLabel(venue: VenueListItem): string {
  const where = [guestTypeLabel(venue), placeArea(venue), spokenDistance(venue.distance)].filter(Boolean).join(', ')
  return [venue.name, where, spokenBucket(venue.liveNow)].filter(Boolean).join('. ')
}

/** What an Open tonight card is read as: "{name}. {type}, {area}, {distance}. Tonight 9 PM, {title}." or "Open till 1 AM." */
export function openLabel(venue: VenueListItem, now: number): string {
  const where = [guestTypeLabel(venue), placeArea(venue), spokenDistance(venue.distance)].filter(Boolean).join(', ')
  const tonight = tonightEvent(venue.nextEvent, now)
  const hours = hoursLine(venue.tonight, now)
  const line = tonight ? `${/^\d/.test(tonight.when) ? `Tonight ${tonight.when}` : tonight.when}, ${tonight.title}.` : hours ? `${hours.lead} ${hours.time}.` : null
  return [venue.name, where, line].filter(Boolean).join('. ').replace(/\.\./g, '.')
}

/** What a Near you row is read as: "2 of 5 nearest. {name}, {type}, {area}, {distance}". */
export function nearLabel(venue: VenueListItem, n: number): string {
  const where = [venue.name, guestTypeLabel(venue), placeArea(venue), spokenDistance(venue.distance)].filter(Boolean).join(', ')
  return `${n} of ${NEAR_COUNT} nearest. ${where}`
}

const thousands = (n: number) => n.toLocaleString('en-US')

/** "3 places" / "1 place". */
export const placesCount = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`

/** What a kind's places are called in a count: one, many. */
const KIND_NOUNS: Record<NonNullable<PlaceTypeFilter>, readonly [string, string]> = {
  pub_bar: ['bar', 'bars'],
  brewery: ['brewery', 'breweries'],
  nightclub: ['club', 'clubs'],
  live_music_venue: ['live music venue', 'live music venues'],
  lounge_rooftop: ['rooftop', 'rooftops'],
  cafe: ['café', 'cafés'],
}

/** "place" / "cafés": the noun for `count` of a kind (or of places). */
export function foldNoun(count: number, more: boolean, kind: PlaceTypeFilter = null): string {
  const [one, many] = (kind && KIND_NOUNS[kind]) || ['place', 'places']
  return count === 1 && !more ? one : many
}

/**
 * The fold's line: "753 more cafés". With the server's total the count is the truth (`placeRows` takes what is shown
 * above the fold from it); without one, the list is paged, and while there are pages left the number is what has been
 * read so far, so it says "N+" rather than a total it does not know (audit A22: "30+ more places" under "783 CAFÉS").
 */
export function moreLine(count: number, more: boolean, kind: PlaceTypeFilter = null): string {
  return `${thousands(count)}${more ? '+' : ''} more ${foldNoun(count, more, kind)}`
}

/** "5–9 live" for a bucket the row prints; null below 5 and for a viewer the server tells nothing. */
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
  const n = (count: number) => `${count}${more ? '+' : ''}`
  // A part whose count is 0 is dropped; both 0 is no line (BUILD-SPEC §0, peek).
  const parts = [live > 0 ? `${n(live)} ${live === 1 && !more ? 'place' : 'places'} live` : null, open > 0 ? `${n(open)} open tonight` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/**
 * Whether the end of the list may read another page now. With a server that
 * orders live first the strata arrive in order, so folded it reads exactly as
 * far as the last live or open venue (the first quiet `tier` stops it) with no cap;
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

/** The rails hold twelve (BUILD-SPEC B2, B3); "See all" lifts the cap by focusing the stratum. */
export const RAIL_CAP = 12
/** Near you: the five nearest, numbered on the map. */
export const NEAR_COUNT = 5

/** "What's on" in the filter sheet: applied here, to the strata the paged list already holds. */
export type WhatsOn = 'all' | 'live' | 'open'
export const WHATS_ON = [
  { value: 'all', label: 'Everything', icon: 'sparkles' },
  { value: 'live', label: 'Live now', icon: 'radio' },
  { value: 'open', label: 'Open tonight', icon: 'moon' },
] as const satisfies readonly { value: WhatsOn; label: string; icon: IconName }[]

/** "How far", in kilometres (the list's `radius` param); null is any. */
export const HOW_FAR = [
  { km: null, label: 'Any' },
  { km: 2, label: '2 km' },
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
] as const
export type HowFar = (typeof HOW_FAR)[number]['km']

/** What the filter sheet holds; `venueType` is the kind (single-select until the server takes a list, §C7). */
export type PlaceFilters = { venueType: PlaceTypeFilter; whatsOn: WhatsOn; radiusKm: HowFar }
export const NO_FILTERS: PlaceFilters = { venueType: null, whatsOn: 'all', radiusKm: null }

/** How many filters are set: the badge on the filter button. */
export const activeFilterCount = (f: PlaceFilters) => (f.venueType ? 1 : 0) + (f.whatsOn !== 'all' ? 1 : 0) + (f.radiusKm !== null ? 1 : 0)

/** The kind plates, in the design's order (B6): every type but "All". */
export const KIND_TILES = PLACE_TYPES.filter((t): t is Extract<(typeof PLACE_TYPES)[number], { venueType: string }> => t.venueType !== null)

/** The bucket's glow on a live tile (`palettes.map.glow.steps`): few 5–9, busy 10–19, packed 20+. */
export const GLOW_STEPS = {
  '5-9': { alpha: 0.35, radius: 40 },
  '10-19': { alpha: 0.6, radius: 60 },
  '20+': { alpha: 0.9, radius: 84 },
} as const

/** A quiet or unknown bucket has no glow. */
export function glowFor(bucket: VenueListItem['liveNow']): { alpha: number; radius: number } | null {
  return bucket && bucket !== 'quiet' ? GLOW_STEPS[bucket] : null
}

/** The map's numbered pins: Near you's rows, in order, those with a position. */
/** `name`: what VoiceOver reads the pin as, with its number (the map's annotation is a button on iOS: audit M3). */
export type NearPin = { id: string; lat: number; lon: number; n: number; name: string }
export function nearPins(venues: readonly VenueListItem[]): NearPin[] {
  const pins: NearPin[] = []
  venues.slice(0, NEAR_COUNT).forEach((v, i) => {
    if (v.latitude != null && v.longitude != null) pins.push({ id: v.id, lat: v.latitude, lon: v.longitude, n: i + 1, name: v.name })
  })
  return pins
}


/**
 * The stat line under the title (B1, B8): "6,422 places · 4 live · 31 open tonight". `total` is the server's
 * count; live and open are the strata read so far, "+" while pages remain. A part that is 0 is dropped.
 * `spoken` is the same as one sentence.
 */
export function statLine({
  total,
  strata,
  more,
  kind,
}: {
  total: number | null
  strata: PlaceStrata
  more: boolean
  kind: PlaceTypeFilter
}): { text: string; spoken: string } | null {
  const n = (count: number) => `${thousands(count)}${more ? '+' : ''}`
  const noun = kind ? (PLACE_TYPES.find((t) => t.venueType === kind)?.label.toLowerCase() ?? 'places') : 'places'
  const parts = [
    total ? (kind ? `${thousands(total)} ${noun}` : placesCount(total).replace(String(total), thousands(total))) : null,
    strata.live.length ? `${n(strata.live.length)} live` : null,
    strata.open.length ? `${n(strata.open.length)} open tonight` : null,
  ].filter((p): p is string => p !== null)
  return parts.length ? { text: parts.join(' · '), spoken: parts.join(', ') } : null
}

/** Why a ready list shows nothing, which decides the words: the city has none, a kind has none, a search matched nothing, or the filters left none. */
export type EmptyReason = 'city' | 'kind' | 'search' | 'filters'

export function emptyReason(view: Pick<PlaceView, 'searching' | 'filters'>): EmptyReason {
  const { whatsOn, venueType, radiusKm } = view.filters
  if (view.searching) return 'search'
  if (whatsOn !== 'all' || radiusKm !== null) return 'filters'
  return venueType ? 'kind' : 'city'
}

/** The title and the search lead the list. */
export const LEAD_ROWS = 2
/** `stickyHeaderIndices` for the list: the search row (there is no ListHeaderComponent to offset it). */
export const PLACES_STICKY = [1]

export type PlaceRow =
  | { kind: 'title'; key: 'title' }
  | { kind: 'search'; key: 'search' }
  | { kind: 'live'; key: 'live'; venues: VenueListItem[]; total: number; focused: boolean }
  | { kind: 'open'; key: 'open'; venues: VenueListItem[]; total: number; focused: boolean }
  | { kind: 'near'; key: 'near'; venues: VenueListItem[]; hasFix: boolean }
  | { kind: 'areas'; key: 'areas'; areas: PlaceAreaSummary[] }
  | { kind: 'kinds'; key: 'kinds' }
  | { kind: 'fold'; key: 'fold'; count: number; more: boolean; open: boolean; nearest: boolean; placeKind: PlaceTypeFilter }
  | { kind: 'quiet'; key: string; venue: VenueListItem }
  | { kind: 'label'; key: 'label'; text: string }
  | { kind: 'skeleton'; key: 'skeleton' }
  | { kind: 'error'; key: 'error' }
  | { kind: 'empty'; key: 'empty'; reason: EmptyReason }

/** Everything the rows are a function of: kept as data so each section's rule is tested without a render. */
export type PlaceView = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  strata: PlaceStrata
  more: boolean
  quietOpen: boolean
  near: readonly VenueListItem[]
  hasFix: boolean
  filters: PlaceFilters
  /** A search is typed: the answer is a flat list of places, no strata. */
  searching: boolean
  /** The read was refused for asking too fast (Flow 15 #15): the banner is the state, so no skeleton, error or empty row stands in for it. */
  rateLimited?: boolean
  /** The top areas, from §C5 (not read yet): drawn only when `SHOW_AREA_SECTION` and there are two or more. */
  areas?: readonly PlaceAreaSummary[]
  /** The server's count of everything the list matches (`totalCount`); null until it has said. */
  total?: number | null
}

/**
 * The flat list the pane renders (one virtualised FlatList; a rail or a grid is a single row). Each section
 * has an empty rule: Live now and Open tonight are absent at 0, Near you is the location card without a fix
 * and absent with a fix and no places, the kinds go while a kind is chosen, the fold goes while a stratum is
 * focused.
 */
export function placeRows(view: PlaceView): PlaceRow[] {
  const { status, strata, more, quietOpen, near, hasFix, filters, searching } = view
  // The title and the search are rows 0 and 1; the search is the sticky one (`PLACES_STICKY`).
  const rows: PlaceRow[] = [{ kind: 'title', key: 'title' }, { kind: 'search', key: 'search' }]
  const all = [...strata.live, ...strata.open, ...strata.quiet]
  if (all.length === 0) {
    if (view.rateLimited) return rows
    if (status === 'error') rows.push({ kind: 'error', key: 'error' })
    else if (status === 'ready') rows.push({ kind: 'empty', key: 'empty', reason: emptyReason(view) })
    else rows.push({ kind: 'skeleton', key: 'skeleton' })
    return rows
  }
  if (searching) {
    rows.push({ kind: 'label', key: 'label', text: 'Places' })
    for (const venue of all) rows.push({ kind: 'quiet', key: `quiet:${venue.id}`, venue })
    return rows
  }
  const { whatsOn, venueType } = filters
  const showLive = whatsOn !== 'open' && strata.live.length > 0
  const showOpen = whatsOn !== 'live' && strata.open.length > 0
  const cap = (venues: VenueListItem[], focused: boolean) => (focused ? venues : venues.slice(0, RAIL_CAP))
  if (showLive) rows.push({ kind: 'live', key: 'live', venues: cap(strata.live, whatsOn === 'live'), total: strata.live.length, focused: whatsOn === 'live' })
  if (showOpen) rows.push({ kind: 'open', key: 'open', venues: cap(strata.open, whatsOn === 'open'), total: strata.open.length, focused: whatsOn === 'open' })
  // A focused stratum with nothing in it says so, rather than leaving the header alone.
  if (whatsOn !== 'all') {
    if (rows.length === LEAD_ROWS) rows.push({ kind: 'empty', key: 'empty', reason: emptyReason(view) })
    return rows
  }
  if (venueType === null) {
    if (!hasFix) rows.push({ kind: 'near', key: 'near', venues: [], hasFix: false })
    else if (near.length > 0) rows.push({ kind: 'near', key: 'near', venues: near.slice(0, NEAR_COUNT), hasFix: true })
    if (SHOW_AREA_SECTION && (view.areas?.length ?? 0) >= 2) rows.push({ kind: 'areas', key: 'areas', areas: [...view.areas!] })
    rows.push({ kind: 'kinds', key: 'kinds' })
  }
  if (strata.quiet.length) {
    // With the server's total the fold says how many are left under it: the total less Live now and Open tonight. A
    // total under what has been read is not one to repeat (as `upcomingCount`): then what was read, "+" while paging.
    const total = view.total ?? null
    const told = total !== null && total >= all.length
    const count = told ? total - strata.live.length - strata.open.length : strata.quiet.length
    rows.push({ kind: 'fold', key: 'fold', count, more: told ? false : more, open: quietOpen, nearest: hasFix, placeKind: venueType })
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
    guestTypeLabel(venue),
    distanceText(venue.distance),
    bucketLabel(venue.liveNow),
    tonight ? `${tonight.when}, ${tonight.title}` : null,
  ]
    .filter(Boolean)
    .join('. ')
}

/**
 * The box "Show on map" fits: the pins and, with a fix, where you stand. `[west, south, east, north]`; null
 * with nothing to fit. The camera adds the drawer's padding.
 */
export function fitBounds(pins: readonly NearPin[], you: { latitude: number; longitude: number } | null): [number, number, number, number] | null {
  const points = [...pins.map((p) => ({ lat: p.lat, lon: p.lon })), ...(you ? [{ lat: you.latitude, lon: you.longitude }] : [])]
  if (points.length === 0) return null
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}
