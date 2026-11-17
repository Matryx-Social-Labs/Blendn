import { useLowPowerMode } from 'expo-battery'
import { NetworkStateType, useNetworkState } from 'expo-network'

/**
 * When media should save the battery or the data plan (pulse-media 06, owner approved 2026-11-17): Low Power (or Android's
 * power saver), and a cellular network. A clip then shows its poster and stills still rotate. iOS Low Data itself is not
 * readable; AVPlayer already honours it.
 */
export function useMediaSaver(): { lowPower: boolean; expensiveNetwork: boolean } {
  const lowPower = useLowPowerMode()
  const { type } = useNetworkState()
  return { lowPower, expensiveNetwork: type === NetworkStateType.CELLULAR }
}
