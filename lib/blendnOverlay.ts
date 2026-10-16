import { useSyncExternalStore } from 'react'

import type { TonightEvent } from './useTonight'

/**
 * Whether the Blend'n screen is open.
 *
 * The screen is an **overlay hosted by the tab layout**, not a route, and this
 * is why. It used to be `/room`, presented as a modal — and on iOS a card
 * pushed after a modal goes onto the stack *underneath* it. Join Chat had to
 * `replace` the room to be seen at all (driven 2026-09-13), which closed the
 * room to open its own chat. The redesign opens a person's profile, a private
 * chat and the room chat from here, so every one of those would have needed
 * the same trick.
 *
 * As an overlay inside the tabs, the room sits *under* the root stack: anything
 * pushed from it lands on top, and coming back finds the room where you left
 * it. It also lets the screen open out of the centre button (see
 * `RoomStage`), which no stack transition can do.
 *
 * `/room` still exists as a route for anything that links to it, and all it
 * does is call `openBlendn()` and step out of the way.
 */

let open = false
/** A PersonCard to open once the Room is there: a wave's banner opens the overlay at its sender (SCRUM-630). */
let pendingPerson: string | null = null
/**
 * The pass to dock, asked for by an event's own "Blend in" (Flow 3 Discovery
 * #04–#06): Tonight docks this event's VenuePass whether or not the fence says
 * you're inside — the server is the gate, and outside it says "Not quite there
 * yet". Kept while the overlay is open.
 */
let door: TonightEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

function set(next: boolean) {
  if (open === next) return
  open = next
  notify()
}

/** Open the overlay; with `personId`, at that person's card in the Room. */
export function openBlendn(personId?: string): void {
  if (personId) {
    pendingPerson = personId
    if (open) notify()
  }
  set(true)
}

/**
 * Open the overlay at an event's pass: the only way an event page checks you
 * in. From a pushed screen, get back to the tabs first (the overlay is under
 * the root stack).
 */
export function openPass(event: TonightEvent): void {
  door = event
  if (open) notify()
  set(true)
}

export function getDoor(): TonightEvent | null {
  return door
}

export function useDoor(): TonightEvent | null {
  return useSyncExternalStore(subscribe, getDoor, getDoor)
}

/** The card the overlay was asked to open at, once: reading it clears it. */
export function takePendingPerson(): string | null {
  const id = pendingPerson
  pendingPerson = null
  return id
}

export function peekPendingPerson(): string | null {
  return pendingPerson
}

/**
 * Whether the disc last said "live" (checked in): while the Room has not
 * loaded yet, the overlay draws the Room's skeleton (Flow 4 Room #01) rather
 * than Tonight's. A hint only; the Room's own load decides.
 */
let liveHint = false
export function setLiveHint(live: boolean): void {
  liveHint = live
}
export function isLiveHint(): boolean {
  return liveHint
}

/** Called by the overlay once its closing transition has finished. */
export function blendnClosed(): void {
  pendingPerson = null
  door = null
  set(false)
}

export function isBlendnOpen(): boolean {
  return open
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useBlendnOpen(): boolean {
  return useSyncExternalStore(subscribe, isBlendnOpen, isBlendnOpen)
}

/** The pending card's id, re-read whenever the overlay is asked to open at one. */
export function usePendingPerson(): string | null {
  return useSyncExternalStore(subscribe, peekPendingPerson, peekPendingPerson)
}
