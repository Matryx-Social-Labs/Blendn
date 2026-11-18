import type { PreciseFix } from './roomButton'

/**
 * The Pulse map, Option 3 "You and what's near" (pulse-map 05–10, owner 2026-11-17): the rules under the map.
 *
 * - **You** are violet (Foundations C). Precise: a dot and its real accuracy as a halo. iOS Precise off: a soft circle and
 *   "Approximate · Use precise". A fix older than ten minutes: grey, "Last seen here 25 min ago · updating". Denied: no
 *   dot, the city, and "See what's near you · Settings". Off in Blend'n: nothing, and nothing asks (SCRUM-908).
 * - **Other places** get one line with the way back, never a time-zone word or an invented distance.
 * - **Piles** are MapLibre's own clustering; the focused event is drawn from its own source, so it is never in a number.
 */

/** A fix this old is no longer where you are (board 06, "STALE (>10 MIN)"). */
export const STALE_AFTER_MS = 10 * 60_000
/** Above this accuracy (m) a fix is approximate even when the OS does not say so (iOS Precise off reports ~3 km). */
const APPROXIMATE_M = 1000

export type YouMark = {
  kind: 'precise' | 'approximate' | 'stale' | 'denied' | 'off' | 'none'
  /** The halo's radius in metres: the fix's own accuracy. */
  haloM: number | null
  /** The one line the map says about it; `denied`'s carries a Settings action. */
  line: string | null
}

export function youMark({
  sharing,
  permission,
  fix,
  now,
}: {
  sharing: boolean
  permission: 'granted' | 'denied' | 'undetermined'
  fix: PreciseFix | null
  now: number
}): YouMark {
  if (!sharing) return { kind: 'off', haloM: null, line: null }
  if (permission === 'denied') return { kind: 'denied', haloM: null, line: 'See what’s near you' }
  if (!fix) return { kind: 'none', haloM: null, line: null }
  const haloM = fix.accuracy ?? null
  const age = fix.timestamp ? now - fix.timestamp : 0
  if (age > STALE_AFTER_MS) return { kind: 'stale', haloM, line: `Last seen here ${Math.round(age / 60_000)} min ago · updating` }
  if (fix.approximate || (haloM ?? 0) > APPROXIMATE_M) return { kind: 'approximate', haloM, line: 'Approximate · Use precise' }
  return { kind: 'precise', haloM, line: null }
}

export type PlaceLine = { text: string; back: string } | { text: string; switch: [string, string] }

/** The one line about where the map is looking, with the way back; null at home with something near. */
export function placeLine({
  city,
  home,
  browsingHere,
  travelling,
  nothingNear,
}: {
  city: string | null
  home: string | null
  browsingHere: boolean
  travelling: boolean
  nothingNear: boolean
}): PlaceLine | null {
  if (travelling && city) return { text: `Visiting ${city}`, back: home ? `Back to ${home}` : 'Back to you' }
  if (!browsingHere && city) return { text: `Browsing ${city}`, back: 'Back to you' }
  if (nothingNear && city) return { text: 'Nothing near you yet', switch: ['Near you', `In ${city}`] }
  return null
}

/** MapLibre Native's `ShapeSource` clustering: piles become numbers up to z13; from z14 every event is its own dot. */
export const CLUSTER = { radius: 46, maxZoom: 13 } as const

/** A number's bubble: 15 / 18 / 21 pt at 1 / 10 / 25+ (its hit area is 44 pt whatever it draws). */
export const bubbleRadius = (count: number) => (count >= 25 ? 21 : count >= 10 ? 18 : 15)

/** The focused event comes out of the clustered pins into its own source; one not among them is still drawn. */
export function splitFocus<T extends { id: string }>(pins: readonly T[], focusId: string | null, fallback?: T): { piled: T[]; focus: T | null } {
  if (!focusId) return { piled: [...pins], focus: null }
  return { piled: pins.filter((p) => p.id !== focusId), focus: pins.find((p) => p.id === focusId) ?? fallback ?? null }
}

/** "+130 more · zoom in" when the server says how many are in view; no total, no claim. */
export function moreLine(total: number | null, loaded: number): string | null {
  if (total === null || total <= loaded) return null
  return `+${total - loaded} more · zoom in`
}

/** Option 3 opens on you and this many nearest events (pulse-map 05). */
export const FRAME_NEAREST = 6
/** …at a zoom between these: never wider than a district, never tighter than the street. */
export const FRAME_ZOOM = { min: 14.6, max: 16 } as const
/** Web Mercator's tile size in points, and the slack kept round the framed points. */
const TILE = 512
const FRAME_SLACK = 1.25

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/**
 * Where the map opens (Option 3, "You and what's near"): you and the six nearest events, fitted to the map you can see
 * (`view`, already less the top bar and the drawer), between z14.6 and z16. No fix: none (the map opens on the city).
 */
export function frameOnYou(
  you: { latitude: number; longitude: number } | null,
  pins: readonly { latitude: number; longitude: number }[],
  view: { width: number; height: number }
): { center: [number, number]; zoom: number } | null {
  if (!you) return null
  const d = (p: { latitude: number; longitude: number }) => (p.latitude - you.latitude) ** 2 + ((p.longitude - you.longitude) * Math.cos((you.latitude * Math.PI) / 180)) ** 2
  const near = [...pins].sort((a, b) => d(a) - d(b)).slice(0, FRAME_NEAREST)
  if (!near.length) return { center: [you.longitude, you.latitude], zoom: FRAME_ZOOM.max }
  // You stay in frame: the farthest drop out until the rest fit at the widest zoom allowed (they get edge markers).
  for (let k = near.length; k > 0; k -= 1) {
    const fit = fitZoom([you, ...near.slice(0, k)], view)
    if (fit.zoom >= FRAME_ZOOM.min) return { center: fit.center, zoom: Math.round(Math.min(FRAME_ZOOM.max, fit.zoom) * 100) / 100 }
  }
  return { center: [you.longitude, you.latitude], zoom: FRAME_ZOOM.min }
}

/** The box round `pts` (with slack) and the zoom at which it fills `view`, each way: 360° of longitude, 2π of Mercator y. */
function fitZoom(pts: readonly { latitude: number; longitude: number }[], view: { width: number; height: number }) {
  const lons = pts.map((p) => p.longitude)
  const ys = pts.map((p) => mercY(p.latitude))
  const [w, e] = [Math.min(...lons), Math.max(...lons)]
  const [s, n] = [Math.min(...ys), Math.max(...ys)]
  const zx = Math.log2((view.width * 360) / (TILE * Math.max((e - w) * FRAME_SLACK, 1e-9)))
  const zy = Math.log2((view.height * 2 * Math.PI) / (TILE * Math.max((n - s) * FRAME_SLACK, 1e-12)))
  const lat = (Math.atan(Math.sinh((s + n) / 2)) * 180) / Math.PI
  return { center: [(w + e) / 2, lat] as [number, number], zoom: Math.min(zx, zy) }
}
