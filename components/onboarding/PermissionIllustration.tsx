import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import { COLOR, RADIUS } from '../../lib/design/tokens'

/**
 * The picture in the middle of the location step (direction A): a still of the lit map, where the app lights the places that
 * have something on, in place of the creature radar (no creature glyphs on onboarding, owner). It is decorative, hidden from a
 * screen reader (the question and its sentence say what the step is for), and names no city until the catalogue knows where
 * the person is (SCRUM-997).
 */

const MAP = require('../../assets/onboarding/location-map.jpg')
const MAP_HEIGHT = 300
/** The map card's height with the "Precise location is off" notice above it (the frame draws 232). */
export const MAP_HEIGHT_WITH_NOTICE = 232

export function LocationIllustration({ notice = false }: { notice?: boolean }) {
  return (
    <View
      testID="location-map"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, { height: notice ? MAP_HEIGHT_WITH_NOTICE : MAP_HEIGHT }]}
    >
      <Image source={MAP} contentFit="cover" style={StyleSheet.absoluteFill} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
})
