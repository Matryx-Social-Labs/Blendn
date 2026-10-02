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
      }
    })
  }
  return data.events.filter(located).map((e) => {
    const w = liveWindow(e)
    const start = new Date(w.start_time).getTime()
    const end = w.end_time ? new Date(w.end_time).getTime() : NaN
    const live = start <= now && Number.isFinite(end) && now < end
    return { id: e.id, kind: 'event' as const, latitude: e.latitude, longitude: e.longitude, title: e.title, live, glow: live ? 3 : 1 }
  })
}

/**
 * The building colours: the event shade is the ember ramp, the venue shade
 * the violet-rose end of the brand gradient; brighter when live.
 */
export const SHADE = {
  event: { live: '#FF6A3D', later: '#B8553A' },
  venue: { live: '#F79EFF', later: '#B0577A' },
} as const

export const shadeOf = (kind: PinKind, live: boolean) => SHADE[kind][live ? 'live' : 'later']

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
