import { router } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'

import { openBlendn } from '../lib/blendnOverlay'
import { EMBER } from '../lib/theme'

/**
 * `/room` — kept as an address, not a screen.
 *
 * The Room is the Blend'n overlay now, hosted by the tab layout
 * (`components/blendn/BlendnScreen.tsx`, `lib/blendnOverlay.ts`), because a
 * modal route could not have a chat or a profile pushed on top of it on iOS.
 * Anything that still links here — an old notification, a deep link — opens
 * the overlay and steps out of the way, so the address keeps working.
 */
export default function RoomRoute() {
  useEffect(() => {
    openBlendn()
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/events')
  }, [])
  return <View style={{ flex: 1, backgroundColor: EMBER.bg }} />
}
