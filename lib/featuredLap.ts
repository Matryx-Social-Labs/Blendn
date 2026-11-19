import { getDistanceKm } from './geo'
import type { FeedMediaItem } from './feedMedia'

/**
 * Featured C, "one lap, lit not flown" (pulse-media 05–07 and pulse-map 10, owner 2026-11-17).
 *
 * The lead card plays one lap through Featured, nearest first: each event's turn is its cover and the next two items (a
 * clip, played to its end, counts as one), then the next event; after the last, it rests on the first cover. The map
 * lights each venue in place and never moves for it. Any swipe, or a touch on the map, ends the lap for the visit;
 * Pause/Play on the dots pill is the one way back in.
 */

/** A still holds this long (SceneHeroMedia's dwell, FeedMedia's before it). */
export const STILL_MS = 4000
/** A card whose only picture is its cover still fills its pip over this, so the lap moves on (pulse-media 07). */
export const BARE_TURN_MS = 6000
/** One event's turn: its cover and the next two items. */
export const TURN_ITEMS = 3
/** Past this many events the pill says "4 / 12" beside one filling pip. */
export const PIP_CAP = 5

type Point = { latitude: number; longitude: number }

/**
 * Nearest first from `from` (the fix, or on a cold start a recent last-known position: `lapSeedOf`); the server's (and so
 * the sponsor's) order breaks ties, and orders all of it with no position. An event's own coordinates give its distance
 * from `from`: a list read before any fix carries none of the server's (SCRUM-1077). Without coordinates, the server's.
 */
export function lapOrder<T extends { distance?: number | null; latitude?: number | null; longitude?: number | null }>(events: readonly T[], from: Point | null): T[] {
  if (!from) return [...events]
  const far = (e: T) => {
    if (typeof e.latitude === 'number' && typeof e.longitude === 'number') return getDistanceKm(from.latitude, from.longitude, e.latitude, e.longitude)
    return typeof e.distance === 'number' && Number.isFinite(e.distance) ? e.distance : Number.POSITIVE_INFINITY
  }
  // Array.prototype.sort is stable: equal distances keep the server's order.
  return [...events].sort((a, b) => far(a) - far(b))
}

/** How recent and how accurate a last-known position must be to order the lap on a cold start (SCRUM-1077). */
export const LAP_SEED = { maxAgeMs: 30 * 60_000, accuracyM: 1000 } as const

/**
 * A last-known position good enough to order the lap while the live fix is on its way (a cold start's first fix often
 * takes longer than the lead's 3 s hold): at most 30 min old, good to 1 km. Only ever an order: it is never shown as you,
 * nor sent anywhere. Null otherwise, and the lap keeps the server's order.
 */
export function lapSeedOf(position: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number } | null, now: number): Point | null {
  if (!position) return null
  const { latitude, longitude, accuracy } = position.coords
  if (typeof accuracy !== 'number' || accuracy > LAP_SEED.accuracyM || now - position.timestamp > LAP_SEED.maxAgeMs) return null
  return { latitude, longitude }
}

/** The items one event's turn shows. */
export const turnOf = (playlist: readonly FeedMediaItem[]): FeedMediaItem[] => playlist.slice(0, TURN_ITEMS)

export type LapStep = { event: number; item: number; lapDone: boolean }

/** The step after this one: the turn's next item, else the next event's cover, else rest on the first cover. */
export function nextStep(at: LapStep, events: number, itemsInTurn: number): LapStep {
  if (at.lapDone) return at
  if (at.item + 1 < itemsInTurn) return { ...at, item: at.item + 1 }
  if (at.event + 1 < events) return { event: at.event + 1, item: 0, lapDone: false }
  return { event: 0, item: 0, lapDone: true }
}

export type LapInputs = {
  tabFocused: boolean
  appActive: boolean
  /** The lead is on screen: the drawer at its rest and the list not scrolled past it. */
  inView: boolean
  /** A finger is on the card. */
  touching: boolean
  screenReader: boolean
  reduceMotion: boolean
  lowPower: boolean
  /** Cellular, or a network the OS calls expensive (Low Data). */
  expensiveNetwork: boolean
  /** What the person chose on the pill: nothing yet, Pause, or Play. */
  play: 'auto' | 'paused' | 'playing'
  /** A swipe, or a touch on the map: the lap is over for this visit. */
  tookOver: boolean
  lapDone: boolean
}

/**
 * Whether the lap advances, and whether a clip may play (else its poster stands in, and the lap moves on after a still's
 * dwell). Nothing runs where nobody can see it. On its own the lap never runs for a screen reader or under Reduce
 * Motion, after a takeover or after its one lap; Play runs it again (stills only under Reduce Motion).
 */
export function lapPolicy(i: LapInputs): { advances: boolean; clips: boolean } {
  const visible = i.tabFocused && i.appActive && i.inView && !i.touching
  const auto = i.play === 'auto' && !i.screenReader && !i.reduceMotion && !i.tookOver && !i.lapDone
  const advances = visible && (i.play === 'playing' || auto)
  return { advances, clips: advances && !i.lowPower && !i.expensiveNetwork && !i.reduceMotion }
}

/** The dots pill: a pip per event up to five, else one pip and "4 / 12". */
export function pipModel(count: number, active: number): { pips: number; active: number; counter: string | null } {
  if (count <= PIP_CAP) return { pips: count, active, counter: null }
  return { pips: 1, active: 0, counter: `${active + 1} / ${count}` }
}

/** The pill's control, as it says what it does (WCAG 2.2.2). */
export function playLabel({ advances, lapDone }: { advances: boolean; lapDone: boolean }): string {
  if (advances) return 'Pause featured'
  return lapDone ? 'Play featured again' : 'Play featured'
}

/** How long the lead holds its first cover for a pending fix before it settles on the server's order. */
export const FIX_WAIT_MS = 3000

export type LeadOrder = 'pending' | 'near' | 'server'

/**
 * Which order the lap runs in, decided once per visit ("no jumping around", owner): pending while a fix is on its way
 * (granted, none yet), nearest first when it lands, the server's order at the timeout or with no permission or sharing
 * off. Once decided it never changes: a later fix only updates distances.
 */
export function leadOrderMode({
  permission,
  sharing,
  hasFix,
  timedOut,
  current,
}: {
  /** `checking`: the permission is still being read. */
  permission: 'checking' | 'granted' | 'denied' | 'undetermined'
  sharing: boolean
  hasFix: boolean
  timedOut: boolean
  current: LeadOrder
}): LeadOrder {
  if (current !== 'pending') return current
  if (!sharing || permission === 'denied' || permission === 'undetermined') return 'server'
  if (hasFix) return 'near'
  return timedOut ? 'server' : 'pending'
}

/** The events in a frozen order (by id); any not in it follow in the order given. Nothing frozen: the order given. */
export function applyOrder<T extends { id: string }>(events: readonly T[], frozen: readonly string[] | null): T[] {
  if (!frozen) return [...events]
  const at = new Map(frozen.map((id, i) => [id, i]))
  const known = events.filter((e) => at.has(e.id)).sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
  return [...known, ...events.filter((e) => !at.has(e.id))]
}
