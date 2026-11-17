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

/** Nearest first with a fix; the server's (and so the sponsor's) order breaks ties, and orders all of it without one. */
export function lapOrder<T extends { distance?: number | null }>(events: readonly T[], hasFix: boolean): T[] {
  if (!hasFix) return [...events]
  const far = (e: T) => (typeof e.distance === 'number' && Number.isFinite(e.distance) ? e.distance : Number.POSITIVE_INFINITY)
  // Array.prototype.sort is stable: equal distances keep the server's order.
  return [...events].sort((a, b) => far(a) - far(b))
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
