import { useEffect, useState } from 'react'
import { InteractionManager, StyleSheet } from 'react-native'
import MapView from 'react-native-maps'
import Animated, { FadeIn } from 'react-native-reanimated'

import { DURATION } from '../../lib/design/tokens'
import { DARK_MAP_STYLE, LOCATION_CARD_DELTA } from '../../lib/mapStyle'

/**
 * The picture under the Where card's pin (guidelines/components/MapCard.html:
 * "the screen draws the map itself"): the platform's own map, every gesture
 * off, because the tap belongs to the card and opens Maps. A picture of the
 * place, never a boundary: the check-in area is not in any payload.
 *
 * It mounts after the page has settled and fades in, so a card already on
 * screen is not interrupted; the fade is already the reduced form. Apple's and
 * Google's maps credit themselves; this draws none of our OSM tiles, so the
 * home map's credit (About › Map data) is not owed here.
 */
export function VenueMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true))
    return () => task.cancel()
  }, [])
  if (!ready) return null
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(DURATION.base)} pointerEvents="none">
      <MapView
        style={StyleSheet.absoluteFill}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{ latitude, longitude, latitudeDelta: LOCATION_CARD_DELTA, longitudeDelta: LOCATION_CARD_DELTA }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        liteMode
        pointerEvents="none"
        accessible={false}
      />
    </Animated.View>
  )
}
