import { Marker } from '@maplibre/maplibre-react-native'
import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

import { COLOR, DURATION, FONT_FAMILY } from '../../lib/design/tokens'
import type { NearPin } from '../../lib/placesPane'

// design-exception: BUILD-SPEC B4 — a 26 pt disc with a 3 pt scrim ring, numbered in Geist Mono 12
const PIN = 26
const RING = 3
const FADE_IN = FadeIn.duration(DURATION.quick)

/**
 * Places' five nearest, numbered as their rows are (B4): a white disc with the row's number in ink and a scrim
 * ring. Decorative: the rows carry the words, so the map stays out of the reading order. Fades in over
 * `DURATION.quick`; Reduce Motion is the same fade (a fade is not movement).
 */
export const NearPins = memo(function NearPins({ pins }: { pins: NearPin[] }) {
  return (
    <>
      {pins.map((pin) => (
        <Marker key={pin.id} id={`near-${pin.id}`} lngLat={[pin.lon, pin.lat]} anchor="center">
          <Animated.View entering={FADE_IN} style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`near-pin-${pin.n}`}>
            <View style={styles.disc}>
              <Text style={styles.number}>{pin.n}</Text>
            </View>
          </Animated.View>
        </Marker>
      ))}
    </>
  )
})

const styles = StyleSheet.create({
  ring: { width: PIN + RING * 2, height: PIN + RING * 2, borderRadius: (PIN + RING * 2) / 2, backgroundColor: COLOR.scrim, alignItems: 'center', justifyContent: 'center' },
  disc: { width: PIN, height: PIN, borderRadius: PIN / 2, backgroundColor: COLOR.textPrimary, alignItems: 'center', justifyContent: 'center' },
  // design-exception: Geist Mono 700 12 on the pin
  number: { fontFamily: FONT_FAMILY.mono[700], fontSize: 12, lineHeight: 16, color: COLOR.ink, fontVariant: ['tabular-nums'] },
})
