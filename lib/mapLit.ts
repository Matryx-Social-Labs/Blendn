/**
 * What a lit place looks like on the home map (step 2c; research §4.2). Pure,
 * so it runs in a plain node test; the component only draws what this returns.
 *
 * - A pin standing in a building lights that building: its own public outline
 *   from the basemap, drawn a little wider and taller than the city's copy of
 *   it (so the two never share a face and flicker), at least
 *   `MAP_THEME.lit.minHeightM` tall, walls with a lighter crown on top.
 * - A pin with no building under it gets a beacon: a slim banded pillar on
 *   the pin, with a still glow on the ground at its foot.
 * - A live event's ground glow breathes. A live event wins its building.
 *
 * Every shape comes from a public outline or a public pin, and every size from
 * `MAP_THEME`. Nothing here knows where anybody may check in
 * (`__tests__/homeMap.test.ts` reads it to be sure).
 */
import { liveNowLabel, type LiveNow } from './home'
import { MAP_THEME } from './mapTheme'

export type Ring = number[][]
export type LngLat = [number, number]
type Polygon = { type: 'Polygon'; coordinates: Ring[] }

/** One place to light: a pin, and the building it stands in if there is one. */
export interface LitPlace {
  id: string
  kind: 'event' | 'venue'
  live: boolean
  /** The public pin. */
  at: LngLat
  /** The building's public outline from the basemap, outer ring first; null: a beacon. */
  footprint: Ring[] | null
  /** The building's own height and base in the tiles, metres. */
  height: number
  base: number
}

const M_PER_DEG_LAT = 111_320
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

const closed = (ring: Ring) => ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]

/** The unit normal of a→b on the side `dir` says is out (1: right of travel). */
function normal(a: number[], b: number[], dir: number): [number, number] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  return len === 0 ? [0, 0] : [(dir * dy) / len, (-dir * dx) / len]
}

/** How far a mitred corner may reach, in multiples of the offset: a hairpin's mitre runs to infinity. */
const MITRE_LIMIT = 4

/**
 * A ring moved `m` metres out from its own inside: each edge along its normal,
 * corners mitred. A negative `m` moves it in, which is how a courtyard shrinks.
 * Scaling out from the centre instead pulls an L-shape's inner corner into the
 * building, and the city's walls show through the lit copy.
 */
export function outsetRing(ring: Ring, m: number): Ring {
  const open = closed(ring) ? ring.slice(0, -1) : ring
  if (open.length < 3) return ring
  const [lng0, lat0] = open[0]
  const kx = mPerDegLng(lat0)
  const pts = open.map(([x, y]) => [(x - lng0) * kx, (y - lat0) * M_PER_DEG_LAT])
  // Shoelace: positive is counter-clockwise, whose outside is to the right of travel.
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    area += x1 * y2 - x2 * y1
  }
  const dir = area > 0 ? 1 : -1
  const n = pts.length
  const moved = pts.map((p, i) => {
    const n1 = normal(pts[(i - 1 + n) % n], p, dir)
    const n2 = normal(p, pts[(i + 1) % n], dir)
    const k = Math.max(1 + n1[0] * n2[0] + n1[1] * n2[1], 2 / MITRE_LIMIT ** 2)
    return [lng0 + (p[0] + ((n1[0] + n2[0]) * m) / k) / kx, lat0 + (p[1] + ((n1[1] + n2[1]) * m) / k) / M_PER_DEG_LAT]
  })
  return [...moved, moved[0]]
}

/** A closed `sides`-gon of radius `r` metres around a point. */
export function circleRing([lng, lat]: LngLat, r: number, sides: number): Ring {
  const kx = mPerDegLng(lat)
  const ring: Ring = []
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides
    ring.push([lng + (Math.cos(a) * r) / kx, lat + (Math.sin(a) * r) / M_PER_DEG_LAT])
  }
  return [...ring, ring[0]]
}

/* -------------------------------------------------------------------------- */
/* Heights and colours                                                         */
/* -------------------------------------------------------------------------- */

/** A lit building's top: never under the stylised minimum, always above the city's copy. */
export function litTopM(height: number): number {
  return Math.max(height, MAP_THEME.lit.minHeightM) + MAP_THEME.lit.raiseM
}

/** How tall a lit place stands: its lit building, or a beacon. */
export const topOfM = (p: LitPlace) => (p.footprint ? litTopM(p.height) : MAP_THEME.beacon.heightM)

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** `t` of the way along a list of colours, bottom to top. */
export function colourAt(stops: readonly string[], t: number): string {
  if (stops.length === 1) return stops[0]
  const span = Math.min(Math.max(t, 0), 1) * (stops.length - 1)
  const i = Math.min(Math.floor(span), stops.length - 2)
  const a = channels(stops[i])
  const b = channels(stops[i + 1])
  const f = span - i
  return `#${a.map((v, c) => Math.round(v + (b[c] - v) * f).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/* -------------------------------------------------------------------------- */
/* Which places are lit                                                        */
/* -------------------------------------------------------------------------- */

/** Who wins a building two pins share: a live event, then a live venue, then an event, then a venue. */
export function litRank(p: Pick<LitPlace, 'kind' | 'live'>): number {
  if (p.kind === 'event') return p.live ? 3 : 1
  return p.live ? 2 : 0
}

/**
 * One lit copy per building, one beacon per spot. Two pins in one building
 * would draw two extrusions in one place and flicker; the higher `litRank`
 * keeps it (a live event's look wins at its venue), else the first.
 */
export function dedupeLit<T extends LitPlace>(places: T[]): T[] {
  const kept = new Map<string, T>()
  for (const p of places) {
    const ring = p.footprint?.[0]
    const key = ring ? `b:${ring.length}:${ring[0]?.map((n) => n.toFixed(6)).join(',')}` : `p:${p.at.map((n) => n.toFixed(5)).join(',')}`
    const held = kept.get(key)
    if (!held || litRank(p) > litRank(held)) kept.set(key, p)
  }
  return [...kept.values()]
}

/* -------------------------------------------------------------------------- */
/* Features                                                                    */
/* -------------------------------------------------------------------------- */

export type BandFeature = {
  type: 'Feature'
  geometry: Polygon
  properties: { id: string; kind: string; color: string; base: number; height: number }
}

export type GlowFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: LngLat }
  properties: { id: string; kind: string; color: string; pulse: boolean }
}

/**
 * The extrusions for one place, as solid bands with their own base and top:
 * a building's walls and crown, or a beacon's stack.
 */
export function bandsFor(p: LitPlace): BandFeature[] {
  const band = (rings: Ring[], color: string, base: number, height: number): BandFeature => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: rings },
    properties: { id: p.id, kind: p.kind, color, base, height },
  })
  if (p.footprint) {
    const { outsetM, crownShare } = MAP_THEME.lit
    const rings = p.footprint.map((ring, i) => outsetRing(ring, i === 0 ? outsetM : -outsetM))
    const top = litTopM(p.height)
    const crownFrom = p.base + (top - p.base) * (1 - crownShare)
    const look = MAP_THEME[p.kind]
    return [band(rings, look.walls, p.base, crownFrom), band(rings, look.crown, crownFrom, top)]
  }
  const { radiusM, sides, heightM, bands } = MAP_THEME.beacon
  const ring = circleRing(p.at, radiusM, sides)
  return Array.from({ length: bands }, (_, i) =>
    band([ring], colourAt(MAP_THEME.beacon[p.kind], (i + 0.5) / bands), (heightM * i) / bands, (heightM * (i + 1)) / bands)
  )
}

/** The ground glow at a pin: breathing for a live event, still at a beacon's foot, none for a quiet building. */
export function glowFor(p: LitPlace): GlowFeature | null {
  const pulse = p.kind === 'event' && p.live
  if (!pulse && p.footprint) return null
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: p.at },
    properties: { id: p.id, kind: p.kind, color: MAP_THEME[p.kind].glow, pulse },
  }
}

/* -------------------------------------------------------------------------- */
/* Sizes on screen                                                             */
/* -------------------------------------------------------------------------- */

const EARTH_CIRCUMFERENCE_M = 40_075_016.686
/** MapLibre's tile size: at zoom z the world is 512·2^z points across. */
const TILE_PX = 512

const metresPerPx = (zoom: number, lat: number) => (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * 2 ** zoom)

/** The glow's radius: `MAP_THEME.glow.radiusM` on the ground at every zoom. A constant; never a property of a place. */
export function glowRadius(): ['interpolate', ['exponential', number], ['zoom'], number, number, number, number] {
  const { radiusM, referenceLatitude } = MAP_THEME.glow
  const px = (z: number) => radiusM / metresPerPx(z, referenceLatitude)
  return ['interpolate', ['exponential', 2], ['zoom'], 10, px(10), 20, px(20)]
}

/**
 * How far above its pin a chip sits so it clears the roof: the roof's height
 * as the tilt shows it, at the settled view.
 */
export function chipLiftPx(topM: number, view: { zoom: number; pitch: number; latitude: number }): number {
  const rise = (topM / metresPerPx(view.zoom, view.latitude)) * Math.sin((view.pitch * Math.PI) / 180)
  return Math.round(rise + MAP_THEME.chip.gapPx)
}

/** The `max` items nearest a screen point. */
export function nearest<T extends { screen: [number, number] }>(items: T[], [cx, cy]: [number, number], max: number): T[] {
  const d = (t: T) => Math.hypot(t.screen[0] - cx, t.screen[1] - cy)
  return [...items].sort((a, b) => d(a) - d(b)).slice(0, max)
}

/* -------------------------------------------------------------------------- */
/* Motion                                                                      */
/* -------------------------------------------------------------------------- */

/** Whether a live glow breathes: on screen, motion allowed, and something live to breathe. */
export function glowBreathes(s: { focused: boolean; reduceMotion: boolean; anyLive: boolean }): boolean {
  return s.focused && !s.reduceMotion && s.anyLive
}

/** The live glow's opacity this half-period; a steady glow when it does not breathe. */
export function glowOpacity(breathing: boolean, high: boolean): number {
  const { steady, pulseLow, pulseHigh } = MAP_THEME.glow
  if (!breathing) return steady
  return high ? pulseHigh : pulseLow
}

/* -------------------------------------------------------------------------- */
/* Chip text                                                                   */
/* -------------------------------------------------------------------------- */

/** The chip's second line: "LIVE ●", the start ("Fri · 8:00 PM"), or a venue's bucket ("10–19 live"). */
export function chipLine(p: { kind: 'event' | 'venue'; live: boolean; startsAt: string | null; bucket: LiveNow | null }): string {
  if (p.kind === 'venue') return liveNowLabel(p.bucket)
  if (p.live) return 'LIVE ●'
  const start = p.startsAt ? new Date(p.startsAt) : null
  if (!start || Number.isNaN(start.getTime())) return ''
  const day = start.toLocaleDateString(undefined, { weekday: 'short' })
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}
