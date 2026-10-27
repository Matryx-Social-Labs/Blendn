import { useIsFocused } from 'expo-router'
import { useEffect, useReducer } from 'react'

import type { SessionTime } from '../components/ds/SessionSheet'
import type { VenueDetail } from './apiClient'
import { remainingMs } from './goLive'
import { serverNow } from './serverClock'
import { nextTickMs, sessionTime } from './venuePage'

type Window = Pick<VenueDetail['live'], 'expiresAt' | 'stay' | 'stayUntil'>

/**
 * Where your window at a place stands, kept current: stepped once a minute,
 * each second in the last five. A leaf's hook: it ticks only its own component
 * (the pill, the ring, the sheet), only while the screen is focused, so the
 * page above it does not re-render every second.
 *
 * The clock is the server's (`serverNow`) and every read is of the render's own
 * moment, never of the last tick, so an extension that moves `expiresAt`
 * re-reads at once. At zero with the server still saying live, `onZero` asks it
 * again every few seconds until the window is gone (M10).
 */
export function useSessionTime(live: Window, onZero: () => void): SessionTime | null {
  const focused = useIsFocused()
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!focused) return
    const delay = nextTickMs(live, serverNow())
    if (delay === null) return
    const timer = setTimeout(() => {
      if (remainingMs(live.expiresAt, serverNow()) === 0) onZero()
      bump()
    }, delay)
    return () => clearTimeout(timer)
    // `live` is read through its two fields: the page hands over a new object on every read of the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, live.expiresAt, live.stay, tick, onZero])
  return sessionTime(live, serverNow())
}
