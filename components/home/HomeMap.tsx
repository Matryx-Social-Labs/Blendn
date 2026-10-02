import { useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import MapView from 'react-native-maps'

import { DARK_MAP_STYLE } from '../../lib/mapStyle'

/** Where the map opens before the phone has a fix: central Bengaluru. */
const DEFAULT_CENTRE = { latitude: 12.9716, longitude: 77.5946 }
/** About a neighbourhood across. */
const CITY_DELTA = 0.06

/**
 * The map behind the home drawer — PLACEHOLDER (plan v2 step 2, PR A).
 *
 * A plain dark 2D map you can pan, centred on where the Pulse says you are.
 * The 3D map (MapLibre, buildings lit for events and venues) replaces this in
 * PR B. Draws no pins yet, and never a check-in boundary: no payload carries
 * one, and `__tests__/homeMap.test.ts` refuses the shapes that would draw it.
 */
export function HomeMap({
  center,
  cityCentre,
}: {
  center: { latitude: number; longitude: number } | null
  /** The picked city's centre: the map goes there whenever the city changes. */
  cityCentre: { latitude: number; longitude: number } | null
}) {
  const map = useRef<MapView>(null)
  const centred = useRef(false)

  // Once, when the fix first arrives: after that the map is the person's to move.
  useEffect(() => {
    if (!center || centred.current) return
    centred.current = true
    map.current?.animateToRegion({ ...center, latitudeDelta: CITY_DELTA, longitudeDelta: CITY_DELTA }, 0)
  }, [center])

  // A city picked in the Pulse is a place to look at: follow it.
  useEffect(() => {
    if (!cityCentre) return
    map.current?.animateToRegion({ ...cityCentre, latitudeDelta: CITY_DELTA, longitudeDelta: CITY_DELTA }, 400)
  }, [cityCentre?.latitude, cityCentre?.longitude]) // eslint-disable-line react-hooks/exhaustive-deps -- the point, not the object

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      customMapStyle={DARK_MAP_STYLE}
      userInterfaceStyle="dark"
      initialRegion={{ ...(center ?? DEFAULT_CENTRE), latitudeDelta: CITY_DELTA, longitudeDelta: CITY_DELTA }}
      showsUserLocation={center !== null}
      toolbarEnabled={false}
      accessibilityLabel="Map"
    />
  )
}
