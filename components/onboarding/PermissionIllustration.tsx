import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import { COLOR, RADIUS } from '../../lib/design/tokens'
import type { LngLat } from '../../lib/mapLit'
import { useReducedMotion } from '../../lib/motion'
import { LiveCityMap } from './LiveCityMap'

/**
 * The picture in the middle of the location step (direction A): the app's lit map, live (`LiveCityMap`: the landing's
 * sequence, once), over a still of it. The still is what shows under Reduce Motion, offline, and until the live map has
 * fully drawn, so the step never shows a broken map. No creature glyphs on onboarding (owner). Decorative, hidden from a
 * screen reader (the question and its sentence say what the step is for), and it names no city (SCRUM-997).
 */

const MAP = require('../../assets/onboarding/location-map.jpg')
const MAP_HEIGHT = 300
/** The map card's height with the "Precise location is off" notice above it (the frame draws 232). */
export const MAP_HEIGHT_WITH_NOTICE = 232

export function LocationIllustration({
  notice = false,
  you = null,
  onShown,
  onLive,
}: {
  notice?: boolean
  you?: LngLat | null
  onShown?: () => void
  onLive?: (live: boolean) => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <View
      testID="location-map"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, { height: notice ? MAP_HEIGHT_WITH_NOTICE : MAP_HEIGHT }]}
    >
      <Image source={MAP} contentFit="cover" style={StyleSheet.absoluteFill} />
      {reduceMotion ? null : <LiveCityMap you={you} onShown={onShown} onLive={onLive} />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, overflow: 'hidden', backgroundColor: COLOR.surfaceSunken },
})
