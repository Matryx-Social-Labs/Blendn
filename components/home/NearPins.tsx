import { Marker } from '@maplibre/maplibre-react-native'
import { memo } from 'react'
import Animated, { FadeIn } from 'react-native-reanimated'

import { Badge } from '../ds/MonoFamily'
import { COLOR, DURATION, SPACE } from '../../lib/design/tokens'
import { getDistanceKm } from '../../lib/geo'
import type { NearPin } from '../../lib/placesPane'

/**
 * A pin this close to your fix is drawn lifted clear of the you-dot, which the map draws over every marker (rc7 D16: the
 * "4" sat under the blue dot). ponytail: a distance, not pixels, so it holds at the zoom "Show on map" fits the five
 * nearest to (about 10 m a point at street level); measure against the camera's zoom if pins collide elsewhere.
 */
export const NEAR_YOU_KM = 0.15
/** How far a pin near you is lifted, in points: the badge's 22 and a little air, above the dot. */
export const LIFT_NEAR_YOU = SPACE.xl

const FADE_IN = FadeIn.duration(DURATION.quick)

/**
 * Places' five nearest, numbered as their rows are (B4): the design system's `Badge` (white, ink digits, Geist
 * Mono 700) with a scrim ring, so it reads on any map ground. Decorative: the rows carry the words, so the map
 * stays out of the reading order. Fades in over `DURATION.quick`; Reduce Motion is the same fade (a fade is not
 * movement).
 */
export const NearPins = memo(function NearPins({ pins, you = null }: { pins: NearPin[]; you?: { latitude: number; longitude: number } | null }) {
  const nearYou = (pin: NearPin) => !!you && getDistanceKm(you.latitude, you.longitude, pin.lat, pin.lon) < NEAR_YOU_KM
  return (
    <>
      {pins.map((pin) => (
        <Marker key={pin.id} id={`near-${pin.id}`} lngLat={[pin.lon, pin.lat]} anchor="center" offset={nearYou(pin) ? [0, -LIFT_NEAR_YOU] : undefined}>
          <Animated.View entering={FADE_IN} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`near-pin-${pin.n}`}>
            <Badge text={pin.n} size={22} ring={COLOR.scrim} />
          </Animated.View>
        </Marker>
      ))}
    </>
  )
})
