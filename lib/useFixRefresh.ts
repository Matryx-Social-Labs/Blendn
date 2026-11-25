import * as Location from 'expo-location'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { LOCATION_FIX_TIMEOUT_MS, withDeadline } from './locationFix'
import { fixOf, type PreciseFix } from './roomButton'

/** How often the Pulse asks where you are while it is in front of you: well inside the map's "Last seen" (`STALE_AFTER_MS`). */
export const FIX_REFRESH_MS = 60_000

/**
 * The Pulse's own fix, kept current while the app is in front of you (SCRUM-1324).
 *
 * It was read once at mount and then only from the last-known position on a return to the app, which was dropped for the
 * old fix when it was within a kilometre: the timestamp never moved, and the map's "Last seen here N min ago · updating"
 * counted up for ever. Now a new fix (with its own time) is asked on every return and every `FIX_REFRESH_MS` while active.
 * Foreground only: a timer that fires while the app is going to sleep asks nothing, and there is no background location.
 * The permission is read first on every ask, so a grant or a refusal made in Settings is seen on the way back.
 */
export function useFixRefresh(on: { permission: (status: string) => void; fix: (fix: PreciseFix) => void }): void {
  const onRef = useRef(on)
  onRef.current = on
  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          if (cancelled) return null
          onRef.current.permission(status)
          return status === 'granted'
            ? withDeadline(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATION_FIX_TIMEOUT_MS)
            : null
        })
        .then((position) => {
          if (position && !cancelled) onRef.current.fix(fixOf(position))
        })
        // A refused or unavailable fix keeps the one before; the map says how old it is, and the next ask may get one.
        .catch(() => {})
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh()
    }, FIX_REFRESH_MS)
    return () => {
      cancelled = true
      sub.remove()
      clearInterval(timer)
    }
  }, [])
}
