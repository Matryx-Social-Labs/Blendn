import { useSyncExternalStore } from 'react'
import Animated from 'react-native-reanimated'

import { Banner } from './ds/Banner'
import { fadeInFast, fadeOutFast } from './motion/presence'
import { getNetworkState, subscribeNetworkState } from '../lib/networkStatus'

/** Whether the last request said the network is gone (`lib/networkStatus`), followed live. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeNetworkState, getNetworkState) === 'offline'
}

/**
 * The system banner a screen shows while offline (Flow 15 #16, R4.1: the Scene, Nearby and Rate had none): the same DS
 * `Banner` the Pulse and Places use, fading in 150 ms and out 120 ms. Reads stay; the screen disables what would
 * write. Announced politely by the Banner itself; no haptic.
 */
export function OfflineBanner({ text, testID }: { text: string; testID?: string }) {
  const offline = useOffline()
  if (!offline) return null
  return (
    <Animated.View entering={fadeInFast} exiting={fadeOutFast}>
      <Banner kind="offline" text={text} testID={testID} />
    </Animated.View>
  )
}
