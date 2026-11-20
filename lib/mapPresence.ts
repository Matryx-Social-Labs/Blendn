import type { DistanceReading } from './placesPane'
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
  if (isApproximate(fix)) return { kind: 'approximate', haloM, line: 'Approximate · Use precise' }
  return { kind: 'precise', haloM, line: null }
}

/** iOS Precise off says so; elsewhere a radius over a kilometre is a guess at the district, not where you stand. */
const isApproximate = (fix: Pick<PreciseFix, 'accuracy' | 'approximate'>) => !!fix.approximate || (fix.accuracy ?? 0) > APPROXIMATE_M

/** How every distance measured from this fix is said: "about 1 km" from an approximate one (`distanceText`, SCRUM-1080). */
export const readingOf = (fix: PreciseFix | null | undefined): DistanceReading =>
  fix && isApproximate(fix) ? 'approximate' : 'exact'

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
/** The Earth's circumference (m), for metres to points at a zoom. */
const EARTH_M = 40_075_016.686
const FRAME_SLACK = 1.25

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/**
 * Where the map opens (Option 3, "You and what's near"): you and the six nearest events, fitted to the map you can see
 * (`view`, already less the top bar and the drawer), between z14.6 and z16. No fix: none (the map opens on the city).
 */
export function frameOnYou(
  you: { latitude: number; longitude: number; accuracy?: number | null; approximate?: boolean } | null,
  pins: readonly { latitude: number; longitude: number }[],
  view: { width: number; height: number }
): { center: [number, number]; zoom: number } | null {
  if (!you) return null
  // Approximate (board 06): the circle itself at city-district zoom; "the six nearest" a guess would be invented.
  if (isApproximate(you)) {
    const metresPerPoint = (2 * Math.max(you.accuracy ?? APPROXIMATE_M, APPROXIMATE_M) * FRAME_SLACK) / Math.max(1, Math.min(view.width, view.height))
    const zoom = Math.log2((EARTH_M * Math.cos((you.latitude * Math.PI) / 180)) / (TILE * metresPerPoint))
    return { center: [you.longitude, you.latitude], zoom: Math.round(Math.min(FRAME_ZOOM.min, zoom) * 100) / 100 }
  }
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

/** At most this many spoken markers for the numbers on screen (each is a native view): a dense view keeps the first. */
export const PILE_SPEECH_MAX = 12

/**
 * What a number says to a screen reader (pulse-map 10: "Map and number labels are spoken"): how many, how many are on
 * now, and what a double-tap does. A pile zooms in; several events at one place cannot be split by zooming, so it opens
 * the first (a live one, else the server's first: EventPiles' top event).
 */
export function pileSpeech({ n, live, cluster }: { n: number; live: number; cluster: boolean }): string {
  if (!cluster) return `${n} events at one place, double-tap to open the first`
  return live > 0 ? `${n} events here, ${live} on now, double-tap to zoom in` : `${n} events here, double-tap to zoom in`
}

/** An edge marker's distance from the map's edge (pt). */
const EDGE_INSET = 8

/**
 * Where an off-frame venue's marker sits (pulse-map 05, "out of frame an edge marker points; it never flies"): inside the
 * edge of the map you can see (`box`), on the line from its centre to the venue, the arrow turned to it (degrees
 * clockwise from up). Null while the venue is in frame.
 */
export function edgeMarker(
  xy: readonly [number, number],
  box: { left: number; top: number; right: number; bottom: number },
  size: { width: number; height: number }
): { left: number; top: number; angle: number } | null {
  const [x, y] = xy
  // No room for it (the drawer full, say): nothing, rather than a marker squeezed over the chrome.
  if (box.bottom - box.top < size.height + 2 * EDGE_INSET || box.right - box.left < size.width + 2 * EDGE_INSET) return null
  if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return null
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  const dx = x - cx
  const dy = y - cy
  const roomX = Math.max(0, (box.right - box.left) / 2 - size.width / 2 - EDGE_INSET)
  const roomY = Math.max(0, (box.bottom - box.top) / 2 - size.height / 2 - EDGE_INSET)
  const t = Math.min(dx ? roomX / Math.abs(dx) : Infinity, dy ? roomY / Math.abs(dy) : Infinity)
  return {
    left: Math.round(cx + dx * t - size.width / 2),
    top: Math.round(cy + dy * t - size.height / 2),
    angle: Math.round((Math.atan2(dx, -dy) * 180) / Math.PI),
  }
}

/** Air kept between the stale callout and the edge marker (pt). */
const CALLOUT_AIR = 6

type CalloutRoom = { width: number; height: number; gap: number }

/** The box the stale callout takes: centred on your dot, `gap` over it, or under it when `below`. */
export function staleCalloutBox(dot: readonly [number, number], callout: CalloutRoom, below: boolean) {
  const [x, y] = dot
  const top = below ? y + callout.gap : y - callout.gap - callout.height
  return { left: x - callout.width / 2, right: x + callout.width / 2, top, bottom: top + callout.height }
}

/** How much of `box` lies on `marker` grown by the air (pt², 0 when they are clear). */
function overlapOn(box: ReturnType<typeof staleCalloutBox>, marker: { left: number; top: number; width: number; height: number }): number {
  const w = Math.min(box.right, marker.left + marker.width + CALLOUT_AIR) - Math.max(box.left, marker.left - CALLOUT_AIR)
  const h = Math.min(box.bottom, marker.top + marker.height + CALLOUT_AIR) - Math.max(box.top, marker.top - CALLOUT_AIR)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * Whether the stale callout hangs under your dot rather than over it. Over it is the board's place (pulse-map 06, "STALE");
 * under it only when over it would meet the edge marker (iOS drive 2026-11-19: it ran 3 pt under the marker at the top of
 * the map), and under it meets it less (Android re-drive: a marker level with the dot). `marker`: the marker as drawn.
 */
export function staleCalloutBelow(
  dot: readonly [number, number],
  callout: CalloutRoom,
  marker: { left: number; top: number; width: number; height: number } | null
): boolean {
  if (!marker) return false
  const over = overlapOn(staleCalloutBox(dot, callout, false), marker)
  return over > 0 && overlapOn(staleCalloutBox(dot, callout, true), marker) < over
}

/**
 * What the map says as a whole to a screen reader (pulse-map 10, "Map and number labels are spoken"): how many events are
 * on the map you see and how many are on now, where you are, and the lap's venue when it is off the map. Plain words: the
 * " · " of a line is read as a comma. No bounds yet (before the first stop): nothing about the events.
 */
export function mapSummary({
  bounds,
  pins,
  you,
  youLine,
  edge,
  facing = null,
}: {
  bounds: readonly [number, number, number, number] | null
  pins: readonly { longitude: number; latitude: number; live: boolean }[]
  you: YouMark['kind']
  youLine: string | null
  edge: { name: string; distance: string | null } | null
  /** Which way you face (`compassName`), read with the label when the map is focused: never announced while turning. */
  facing?: string | null
}): string {
  const parts = ['Map.']
  if (bounds) {
    const [west, south, east, north] = bounds
    const here = pins.filter((p) => p.longitude >= west && p.longitude <= east && p.latitude >= south && p.latitude <= north)
    const live = here.filter((p) => p.live).length
    if (!here.length) parts.push('No events here.')
    else parts.push(`${here.length} ${here.length === 1 ? 'event' : 'events'} here${live ? `, ${live} on now` : ''}.`)
  }
  if (you === 'precise') parts.push(facing ? `You are on the map, facing ${facing}.` : 'You are on the map.')
  if (you === 'approximate') parts.push('Your location is approximate.')
  if (you === 'stale' && youLine) parts.push(`${youLine.replace(' · ', ', ')}.`)
  if (edge) parts.push(`${edge.name} is off the map${edge.distance ? `, ${edge.distance} away` : ''}.`)
  return parts.join(' ')
}
