import * as Notifications from 'expo-notifications'
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

/**
 * What the phone itself says about notifications, apart from what the account says.
 *
 * `blocked` is a no the app can no longer ask past: iOS after the first
 * refusal, Android once "Don't ask again" is set. Only the phone's Settings can
 * undo it, so a switch shows off whatever the account says, and turning it on
 * explains that instead of saving a preference nothing will ever deliver on.
 * `askable` is a phone that has not said yes or no yet (or that can still be asked).
 */
export type OsPush = 'granted' | 'askable' | 'blocked'

export async function readOsPush(): Promise<OsPush> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync()
    if (status === 'granted') return 'granted'
    return canAskAgain ? 'askable' : 'blocked'
  } catch {
    // Unknown reads as askable: the switch then behaves as it always did.
    return 'askable'
  }
}

/**
 * The phone's answer, read now and on every return to the app: the fix for
 * `blocked` is a trip to the phone's Settings, and coming back should show
 * that it worked. `refresh` re-reads on demand (after a Turn on).
 */
export function useOsPush(): { os: OsPush; refresh: () => Promise<void> } {
  const [os, setOs] = useState<OsPush>('askable')
  const refresh = useCallback(async () => setOs(await readOsPush()), [])
  useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])
  return { os, refresh }
}
