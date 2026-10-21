import { useSyncExternalStore } from 'react'
import Animated, { useReducedMotion } from 'react-native-reanimated'

import { Banner } from './ds/Banner'
import { bannerFadeIn, bannerIn, bannerOut } from './motion/presence'
import { getNetworkState, subscribeNetworkState } from '../lib/networkStatus'

/** Whether the last request said the network is gone (`lib/networkStatus`), followed live. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeNetworkState, getNetworkState) === 'offline'
}

/**
 * The system banner a screen shows while offline (Flow 15 #16, R4.1: the Scene, Nearby and Rate had none): the same DS
 * `Banner` the Pulse and Places use. DS #44: it slides 16 pt and fades in over `base` and leaves in a quick fade (Reduce
 * Motion: the fade alone). Reads stay; the screen disables what would write. Announced politely by the Banner itself;
 * no haptic.
 */
export function OfflineBanner({ text, testID }: { text: string; testID?: string }) {
  const offline = useOffline()
  const reduceMotion = useReducedMotion()
  if (!offline) return null
  return (
    <Animated.View entering={reduceMotion ? bannerFadeIn : bannerIn} exiting={bannerOut}>
      <Banner kind="offline" text={text} testID={testID} />
    </Animated.View>
  )
}
