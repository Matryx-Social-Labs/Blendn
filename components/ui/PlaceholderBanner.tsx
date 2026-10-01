import { StyleSheet, View } from 'react-native'

import { Text } from './Text'
import { EMBER, EMBER_RADIUS, SPACE, tint } from '../../lib/theme'

/**
 * "PLACEHOLDER DESIGN — logic is final, layout is not."
 *
 * On every screen built before its design (docs/PLACEHOLDER_SCREENS.md), so
 * nobody mistakes one for finished work in a demo or a TestFlight build. Not
 * `__DEV__`-only: testers are exactly who must not mistake it. It goes when the
 * screen is designed, with its section in that doc.
 *
 * Red text on a red tint rather than white on red: white on `destructive`
 * fails contrast.
 */
export function PlaceholderBanner() {
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text variant="label" color={EMBER.destructive}>
        PLACEHOLDER DESIGN — logic is final, layout is not
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.sm,
    backgroundColor: tint(EMBER.destructive, 0.12),
  },
})
