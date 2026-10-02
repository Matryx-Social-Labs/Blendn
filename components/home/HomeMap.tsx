import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type MapRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, type NativeSyntheticEvent } from 'react-native'

import { eventFromApi } from '../../lib/api'
import { apiClient } from '../../lib/apiClient'
import { BUILDING_SEARCH_PX, buildingUnder, pinsFor, shadeOf, viewportQuery, type Bounds, type Pin } from '../../lib/homeMap'
import { Logger } from '../../lib/logger'
import { BUILDING_LAYER_ID, EMBER_MAP_STYLE } from '../../lib/mapStyleEmber'
import { EMBER, SPACE } from '../../lib/theme'

/** Where the map opens before the phone has a fix: central Bengaluru. */
const DEFAULT_CENTRE: [number, number] = [77.5946, 12.9716]
/** Close enough for buildings (they start at 14), wide enough for a neighbourhood. */
const ZOOM = 15
/** Tilted, so the lit buildings read as buildings (plan v2 §4: 45–60°). */
const PITCH = 55
/** A pan settles before the server is asked; the list routes allow 60 a minute. */
const QUERY_DEBOUNCE_MS = 600
/** How many pins one viewport asks for. */
const PIN_LIMIT = 50

type FeatureCollection = { type: 'FeatureCollection'; features: unknown[] }
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * The map behind the home drawer (plan v2 §4, step 2 PR B): MapLibre over
 * OpenFreeMap, restyled dark in Ember, tilted.
 *
 * - **Pins follow the segment**: events on Events, venues on Places, for the
 *   part of the map on screen (its centre and a radius reaching its corners,
 *   the same `lat`/`lon`/`radius` the lists take). Which venues exist is the
 *   server's rule; the map draws what it is sent.
 * - **The building under a pin is lit**: once the map has drawn, each pin's
 *   building is found among the rendered ones and drawn again over it in the
 *   event shade (ember) or the venue shade (violet-rose), brighter when live.
 *   MapLibre RN has no `setFeatureState`, so the lit copy is a GeoJSON layer of
 *   the same footprints and heights. Where there is no building, the pin's glow
 *   is all there is.
 * - **Glow steps with the bucket** at a venue (quiet → 20+), never a number.
 * - **The check-in boundary is never drawn.** No payload carries it.
 */
export function HomeMap({
  center,
  segment,
  topInset,
}: {
  center: { latitude: number; longitude: number } | null
  segment: 'events' | 'places'
  /** Where the top bar ends, so the attribution is not under it. */
  topInset: number
}) {
  const map = useRef<MapRef>(null)
  const camera = useRef<CameraRef>(null)
  const centred = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const needsLight = useRef(false)
  const [query, setQuery] = useState<{ lat: number; lon: number; radius: number } | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [lit, setLit] = useState<FeatureCollection>(EMPTY)

  // Once, when the fix first arrives: after that the map is the person's to move.
  useEffect(() => {
    if (!center || centred.current) return
    centred.current = true
    camera.current?.jumpTo({ center: [center.longitude, center.latitude] })
  }, [center])

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current)
  }, [])

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const bounds = e.nativeEvent.bounds as Bounds
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setQuery(viewportQuery(bounds)), QUERY_DEBOUNCE_MS)
    needsLight.current = true
  }

  // The viewport or the segment changed: ask for that segment's pins.
  useEffect(() => {
    if (!query) return
    let stale = false
    const load =
      segment === 'places'
        ? apiClient
            .getVenues({ ...query, sortBy: 'distance', limit: PIN_LIMIT })
            .then((r) => (r.success && r.data ? pinsFor('places', { events: [], venues: r.data.venues }) : null))
        : apiClient
            .getEvents({ ...query, limit: PIN_LIMIT })
            .then((r) => (r.success && r.data ? pinsFor('events', { events: r.data.events.map(eventFromApi), venues: [] }) : null))
    void load.then((next) => {
      if (stale) return
      // A refused or failed read keeps the pins it had, rather than blanking the map.
      if (next) {
        needsLight.current = true
        setPins(next)
      } else Logger.warn('events', 'Home map pins did not load', { segment })
    })
    return () => {
      stale = true
    }
  }, [query, segment])

  /** Find each pin's building among those drawn, and light it. Runs once the tiles under new pins are drawn. */
  const light = async () => {
    const m = map.current
    if (!m || !needsLight.current) return
    needsLight.current = false
    const found = await Promise.all(
      pins.map(async (pin) => {
        try {
          const [x, y] = await m.project([pin.longitude, pin.latitude])
          const r = BUILDING_SEARCH_PX
          const drawn = await m.queryRenderedFeatures(
            [
              [x - r, y - r],
              [x + r, y + r],
            ],
            { layers: [BUILDING_LAYER_ID] }
          )
          const building = buildingUnder(pin, drawn as { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> | null }[])
          if (!building) return null
          return {
            type: 'Feature',
            geometry: building.geometry,
            properties: {
              id: pin.id,
              kind: pin.kind,
              color: shadeOf(pin.kind, pin.live),
              height: Number(building.properties?.render_height ?? 10),
              base: Number(building.properties?.render_min_height ?? 0),
            },
          }
        } catch (error) {
          Logger.warn('events', 'Could not light a building', { error: String(error) })
          return null
        }
      })
    )
    const features = found.filter((f) => f !== null)
    setLit({ type: 'FeatureCollection', features })
  }

  /** A pin or a lit building, tapped: the event or the place it stands for. */
  const openPlace = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const f = e.nativeEvent.features[0]
    const id = f?.properties?.id
    if (typeof id !== 'string') return
    router.push((f?.properties?.kind === 'venue' ? `/venue/${id}` : `/event/${id}`) as never)
  }

  const pinData = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: pins.map((p) => ({
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: { id: p.id, kind: p.kind, glow: p.glow, color: shadeOf(p.kind, p.live) },
      })),
    }),
    [pins]
  )

  return (
    <Map
      ref={map}
      style={StyleSheet.absoluteFill}
      mapStyle={EMBER_MAP_STYLE as never}
      logo={false}
      attribution
      attributionPosition={{ top: topInset + SPACE.sm, left: SPACE.sm }}
      compass={false}
      onRegionDidChange={onRegionDidChange}
      // Each frame drawn with every tile loaded; `needsLight` makes it once per new set of pins.
      // Not `onDidFinishRenderingMapFully`: on iOS that fires once, when the map first loads.
      onDidFinishRenderingFrameFully={() => void light()}
      accessibilityLabel="Map of events and places"
    >
      <Camera
        ref={camera}
        initialViewState={{ center: center ? [center.longitude, center.latitude] : DEFAULT_CENTRE, zoom: ZOOM, pitch: PITCH }}
      />
      {/* A pin inside a building is hidden by it, so the lit building is the marker: tap it too. */}
      <GeoJSONSource id="lit-buildings" data={lit as never} onPress={openPlace}>
        <Layer
          id="lit-buildings"
          type="fill-extrusion"
          paint={{
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-opacity': 0.95,
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource
        id="pins"
        data={pinData as never}
        onPress={openPlace}
      >
        <Layer
          id="pin-glow"
          type="circle"
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': ['*', ['get', 'glow'], 12],
            'circle-blur': 1,
            'circle-opacity': 0.5,
          }}
        />
        <Layer
          id="pin-dot"
          type="circle"
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': 6,
            'circle-stroke-color': EMBER.bg,
            'circle-stroke-width': 2,
          }}
        />
      </GeoJSONSource>
    </Map>
  )
}
