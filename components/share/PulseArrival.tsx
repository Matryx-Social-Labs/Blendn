import { router, type Href } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useArrival } from '../../lib/arrivalLink'
import { SPACE } from '../../lib/design/tokens'
import { TOP_BAR_HEIGHT } from '../pulse/PulseTopBar'
import { ArrivalBanner } from './ArrivalBanner'

/**
 * The arrival banner over the Pulse, under its top bar (Flow 16 · 16.7): drawn at most once for a person who arrived from
 * a shared link and had to install the app first (`lib/arrivalLink.ts`). Open goes to the event or the venue; both Open
 * and × end it.
 */
export function PulseArrival() {
  const arrival = useArrival()
  const insets = useSafeAreaInsets()
  const [gone, setGone] = useState(false)
  if (!arrival || gone) return null
  return (
    <View pointerEvents="box-none" style={[styles.slot, { top: insets.top + TOP_BAR_HEIGHT }]}>
      <ArrivalBanner
        testID="pulse-arrival"
        title={arrival.title}
        meta={arrival.meta}
        cover={arrival.cover}
        onOpen={() => {
          setGone(true)
          router.push(arrival.route as Href)
        }}
        onDismiss={() => setGone(true)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter },
})
