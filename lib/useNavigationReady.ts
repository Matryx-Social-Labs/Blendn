import { useNavigationContainerRef } from 'expo-router'
import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether the root navigator can take a navigation yet (RC drive 2 D-1).
 *
 * Android relaunches the Activity on a system font-size change (`fontScale` is not in the manifest's `configChanges`), and
 * the app runs again in the same JS runtime: auth is already resolved, so the root guard's redirect fired on the very first
 * mount, before the new navigation container was ready, and expo-router threw "Attempted to navigate before mounting the
 * Root Layout component" (2 of 2 drives). A cold start never hit it only because auth is still loading on the first mount.
 *
 * The same container ref expo-router asserts on (`store.navigationRef`), re-read when it says it is ready or its state moves.
 */
export function useNavigationReady(): boolean {
  const ref = useNavigationContainerRef()
  const subscribe = useCallback(
    (changed: () => void) => {
      const offReady = ref.addListener('ready' as never, changed)
      const offState = ref.addListener('state', changed)
      return () => {
        offReady?.()
        offState?.()
      }
    },
    [ref],
  )
  return useSyncExternalStore(subscribe, () => ref.isReady())
}
