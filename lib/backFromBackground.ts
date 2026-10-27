import { useEffect } from 'react'
import { AppState } from 'react-native'

import { useLatest } from './useLatest'

/**
 * Back from the background (motion #49). After more than this away, a screen does not replay what it missed: it asks
 * once for how things are now, so a count rolls once to its present value, and what arrived meanwhile does not arrive
 * again. A shorter absence changes nothing.
 */
export const BACK_AFTER_MS = 60_000
/** How long after a long return a list's new rows come in without their arrival motion (the one catch-up sync lands in this). */
const CATCH_UP_QUIET_MS = 4000

/** A pure rule so the threshold is one place: strictly more than a minute. */
export const awayLongEnough = (awayMs: number) => awayMs > BACK_AFTER_MS

let quietUntil = 0

/**
 * Whether a row that has just appeared should play its arrival: false while the catch-up after a long absence lands
 * ("missed arrivals aren't replayed"), true otherwise. Read it where an entering animation or a "new" flash is chosen.
 */
export function playsArrival(now: number = Date.now()): boolean {
  return now >= quietUntil
}

/** The foreground return, for a test or a screen that must act on it without the hook. */
export function noteReturn(awayMs: number, now: number = Date.now()): boolean {
  if (!awayLongEnough(awayMs)) return false
  quietUntil = now + CATCH_UP_QUIET_MS
  return true
}

/**
 * Calls `onBack(awayMs)` when the app returns to the foreground after more than `BACK_AFTER_MS`, and starts the quiet
 * window `playsArrival` reads. The callback may change between renders.
 */
export function useBackFromBackground(onBack: (awayMs: number) => void, enabled = true) {
  const latest = useLatest(onBack)
  useEffect(() => {
    if (!enabled) return
    let leftAt: number | null = null
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        const away = leftAt === null ? 0 : Date.now() - leftAt
        leftAt = null
        if (noteReturn(away)) latest.current(away)
      } else if (leftAt === null) {
        leftAt = Date.now()
      }
    })
    return () => sub.remove()
  }, [enabled, latest])
}
