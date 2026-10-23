import { useSyncExternalStore } from 'react'

/**
 * One sheet's Modal on screen at a time on iOS, across the whole app (RC drive 4 D-9, D-8).
 *
 * The app-level sheets live in hosts that know nothing of each other: the presence monitor's "Checked out", Go Live's
 * "Your live time is up", `showSheet`'s host, the share tray. On iOS a Modal presented while another is on screen (or
 * still leaving) is refused by UIKit, but React Native has already marked it presented: the sheet never draws, its
 * owner thinks it was shown, and the app took no taps until it was relaunched. That was the 15:45 freeze on drive 4: the
 * expiry prompt asked for the screen while "Checked out" held it, and the night's one prompt was spent unseen.
 *
 * So a sheet asks for the turn before its Modal mounts and gives it back once its Modal has gone; one asked for while
 * another holds it waits, in order, and opens when it is free. A sheet drawn inside another sheet's Modal presents
 * from that Modal and does not queue (`Sheet` passes it through). Android presents a Modal over another, so nothing
 * there queues: two sheets drawn at once stay two sheets.
 */
export type Turn = object

let holder: Turn | null = null
let queue: readonly Turn[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Ask for the screen. Free, it is yours at once; held by another, you wait behind whoever asked first. */
export function requestTurn(turn: Turn): void {
  if (holder === turn || queue.includes(turn)) return
  if (holder === null) {
    holder = turn
    emit()
    return
  }
  queue = [...queue, turn]
}

/** Gone (or never wanted after all): the next in line gets the screen. Idempotent; a waiter that gives up leaves the line. */
export function releaseTurn(turn: Turn): void {
  if (holder !== turn) {
    queue = queue.filter((t) => t !== turn)
    return
  }
  const [next = null, ...rest] = queue
  holder = next
  queue = rest
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether `turn` holds the screen now. */
export function useHoldsTurn(turn: Turn): boolean {
  return useSyncExternalStore(subscribe, () => holder === turn, () => holder === turn)
}

/** Tests only: nobody holds the screen and nobody waits. */
export function resetModalTurns(): void {
  holder = null
  queue = []
  emit()
}
