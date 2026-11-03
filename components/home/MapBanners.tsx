import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'

import { SPACE } from '../../lib/design/tokens'
import { bannerRide } from '../../lib/homeMap'

/**
 * The Pulse's where-you-are banners on the map (Flow 3 · Pulse, Option C: the travel banner, the switch offer, the away
 * notice): above "my location", riding the drawer's edge and fading as it rises to full, so they never push the lead
 * card under the tab bar. At full (and for a screen reader, which opens the drawer full) the Pulse draws them in its list.
 */
export function MapBanners({ drawerTop, drawer, visible, children }: { drawerTop: SharedValue<number>; drawer: { half: number; full: number }; visible: boolean; children: ReactNode }) {
  const height = useSharedValue(0)
  const ride = useAnimatedStyle(() => {
    const { translateY, opacity } = bannerRide(drawerTop.get(), drawer, height.get())
    return { transform: [{ translateY }], opacity }
  })
  if (!children) return null
  return (
    <Animated.View
      testID="home-map-banners"
      onLayout={(e) => height.set(e.nativeEvent.layout.height)}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.rider, ride]}
    >
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // PulseBanners carries the gutter on each banner; the map's own edge is a little closer.
  rider: { position: 'absolute', top: 0, left: -SPACE.sm, right: -SPACE.sm },
})
