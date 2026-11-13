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
 * Since Wave PR (b) a wave is recorded too (SCRUM-1042): the strip, See all and
 * the Banter row read the server (`lib/receivedWaves.ts`). This store is the
 * live half: the toast (L-A), folded to one per 30 s (L-B), and the card's
 * Wave back before the deck refetches.
 *
 * No haptic here: the surface that shows a wave plays `H.arrive`, once.
 */

export type RoomWave = { eventId: string; fromUserId: string; fromName: string; at: number }

/** What the toast or the tabs banner shows: one wave (L-A, Wave back inline), or a fold of several (L-B), newest first. */
export type WaveToastItem = { waves: readonly RoomWave[] }

/** "Waved at you" lasts this long on their card (R3-D4 4.2). */
export const WAVED_AT_YOU_MS = 10 * 60_000
/** L-B: at most one wave toast per 30 s; waves inside the window fold into the next one. */
export const FOLD_MS = 30_000

type State = {
  /** The toast not yet shown, for the Room or the tabs banner. */
  toast: WaveToastItem | null
  /** Who waved at you in this room, and when: newest per person. */
  received: Readonly<Record<string, RoomWave>>
  /** When each person on the received list's first page waved (ms): the card's "Waved at you · 4 min" after a restart. */
  listedAt: Readonly<Record<string, number>>
  /** Bumped by every wave heard, answered or blocked: the strip and the Banter row read the server again. */
  version: number
}

const EMPTY: State = { toast: null, received: {}, listedAt: {}, version: 0 }
let state: State = EMPTY
let listeningFor: string | null = null
/** People blocked or reported in this room: their waves are never shown, and the ones already here go. */
let ignored = new Set<string>()
let unsubscribe: (() => void) | null = null
const listeners = new Set<() => void>()
/** L-B: waves heard inside the window, newest first, and when the last toast went up. */
let held: RoomWave[] = []
let lastToastAt: number | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null

function set(next: State) {
  state = next
  for (const fn of listeners) fn()
}

function clearFold() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  held = []
  lastToastAt = null
}

/** The held waves become one toast, once the window has passed and nothing is up. */
function flush() {
  flushTimer = null
  if (!held.length || state.toast) return
  const waves = held
  held = []
  lastToastAt = Date.now()
  set({ ...state, toast: { waves } })
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, Math.max(0, (lastToastAt ?? 0) + FOLD_MS - Date.now()))
}

function heardWave(wave: RoomWave) {
  const received = { ...state.received, [wave.fromUserId]: wave }
  const version = state.version + 1
  const quiet = lastToastAt === null || wave.at - lastToastAt >= FOLD_MS
  if (quiet && !state.toast && !held.length) {
    lastToastAt = wave.at
    set({ ...state, toast: { waves: [wave] }, received, version })
    return
  }
  held = [wave, ...held.filter((w) => w.fromUserId !== wave.fromUserId)]
  set({ ...state, received, version })
  scheduleFlush()
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
  ignored = new Set()
  clearFold()
  set(EMPTY)
  if (!eventId) return
  unsubscribe = subscribeToRoomWave((data) => {
    if (data.eventId !== listeningFor || ignored.has(data.fromUserId)) return
    heardWave({ eventId: data.eventId, fromUserId: data.fromUserId, fromName: data.fromName, at: Date.now() })
  })
}

/**
 * After a block or a report (`useRoom`'s `remove`, a strip or list row): nothing
 * from them shows again in this room — no toast, no banner, no held fold, no
 * card from a wave — and the strip reads the server again.
 */
export function ignoreWavesFrom(userId: string): void {
  ignored.add(userId)
  held = held.filter((w) => w.fromUserId !== userId)
  const received = { ...state.received }
  delete received[userId]
  const waves = state.toast?.waves.filter((w) => w.fromUserId !== userId) ?? []
  set({ ...state, toast: waves.length ? { waves } : null, received, version: state.version + 1 })
}

/** The toast or banner has shown it. A fold waiting behind it comes once the window allows. */
export function waveShown(toast: WaveToastItem): void {
  if (state.toast !== toast) return
  set({ ...state, toast: null })
  if (held.length) scheduleFlush()
}

/** A wave answered from a list, or a person blocked there: the strip and the Banter row read the server again. */
export function wavesChanged(): void {
  set({ ...state, version: state.version + 1 })
}

/** The received list's first page for this room: when each of them waved, for their card. */
export function setListedAt(eventId: string, waves: readonly { userId: string; wavedAt: string }[]): void {
  if (eventId !== listeningFor) return
  const listedAt = Object.fromEntries(waves.map((w) => [w.userId, Date.parse(w.wavedAt)]).filter(([, t]) => Number.isFinite(t)))
  set({ ...state, listedAt })
}

/**
 * While the "Waved at you" list is open it plays the moment for its own wave backs: the Room under it must not play a
 * second one from the `room:match` both sides are sent. Returns the close.
 */
let listsOpen = 0
export function wavesListOpened(): () => void {
  listsOpen += 1
  return () => {
    listsOpen -= 1
  }
}
export const listHostsMoments = (): boolean => listsOpen > 0

/** "2 min" for the card's chip, or null once ten minutes have passed (or never). */
export function wavedAtYouLabel(at: number | undefined, now: number): string | null {
  if (at === undefined || now - at >= WAVED_AT_YOU_MS) return null
  return `${Math.max(1, Math.floor((now - at) / 60_000))} min`
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
