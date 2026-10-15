import { Ionicons } from '@expo/vector-icons'
import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { locateRide } from '../../lib/homeMap'
import { MAP_THEME } from '../../lib/mapTheme'
import { EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'

/**
 * "My location", riding a gap above the drawer as it moves (`locateRide`):
 * filled while the map follows you, outlined once you have moved it away,
 * fading out as the drawer rises past half, and not there at full. Icon only.
 * PLACEHOLDER DESIGN — the design kit has no recenter control (SCRUM-667).
 */
export function LocateButton({
  visible,
  following,
  drawerTop,
  drawer,
  onPress,
}: {
  visible: boolean
  following: boolean
  /** The drawer's top edge, as it animates. */
  drawerTop: SharedValue<number>
  /** The drawer's top edge at half and at full. */
  drawer: { half: number; full: number }
  onPress: () => void
}) {
  const ride = useAnimatedStyle(() => {
    const { translateY, opacity } = locateRide(drawerTop.get(), drawer)
    return { transform: [{ translateY }], opacity }
  })
  if (!visible) return null
  return (
    <Animated.View style={[styles.rider, ride]}>
      <ScalePress
        onPress={onPress}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Show my location"
        accessibilityState={{ selected: following }}
      >
        <Ionicons name={following ? 'navigate' : 'navigate-outline'} size={ICON.md} color={EMBER.textPrimary} />
      </ScalePress>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  rider: { position: 'absolute', top: 0, right: SPACE.lg },
  // The weight of the app's other floating controls: the page colour at 60%, no border.
  button: {
    width: MAP_THEME.locate.sizePx,
    height: MAP_THEME.locate.sizePx,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.scrim,
  },
})
