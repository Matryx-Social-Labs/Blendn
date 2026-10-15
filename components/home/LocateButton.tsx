import { StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import { ICON as GLYPH } from '../../lib/design/tokens'
import { locateRide } from '../../lib/homeMap'
import { MAP_THEME } from '../../lib/mapTheme'
import { EMBER, EMBER_RADIUS, OPACITY, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'
import { Icon } from '../ui/Icon'

/**
 * "My location", riding a gap above the drawer as it moves (`locateRide`):
 * fading out as the drawer rises past half, untouchable and unread at full.
 * Following you: the glyph bright, its stroke stepped up; moved away: dimmer
 * and lighter (the icon set is outlined only). Asking for a fix: dimmed and
 * busy until the ask settles, so a second tap is not lost in silence.
 * PLACEHOLDER DESIGN — the design kit has no recenter control (SCRUM-667).
 */
export function LocateButton({
  visible,
  following,
  pending,
  drawerTop,
  drawer,
  onPress,
}: {
  /** False at full: still drawn while its fade finishes, but neither tapped nor read. */
  visible: boolean
  following: boolean
  /** Asking the phone for a fix. */
  pending: boolean
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
  return (
    <Animated.View
      style={[styles.rider, ride]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <ScalePress
        onPress={onPress}
        disabled={pending}
        style={[styles.button, pending && styles.pending]}
        accessibilityRole="button"
        accessibilityLabel="Show my location"
        accessibilityState={{ selected: following, busy: pending, disabled: pending }}
      >
        <Icon name="navigation" size={GLYPH.control} color={following ? EMBER.textPrimary : EMBER.textSecondary} active={following} />
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
  pending: { opacity: OPACITY.disabled },
})
