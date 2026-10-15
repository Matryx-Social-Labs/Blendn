import { useSyncExternalStore } from 'react'

import { subscribeToRoomWave } from './socketClient'

/**
 * Waves to you, heard while you are checked in — overlay open or not
 * (SCRUM-630, ROUND3 R2/R3, D · 4.2 and 9.1).
 *
 * The only listener for `room:wave` used to live in `useRoom`, which runs only
 * while the Blend'n overlay is open, and the server writes no row and sends no
 * push for a wave. So a checked-in person on the Pulse never learned of one.
 * The tab layout starts this for the room you are checked into, and both
 * surfaces read it: the Room shows the ✓ toast and the dock row, the tabs an
 * in-app banner; each opens their PersonCard.
 *
 * A wave is a live moment, nothing more (R2): no history, no push. What is kept
 * is per person and short — "Waved at you · 2 min" on their card, and the card's
 * Wave back — and it is kept on the phone only, for ten minutes.
 *
 * No haptic here: the surface that shows a wave plays `H.arrive`, once.
 */

export type RoomWave = { eventId: string; fromUserId: string; fromName: string; at: number }

/** "Waved at you" lasts this long on their card (R3-D4 4.2). */
export const WAVED_AT_YOU_MS = 10 * 60_000

type State = {
  /** The newest wave not yet shown, for the toast or the banner. */
  latest: RoomWave | null
  /** Who waved at you in this room, and when: newest per person. */
  received: Readonly<Record<string, RoomWave>>
}

const EMPTY: State = { latest: null, received: {} }
let state: State = EMPTY
let listeningFor: string | null = null
let unsubscribe: (() => void) | null = null
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  for (const fn of listeners) fn()
}

/**
 * Listen for waves in `eventId`'s room, or stop with `null`. A new room starts
 * clean: one room's waves never show in the next.
 */
export function listenForWaves(eventId: string | null): void {
  if (eventId === listeningFor) return
  unsubscribe?.()
  unsubscribe = null
  listeningFor = eventId
  set(EMPTY)
  if (!eventId) return
  unsubscribe = subscribeToRoomWave((data) => {
    if (data.eventId !== listeningFor) return
    const wave: RoomWave = { eventId: data.eventId, fromUserId: data.fromUserId, fromName: data.fromName, at: Date.now() }
    set({ latest: wave, received: { ...state.received, [wave.fromUserId]: wave } })
  })
}

/** The toast or banner has shown it. */
export function waveShown(wave: RoomWave): void {
  if (state.latest === wave) set({ ...state, latest: null })
}

/** "2 min" for the card's chip, or null once ten minutes have passed (or never). */
export function wavedAtYouLabel(at: number | undefined, now: number): string | null {
  if (at === undefined || now - at >= WAVED_AT_YOU_MS) return null
  return `${Math.max(1, Math.floor((now - at) / 60_000))} min`
}

/** The newest wave still fresh enough to name: the dock's row (R3-D4 4.2). */
export function newestWave(received: State['received'], now: number): RoomWave | null {
  let newest: RoomWave | null = null
  for (const w of Object.values(received)) if (now - w.at < WAVED_AT_YOU_MS && (!newest || w.at > newest.at)) newest = w
  return newest
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const read = () => state

export function useRoomWaves(): State {
  return useSyncExternalStore(subscribe, read, read)
}
