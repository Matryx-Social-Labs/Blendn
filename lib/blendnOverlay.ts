import { useSyncExternalStore } from 'react'

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
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (open === next) return
  open = next
  for (const fn of listeners) fn()
}

export function openBlendn(): void {
  set(true)
}

/** Called by the overlay once its closing transition has finished. */
export function blendnClosed(): void {
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
