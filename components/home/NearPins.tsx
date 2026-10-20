import { Marker } from '@maplibre/maplibre-react-native'
import { memo } from 'react'
import Animated, { FadeIn } from 'react-native-reanimated'

import { Badge } from '../ds/MonoFamily'
import { COLOR, DURATION } from '../../lib/design/tokens'
import type { NearPin } from '../../lib/placesPane'

const FADE_IN = FadeIn.duration(DURATION.quick)

/**
 * Places' five nearest, numbered as their rows are (B4): the design system's `Badge` (white, ink digits, Geist
 * Mono 700) with a scrim ring, so it reads on any map ground. Decorative: the rows carry the words, so the map
 * stays out of the reading order. Fades in over `DURATION.quick`; Reduce Motion is the same fade (a fade is not
 * movement).
 */
export const NearPins = memo(function NearPins({ pins }: { pins: NearPin[] }) {
  return (
    <>
      {pins.map((pin) => (
        <Marker key={pin.id} id={`near-${pin.id}`} lngLat={[pin.lon, pin.lat]} anchor="center">
          <Animated.View entering={FADE_IN} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`near-pin-${pin.n}`}>
            <Badge text={pin.n} size={22} ring={COLOR.scrim} />
          </Animated.View>
        </Marker>
      ))}
    </>
  )
})
