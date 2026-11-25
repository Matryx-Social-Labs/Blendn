import { useEffect, type ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { SPACE } from '../../lib/design/tokens'
import { bannerRide } from '../../lib/homeMap'

/**
 * The Pulse's where-you-are banners on the map (Flow 3 · Pulse, Option C: the travel banner, the switch offer, the away
 * notice): 22 pt above the drawer as the board's `.mbn` ("my location" lifts above them), riding the drawer's edge and fading as it rises to full, so they never push the lead
 * card under the tab bar. At full (and for a screen reader, which opens the drawer full) the Pulse draws them in its list.
 */
export function MapBanners({ drawerTop, drawer, visible, height, children }: { drawerTop: SharedValue<number>; drawer: { half: number; full: number }; visible: boolean; height: SharedValue<number>; children: ReactNode }) {
  const ride = useAnimatedStyle(() => {
    // The measured height carries the last banner's 8 pt foot (PulseBanners' item margin); the board measures to the glass.
    const { translateY, opacity } = bannerRide(drawerTop.get(), drawer, height.get() - SPACE.sm)
    return { transform: [{ translateY }], opacity }
  })
  // No banners: no height, so "my location" comes back down.
  useEffect(() => {
    if (!children) height.set(0)
  }, [children, height])
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
  // PulseBanners carries the 24 pt gutter on each banner; the board's `.mbn` is 16 in from the map's edge.
  rider: { position: 'absolute', top: 0, left: -SPACE.sm, right: -SPACE.sm },
})
