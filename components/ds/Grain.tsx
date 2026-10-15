import { Image, StyleSheet, View } from 'react-native'

import { COLOR } from '../../lib/design/tokens'

const TILE = require('../../assets/grain-256.png')

/**
 * The grain (guidelines/backdrop/grain.html): one static 256 pt noise tile,
 * repeated, at `grainAlpha` over the orbs. It kills banding on OLED near-black.
 * Never animated. Fills its parent; decorative and untouchable.
 */
export function Grain({ testID }: { testID?: string }) {
  return (
    <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Image testID={testID && `${testID}-tile`} source={TILE} resizeMode="repeat" style={[StyleSheet.absoluteFill, styles.tile]} />
    </View>
  )
}

const styles = StyleSheet.create({
  tile: { width: undefined, height: undefined, opacity: COLOR.grainAlpha },
})
