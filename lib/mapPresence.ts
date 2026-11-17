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
