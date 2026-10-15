import { Ionicons } from '@expo/vector-icons'
import { StyleSheet } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'
import ScalePress from '../motion/ScalePress'

/**
 * "My location", over the map, bottom-right just above the drawer. Filled
 * while the map follows you, outlined once you have moved it away. Hidden while
 * the drawer is full. PLACEHOLDER DESIGN — the design kit has no recenter
 * control (SCRUM-667); built from the app's icon set and tokens.
 */
export function LocateButton({
  visible,
  following,
  bottom,
  onPress,
}: {
  visible: boolean
  following: boolean
  /** How far above the screen's foot it sits: the drawer's height plus a gap. */
  bottom: number
  onPress: () => void
}) {
  if (!visible) return null
  return (
    <ScalePress
      onPress={onPress}
      style={[styles.button, { bottom }]}
      accessibilityRole="button"
      accessibilityLabel="Show my location"
      accessibilityState={{ selected: following }}
    >
      <Ionicons name={following ? 'navigate' : 'navigate-outline'} size={ICON.md} color={EMBER.textPrimary} />
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: SPACE.lg,
    width: CONTROL.md,
    height: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: EMBER.separator,
    backgroundColor: EMBER.bg,
  },
})
