import * as Location from 'expo-location'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { FIX_MAX_AGE_MS, fixOf, type PreciseFix } from './roomButton'

export const FIX_REFRESH_MS = 60_000

// RED: today's behaviour, extracted as-is (last-known on a return, nothing while open).
export function useFixRefresh(on: { permission: (status: string) => void; fix: (fix: PreciseFix) => void }): void {
  const onRef = useRef(on)
  onRef.current = on
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      Location.getForegroundPermissionsAsync()
        .then(({ status }) => {
          onRef.current.permission(status)
          return status === 'granted' ? Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS }) : null
        })
        .then((position) => {
          if (position) onRef.current.fix(fixOf(position))
        })
        .catch(() => {})
    })
    return () => sub.remove()
  }, [])
}
