/**
 * The home map's pure parts (plan v2 §4, step 2 PR B): which pins the map
 * shows, how bright each place is, which building is under a pin, and what
 * a viewport asks the server for. Separate from the component so it runs in a
 * plain node test.
 *
 * Nothing here knows where anybody may check in. No payload carries the area,
 * and the map never draws one (`__tests__/homeMap.test.ts`).
 */

import { getDistanceKm } from './geo'
import { liveWindow } from './eventSession'
import type { LiveNow } from './home'
import type { LitPlace } from './mapLit'
import { buildingHeights } from './mapStyleEmber'
import { MAP_THEME } from './mapTheme'

/** The server's bound on `radius` for `/events` and `/venues`, in km. */
export const MAX_QUERY_RADIUS_KM = 100
/** And its floor. */
const MIN_QUERY_RADIUS_KM = 0.1

/** `[west, south, east, north]`, as the map reports its bounds. */
export type Bounds = [number, number, number, number]

/**
 * What a viewport asks the server for: its centre, and a radius that reaches
 * its corners (half the diagonal), clamped to what the server accepts (HM-CU02).
 * The server's bounding box then covers the whole screen.
 */
export function viewportQuery([west, south, east, north]: Bounds): { lat: number; lon: number; radius: number } {
  const lat = (south + north) / 2
  const lon = (west + east) / 2
  const half = getDistanceKm(south, west, north, east) / 2
  const radius = Math.min(MAX_QUERY_RADIUS_KM, Math.max(MIN_QUERY_RADIUS_KM, Math.round(half * 100) / 100))
  return { lat, lon, radius }
}

export type PinKind = 'event' | 'venue'

export interface Pin {
  id: string
  kind: PinKind
  latitude: number
  longitude: number
  title: string
  /** Happening now (an event) or somebody live there (a venue): drawn brighter. */
  live: boolean
  /** 1–4: how strongly it glows. A venue's step follows its bucket, never a count. */
  glow: number
  /** An event's start (its session's, when it has one), for its chip; null for a venue. */
  startsAt: string | null
  /** A venue's live bucket, for its chip; null for an event. */
  bucket: LiveNow | null
}

const VENUE_GLOW: Record<LiveNow, number> = { quiet: 1, '5-9': 2, '10-19': 3, '20+': 4 }

type EventLike = {
  id: string
  title: string
  latitude: number | null
  longitude: number | null
  start_time: string
  end_time: string | null
  session?: { start_time: string; end_time: string } | null
}

type VenueLike = { id: string; name: string; latitude: number | null; longitude: number | null; liveNow?: LiveNow | null }

/**
 * The pins for the segment showing: events on Events, venues on Places
 * (HM-CU04). Whatever the server sent, in its order; nothing is left out by
 * time here — which venues are listed is the server's rule alone. Time only
 * decides how bright an event is drawn.
 */
export function pinsFor(
  segment: 'events' | 'places',
  data: { events: EventLike[]; venues: VenueLike[] },
  now: number = Date.now()
): Pin[] {
  const located = <T extends { latitude: number | null; longitude: number | null }>(x: T): x is T & { latitude: number; longitude: number } =>
    typeof x.latitude === 'number' && typeof x.longitude === 'number' && !(x.latitude === 0 && x.longitude === 0)

  if (segment === 'places') {
    return data.venues.filter(located).map((v) => {
      // An older server sends no bucket: quiet, never "live".
      const bucket: LiveNow = v.liveNow ?? 'quiet'
      return {
        id: v.id,
        kind: 'venue' as const,
        latitude: v.latitude,
        longitude: v.longitude,
        title: v.name,
        live: bucket !== 'quiet',
        glow: VENUE_GLOW[bucket] ?? 1,
        startsAt: null,
        bucket,
      }
    })
  }
  return data.events.filter(located).map((e) => {
    const w = liveWindow(e)
    const start = new Date(w.start_time).getTime()
    const end = w.end_time ? new Date(w.end_time).getTime() : NaN
    const live = start <= now && Number.isFinite(end) && now < end
    return {
      id: e.id,
      kind: 'event' as const,
      latitude: e.latitude,
      longitude: e.longitude,
      title: e.title,
      live,
      glow: live ? 3 : 1,
      startsAt: w.start_time,
      bucket: null,
    }
  })
}

/** A pin's dot colour (`MAP_THEME.pin`): ember for an event, rose for a venue, brighter when live. */
export const shadeOf = (kind: PinKind, live: boolean) => MAP_THEME.pin[kind][live ? 'live' : 'later']

type Ring = number[][]
type BuildingGeometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] }

/** Ray casting on one ring, `[lng, lat]` pairs. */
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Inside the outer ring; holes ignored on purpose. A pin on a stadium's pitch
 * or in a building's courtyard is at that building — the ring around it is
 * the place to light.
 */
function inPolygon(point: [number, number], rings: Ring[]): boolean {
  return rings.length > 0 && inRing(point, rings[0])
}

/**
 * Half the side of the box around a pin's screen point that buildings are
 * looked for in. At a tilt a pin's own spot can be the open ground of a pitch
 * or a courtyard, with the building it belongs to drawn around it, not under it.
 */
export const BUILDING_SEARCH_PX = 48

/**
 * The building a pin stands in, from the features the map rendered around the
 * pin's screen point. At a tilt the box catches buildings in front too, so the
 * one chosen is the one whose footprint (its outer ring) holds the pin; none
 * means the pin gets only its glow (a park, an open-air ground).
 */
export function buildingUnder<F extends { geometry: { type: string; coordinates: unknown } }>(
  pin: { latitude: number; longitude: number },
  features: F[]
): (Omit<F, 'geometry'> & { geometry: { type: 'Polygon'; coordinates: Ring[] } }) | null {
  const point: [number, number] = [pin.longitude, pin.latitude]
  for (const f of features) {
    const g = f.geometry as BuildingGeometry
    /*
     * The tiles merge neighbouring buildings into one MultiPolygon feature, so
     * only the part holding the pin is returned — lighting the feature lit a
     * whole block on the device.
     */
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    const part = parts.find((rings) => inPolygon(point, rings))
    if (part) return { ...f, geometry: { type: 'Polygon', coordinates: part } }
  }
  return null
}

/**
 * What a pin lights (step 2c): the building it stands in, among those the map
 * drew around it, or — none there, or none could be read — a beacon on the
 * pin itself. A pin is never left unmarked once buildings are drawn.
 */
export function litPlaceFor<F extends { geometry: { type: string; coordinates: unknown }; properties?: Record<string, unknown> | null }>(
  pin: Pin,
  drawn: F[] | null
): LitPlace {
  const place: LitPlace = { id: pin.id, kind: pin.kind, live: pin.live, at: [pin.longitude, pin.latitude], footprint: null, height: 0, base: 0 }
  const building = drawn ? buildingUnder(pin, drawn) : null
  if (!building) return place
  return { ...place, footprint: building.geometry.coordinates, ...buildingHeights(building.properties) }
}

/* -------------------------------------------------------------------------- */
/* Asking for pins (step 2 review)                                             */
/* -------------------------------------------------------------------------- */

export type PinQuery = { lat: number; lon: number; radius: number }

/** To ~100 m and 10 m of radius: a pan of a few metres is the same question. */
export function roundQuery(q: PinQuery): PinQuery {
  return { lat: Math.round(q.lat * 1e3) / 1e3, lon: Math.round(q.lon * 1e3) / 1e3, radius: Math.round(q.radius * 100) / 100 }
}

/**
 * Whether `next` asks for nothing `last` did not: its whole circle inside the
 * last one asked for. Panning about inside what is loaded costs no request —
 * the lists and the map share one person's 60 reads a minute.
 */
export function insideLastCircle(last: PinQuery | null, next: PinQuery): boolean {
  if (!last) return false
  return getDistanceKm(last.lat, last.lon, next.lat, next.lon) + next.radius <= last.radius
}

/** How long to wait after `failures` refusals in a row: 2 s, 4 s, 8 s … at most a minute. */
export function backoffMs(failures: number, retryAfterS?: number): number {
  if (failures <= 0) return 0
  const doubling = Math.min(60_000, 1_000 * 2 ** failures)
  return Math.max(doubling, (retryAfterS ?? 0) * 1_000)
}

type Answer<T> = { success: boolean; data?: T; errorCode?: string; retryAfter?: number }

export type PinsResult = { kind: 'pins'; pins: Pin[] } | { kind: 'rate_limited'; retryAfter?: number } | { kind: 'failed' }

/**
 * The pins for one viewport and segment: the lists' own query, read fresh (a
 * venue an event has taken over must not linger), as the server answered.
 */
export async function loadPins(
  segment: 'events' | 'places',
  q: PinQuery,
  api: {
    getEvents: (q: PinQuery & { limit: number }) => Promise<Answer<{ events: EventLike[] }>>
    getVenues: (q: PinQuery & { limit: number; sortBy: 'distance' }) => Promise<Answer<{ venues: VenueLike[] }>>
  },
  limit: number,
  now: number = Date.now()
): Promise<PinsResult> {
  try {
    const res = segment === 'places' ? await api.getVenues({ ...q, limit, sortBy: 'distance' }) : await api.getEvents({ ...q, limit })
    if (res.errorCode === 'RATE_LIMITED') return { kind: 'rate_limited', retryAfter: res.retryAfter }
    if (!res.success || !res.data) return { kind: 'failed' }
    const data = res.data as { events?: EventLike[]; venues?: VenueLike[] }
    return { kind: 'pins', pins: pinsFor(segment, { events: data.events ?? [], venues: data.venues ?? [] }, now) }
  } catch {
    return { kind: 'failed' }
  }
}

/* -------------------------------------------------------------------------- */
/* Lighting (step 2 review)                                                    */
/* -------------------------------------------------------------------------- */

/** Below this zoom the tiles carry no buildings: no lookups at all. */
export const LIGHT_MIN_ZOOM = MAP_THEME.city.minZoom

/** Whether a projected point is on the map's view, with a margin for a building around it. */
export function onScreen([x, y]: [number, number], size: { width: number; height: number }, margin = 48): boolean {
  return x >= -margin && y >= -margin && x <= size.width + margin && y <= size.height + margin
}

/** What a lighting pass was for: the same pins over the same view need no second pass. */
export function lightSignature(pins: Pin[], bounds: Bounds | null): string {
  const view = bounds ? bounds.map((b) => b.toFixed(4)).join(',') : '-'
  return `${view}|${pins.map((p) => `${p.id}:${p.live ? 1 : 0}`).join(',')}`
}

/**
 * Whether the camera goes to the city's centre. A city picked in the Pulse is
 * the person asking: always. The city resolved at launch only when there is
 * nothing better — no fix of their own and no map they have moved: on a phone
 * the first drive found it dragging people from where they stood to the middle
 * of town.
 */
export function shouldFollowCity(s: { firstCity: boolean; hasFix: boolean; touched: boolean }): boolean {
  if (!s.firstCity) return true
  return !s.hasFix && !s.touched
}

/** How far a fix must move before the camera follows it: past GPS jitter. */
const FOLLOW_FIX_KM = 0.05

/**
 * Whether the camera follows a new fix. The first position the app has may
 * be a cached one (last known, another city even); the live fix that follows
 * must still move the camera — until the person moves the map themselves.
 */
export function shouldFollowFix(
  last: { latitude: number; longitude: number } | null,
  next: { latitude: number; longitude: number },
  touched: boolean
): boolean {
  if (touched) return false
  if (!last) return true
  return getDistanceKm(last.latitude, last.longitude, next.latitude, next.longitude) > FOLLOW_FIX_KM
}
