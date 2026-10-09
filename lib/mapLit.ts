/**
 * What a lit place looks like on the home map (step 2c; research §4.2). Pure,
 * so it runs in a plain node test; the component only draws what this returns.
 *
 * - A pin standing in a building lights that building: its own public outline
 *   from the basemap, drawn a little wider and taller than the city's copy of
 *   it (so the two never share a face and flicker), at least
 *   `MAP_THEME.lit.minHeightM` tall, banded walls under a bright crown, and a
 *   still glow on the ground around the pin.
 * - A pin with no building under it gets a beacon: a banded pillar on the
 *   pin, with a stronger glow at its foot.
 * - A live event's glow breathes. A live event wins its building.
 *
 * A lit building is referred to by a `LitBuilding`: a key to tell buildings
 * apart, and either its outline (drawn as GeoJSON, stage 1) or the id of its
 * feature in our own tiles (lit through feature-state, stage 2), or both.
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

/** The building a pin lights. */
export interface LitBuilding {
  /** Tells one building from another: two pins in one building light it once. */
  key: string
  /** Its public outline, outer ring first: drawn as a GeoJSON copy. Null when it is lit through feature-state. */
  footprint: Ring[] | null
  /** Its numeric id in the building tiles, for feature-state. Null on tiles that merge buildings. */
  featureId: number | null
  /** Its own height and base in the tiles, metres. */
  height: number
  base: number
}

/** One place to light: a pin, and the building it stands in if there is one (else a beacon). */
export interface LitPlace {
  id: string
  kind: 'event' | 'venue'
  live: boolean
  /** The public pin. */
  at: LngLat
  building: LitBuilding | null
}

const M_PER_DEG_LAT = 111_320
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
/** Seven decimals is about a centimetre: enough for a footprint, and stable from one pass to the next. */
const round7 = (n: number) => Math.round(n * 1e7) / 1e7

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1]

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
 * building, and the city's walls show through the lit copy. Repeated vertices
 * (tiles carry them) are dropped first: a zero-length edge has no normal.
 */
export function outsetRing(ring: Ring, m: number): Ring {
  const open = ring.filter((p, i) => i === 0 || !same(p, ring[i - 1]))
  if (open.length > 1 && same(open[0], open[open.length - 1])) open.pop()
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
    return [round7(lng0 + (p[0] + ((n1[0] + n2[0]) * m) / k) / kx), round7(lat0 + (p[1] + ((n1[1] + n2[1]) * m) / k) / M_PER_DEG_LAT)]
  })
  return [...moved, moved[0]]
}

/** A closed `sides`-gon of radius `r` metres around a point. */
export function circleRing([lng, lat]: LngLat, r: number, sides: number): Ring {
  const kx = mPerDegLng(lat)
  const ring: Ring = []
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides
    ring.push([round7(lng + (Math.cos(a) * r) / kx), round7(lat + (Math.sin(a) * r) / M_PER_DEG_LAT)])
  }
  return [...ring, ring[0]]
}

/**
 * A key for a footprint: a hash over every vertex of its outer ring. The
 * ring's length and first vertex alone let two neighbours that share a corner
 * collide, and one of them went unlit.
 */
export function footprintKey(rings: Ring[]): string {
  let h = 0x811c9dc5
  for (const [x, y] of rings[0] ?? []) {
    for (const c of `${x.toFixed(6)},${y.toFixed(6)};`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  }
  return `fp:${(rings[0] ?? []).length}:${h.toString(16)}`
}

/* -------------------------------------------------------------------------- */
/* Heights and colours                                                         */
/* -------------------------------------------------------------------------- */

/** A lit building's top: never under the stylised minimum, always above the city's copy. */
export function litTopM(height: number): number {
  return Math.max(height, MAP_THEME.lit.minHeightM) + MAP_THEME.lit.raiseM
}

/** How tall a lit place stands: its lit building, or a beacon. */
export const topOfM = (p: LitPlace) => (p.building ? litTopM(p.building.height) : MAP_THEME.beacon.heightM)

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** `t` of the way along a list of colours, bottom to top. */
export function colourAt(stops: readonly string[], t: number): string {
  if (stops.length === 1) return stops[0]
  const span = Math.min(Math.max(t, 0), 1) * (stops.length - 1)
  const i = Math.min(Math.floor(span), stops.length - 2)
  const a = channels(stops[i])
  const b = channels(stops[i + 1])
  const f = span - i
  return `#${a
    .map((v, c) =>
      Math.round(v + (b[c] - v) * f)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
    .toUpperCase()}`
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
    const key = p.building ? p.building.key : `p:${p.at.map((n) => n.toFixed(5)).join(',')}`
    const held = kept.get(key)
    if (!held || litRank(p) > litRank(held)) kept.set(key, p)
  }
  return [...kept.values()]
}

/** The `max` places nearest a point on the map (metres, flat-earth: a phone's view is a few km). */
export function nearestTo<T extends { at: LngLat }>(items: T[], [lng, lat]: LngLat, max: number): T[] {
  const kx = mPerDegLng(lat)
  const d = (t: T) => Math.hypot((t.at[0] - lng) * kx, (t.at[1] - lat) * M_PER_DEG_LAT)
  return [...items].sort((a, b) => d(a) - d(b)).slice(0, max)
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
  properties: { id: string; kind: string; color: string; pulse: boolean; opacity: number }
}

/**
 * The extrusions for one place, as solid bands with their own base and top:
 * a building's walls (dark at the foot, the brand colour under the crown) and
 * crown, or a beacon's stack. None for a building lit through feature-state
 * with no outline to copy.
 */
export function bandsFor(p: LitPlace): BandFeature[] {
  const band = (rings: Ring[], color: string, base: number, height: number): BandFeature => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: rings },
    properties: { id: p.id, kind: p.kind, color, base, height },
  })
  if (p.building) {
    const { footprint, height, base } = p.building
    if (!footprint) return []
    const { outsetM, crownShare, wallBands } = MAP_THEME.lit
    const rings = footprint.map((ring, i) => outsetRing(ring, i === 0 ? outsetM : -outsetM))
    const top = litTopM(height)
    const crownFrom = base + (top - base) * (1 - crownShare)
    const look = MAP_THEME[p.kind]
    const walls = Array.from({ length: wallBands }, (_, i) =>
      band(rings, colourAt(look.walls, (i + 1) / wallBands), base + ((crownFrom - base) * i) / wallBands, base + ((crownFrom - base) * (i + 1)) / wallBands)
    )
    return [...walls, band(rings, look.crown, crownFrom, top)]
  }
  const { radiusM, sides, heightM, bands } = MAP_THEME.beacon
  const ring = circleRing(p.at, radiusM, sides)
  return Array.from({ length: bands }, (_, i) =>
    band([ring], colourAt(MAP_THEME.beacon[p.kind], (i + 0.5) / bands), (heightM * i) / bands, (heightM * (i + 1)) / bands)
  )
}

/**
 * The ground glow at a pin: every lit place has one. A live event's breathes;
 * a beacon's is stronger (a pillar is thin, its foot carries it); a lit
 * building's is still.
 */
export function glowFor(p: LitPlace): GlowFeature {
  const pulse = p.kind === 'event' && p.live
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: p.at },
    properties: { id: p.id, kind: p.kind, color: MAP_THEME[p.kind].glow, pulse, opacity: p.building ? MAP_THEME.glow.still : MAP_THEME.glow.beacon },
  }
}

/* -------------------------------------------------------------------------- */
/* Sizes on screen                                                             */
/* -------------------------------------------------------------------------- */

const EARTH_CIRCUMFERENCE_M = 40_075_016.686
/** MapLibre's tile size: at zoom z the world is 512·2^z points across. */
const TILE_PX = 512

const metresPerPx = (zoom: number, lat: number) => (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * 2 ** zoom)

/**
 * The glow's radius: `MAP_THEME.glow.radiusM` on the ground, up to
 * `MAP_THEME.glow.maxZoom` (an interpolation holds its last stop). A
 * constant; never a property of a place.
 */
export function glowRadius(): ['interpolate', ['exponential', number], ['zoom'], number, number, number, number] {
  const { radiusM, referenceLatitude, maxZoom } = MAP_THEME.glow
  const px = (z: number) => radiusM / metresPerPx(z, referenceLatitude)
  return ['interpolate', ['exponential', 2], ['zoom'], 10, px(10), maxZoom, px(maxZoom)]
}

/**
 * How far above its pin a chip sits so it clears the roof: the roof's height
 * as the tilt shows it, at the settled view.
 */
export function chipLiftPx(topM: number, view: { zoom: number; pitch: number; latitude: number }): number {
  const rise = (topM / metresPerPx(view.zoom, view.latitude)) * Math.sin((view.pitch * Math.PI) / 180)
  return Math.round(rise + MAP_THEME.chip.gapPx)
}

/* -------------------------------------------------------------------------- */
/* Motion                                                                      */
/* -------------------------------------------------------------------------- */

/** Whether a live glow may breathe: in view, motion allowed, and something live to breathe. */
export function glowBreathes(s: { visible: boolean; reduceMotion: boolean; anyLive: boolean }): boolean {
  return s.visible && !s.reduceMotion && s.anyLive
}

/** The live glow's opacity: steady unless breathing, then this half-period's end. */
export function glowOpacity(phase: 'steady' | 'low' | 'high'): number {
  const { steady, pulseLow, pulseHigh } = MAP_THEME.glow
  if (phase === 'steady') return steady
  return phase === 'high' ? pulseHigh : pulseLow
}

/* -------------------------------------------------------------------------- */
/* Chip text                                                                   */
/* -------------------------------------------------------------------------- */

/** Events are in India: their times read in India's zone, whatever the phone is set to. */
const EVENT_TIME_ZONE = 'Asia/Kolkata'
/** A start further off than this names its date, not only its weekday ("Fri" could be any Friday). */
const WEEKDAY_ONLY_MS = 6 * 24 * 60 * 60 * 1000

type ChipSource = { kind: 'event' | 'venue'; live: boolean; startsAt: string | null; bucket: LiveNow | null }

function startLabel(startsAt: string | null, now: number, forSpeech: boolean): string | null {
  const start = startsAt ? new Date(startsAt) : null
  if (!start || Number.isNaN(start.getTime())) return null
  const far = start.getTime() - now > WEEKDAY_ONLY_MS
  const day = start.toLocaleDateString('en-IN', { weekday: 'short', ...(far ? { day: 'numeric', month: 'short' } : {}), timeZone: EVENT_TIME_ZONE })
  const time = start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: EVENT_TIME_ZONE })
  return forSpeech ? `${day} ${time}` : `${day} · ${time}`
}

/** The chip's second line: "LIVE ●", the start ("Fri · 8:00 pm", with the date past six days), or a venue's bucket ("10–19 live"). */
export function chipLine(p: ChipSource, now: number = Date.now()): string {
  if (p.kind === 'venue') return liveNowLabel(p.bucket)
  if (p.live) return 'LIVE ●'
  return startLabel(p.startsAt, now, false) ?? ''
}

/** What a screen reader says for a chip: plain words, no symbols. */
export function chipSpeech(p: ChipSource & { title: string }, now: number = Date.now()): string {
  if (p.kind === 'venue') return `${p.title}, ${liveNowLabel(p.bucket).toLowerCase()}`
  if (p.live) return `${p.title}, live now`
  const start = startLabel(p.startsAt, now, true)
  return start ? `${p.title}, starts ${start}` : p.title
}
