import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  NativeUserLocation,
  type CameraRef,
  type MapRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native'
import { router } from 'expo-router'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, type NativeSyntheticEvent } from 'react-native'

import { eventFromApi } from '../../lib/api'
import { apiClient } from '../../lib/apiClient'
import {
  backoffMs,
  BUILDING_SEARCH_PX,
  buildingUnder,
  dedupeLit,
  insideLastCircle,
  LIGHT_MIN_ZOOM,
  lightSignature,
  loadPins,
  onScreen,
  roundQuery,
  shadeOf,
  shouldFollowCity,
  shouldFollowFix,
  viewportQuery,
  type Bounds,
  type LitBuilding,
  type Pin,
  type PinQuery,
} from '../../lib/homeMap'
import { Logger } from '../../lib/logger'
import { BUILDING_LAYER_ID, homeMapStyle, styleHost } from '../../lib/mapStyleEmber'
import { EMBER, SPACE } from '../../lib/theme'

/** Where the map opens before the phone has a fix: central Bengaluru. */
const DEFAULT_CENTRE: [number, number] = [77.5946, 12.9716]
/** Close enough for buildings (they start at 14), wide enough for a neighbourhood. */
const ZOOM = 15
/** Tilted, so the lit buildings read as buildings (plan v2 §4: 45–60°). */
const PITCH = 55
/** A pan settles before the server is asked; the lists allow 60 reads a minute. */
const QUERY_DEBOUNCE_MS = 600
/** How many pins one viewport asks for. */
const PIN_LIMIT = 50

type Point = { type: 'Point'; coordinates: [number, number] }
type PinFeature = { type: 'Feature'; id: string; geometry: Point; properties: { id: string; kind: string; glow: number; color: string } }
type LitFeature = {
  type: 'Feature'
  geometry: LitBuilding['geometry']
  properties: { id: string; kind: string; color: string; height: number; base: number }
}
type Collection<F> = { type: 'FeatureCollection'; features: F[] }
type Drawn = { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> | null }

const NO_LIT: Collection<LitFeature> = { type: 'FeatureCollection', features: [] }

/** The pin source's reads, adapted to `loadPins`. Fresh, never a cached page: a taken-over venue must not linger. */
const pinApi = {
  getEvents: async (q: PinQuery & { limit: number }) => {
    const res = await apiClient.getEvents(q, { force: true })
    return { ...res, data: res.data ? { events: res.data.events.map(eventFromApi) } : undefined }
  },
  getVenues: (q: PinQuery & { limit: number; sortBy: 'distance' }) => apiClient.getVenues(q, { force: true }),
}

/**
 * The map behind the home drawer (plan v2 §4, step 2 PR B): MapLibre over
 * OpenFreeMap, restyled dark in Ember, tilted.
 *
 * - **Pins follow the segment**: events on Events, venues on Places, for the
 *   part of the map on screen (its centre and a radius reaching its corners,
 *   the same `lat`/`lon`/`radius` the lists take). Cleared on a segment switch;
 *   no request while the view stays inside the circle already loaded; a
 *   refusal backs off. Which venues exist is the server's rule; the map draws
 *   what it is sent.
 * - **The building under a pin is lit** at zoom 14 and up: once the tiles
 *   under new pins are drawn, each on-screen pin's building is found among the
 *   rendered ones and drawn again over it in the event shade (ember) or the
 *   venue shade (violet-rose), brighter when live; one copy per building, the
 *   live one winning. MapLibre RN has no `setFeatureState`, so the lit copy is a
 *   GeoJSON layer of the same footprints and heights. Where there is no
 *   building, the pin's glow is all there is.
 * - **Glow steps with the bucket** at a venue (quiet → 20+), never a number.
 * - **The camera keeps what matters above the drawer**: its bottom padding is
 *   the drawer's height at the settled snap.
 * - **The check-in boundary is never drawn.** No payload carries it.
 */
export const HomeMap = memo(function HomeMap({
  center,
  cityCentre,
  segment,
  topInset,
  bottomInset,
}: {
  center: { latitude: number; longitude: number } | null
  /** The picked city's centre: the map goes there whenever the city changes. */
  cityCentre: { latitude: number; longitude: number } | null
  segment: 'events' | 'places'
  /** Where the top bar ends, so the attribution is not under it. */
  topInset: number
  /** How much of the map the drawer covers at its settled snap. */
  bottomInset: number
}) {
  const { width, height } = useWindowDimensions()
  const map = useRef<MapRef>(null)
  const camera = useRef<CameraRef>(null)
  // The person has moved the map: the first live fix no longer takes it over.
  const touched = useRef(false)
  const followedFix = useRef<{ latitude: number; longitude: number } | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQuery = useRef<PinQuery | null>(null)
  const failures = useRef(0)
  const blockedUntil = useRef(0)
  const needsLight = useRef(false)
  const lastLit = useRef('')
  const view = useRef<{ bounds: Bounds | null; zoom: number }>({ bounds: null, zoom: ZOOM })
  const [query, setQuery] = useState<PinQuery | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [lit, setLit] = useState<Collection<LitFeature>>(NO_LIT)

  // The person's position — a cached one, then the live fix — until they move the map themselves.
  useEffect(() => {
    if (!center || !shouldFollowFix(followedFix.current, center, touched.current)) return
    followedFix.current = center
    camera.current?.easeTo({ center: [center.longitude, center.latitude], duration: 400 })
  }, [center])

  // A city picked in the Pulse is a place to look at: follow it (`shouldFollowCity`).
  const cityLat = cityCentre?.latitude
  const cityLon = cityCentre?.longitude
  const seenCity = useRef(false)
  const hasFix = center !== null
  useEffect(() => {
    if (cityLat === undefined || cityLon === undefined) return
    const firstCity = !seenCity.current
    seenCity.current = true
    if (!shouldFollowCity({ firstCity, hasFix, touched: touched.current })) return
    camera.current?.easeTo({ center: [cityLon, cityLat], duration: 600 })
  }, [cityLat, cityLon]) // eslint-disable-line react-hooks/exhaustive-deps -- a fix arriving is not a city change

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current)
    },
    []
  )

  /** Ask for this view's pins, unless it is inside what is loaded or a refusal is still cooling off. */
  const ask = (bounds: Bounds) => {
    const next = roundQuery(viewportQuery(bounds))
    if (insideLastCircle(lastQuery.current, next) || Date.now() < blockedUntil.current) return
    setQuery(next)
  }

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, zoom, userInteraction } = e.nativeEvent
    if (userInteraction) touched.current = true
    view.current = { bounds: bounds as Bounds, zoom }
    needsLight.current = true
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => ask(bounds as Bounds), QUERY_DEBOUNCE_MS)
  }

  // Before anybody moves the map there is no region change to ask from: seed it once the map is up.
  const onLoaded = () => {
    map.current
      ?.getBounds()
      .then((bounds) => {
        view.current = { ...view.current, bounds: bounds as Bounds }
        ask(bounds as Bounds)
      })
      .catch((error) => Logger.warn('events', 'Home map bounds unavailable', { error: String(error) }))
  }

  // A switch of segment is a new question: the old segment's pins go at once, and the circle is asked again.
  useEffect(() => {
    setPins([])
    setLit(NO_LIT)
    lastQuery.current = null
    if (view.current.bounds) ask(view.current.bounds)
  }, [segment])

  useEffect(() => {
    if (!query) return
    let stale = false
    loadPins(segment, query, pinApi, PIN_LIMIT)
      .then((result) => {
        if (stale) return
        if (result.kind === 'pins') {
          failures.current = 0
          lastQuery.current = query
          setPins(result.pins)
        } else if (result.kind === 'rate_limited') {
          failures.current += 1
          blockedUntil.current = Date.now() + backoffMs(failures.current, result.retryAfter)
          Logger.warn('events', 'Home map pins refused (rate limited); backing off', { segment, failures: failures.current })
        } else {
          // A failed read keeps the pins it had, rather than blanking the map.
          Logger.warn('events', 'Home map pins did not load', { segment })
        }
      })
      .catch((error) => Logger.warn('events', 'Home map pins threw', { error: String(error) }))
    return () => {
      stale = true
    }
  }, [query, segment])

  // New pins: their buildings are looked for once the tiles under them are drawn.
  useEffect(() => {
    needsLight.current = true
  }, [pins])

  /** Find each on-screen pin's building among those drawn, and light it. */
  const light = async () => {
    const m = map.current
    if (!m || !needsLight.current) return
    needsLight.current = false
    if (view.current.zoom < LIGHT_MIN_ZOOM) {
      if (lit.features.length > 0) setLit(NO_LIT)
      return
    }
    const signature = lightSignature(pins, view.current.bounds)
    if (signature === lastLit.current) return
    lastLit.current = signature
    const found = await Promise.all(
      pins.map(async (pin): Promise<LitBuilding | null> => {
        try {
          const [x, y] = await m.project([pin.longitude, pin.latitude])
          if (!onScreen([x, y], { width, height })) return null
          const r = BUILDING_SEARCH_PX
          const drawn = (await m.queryRenderedFeatures(
            [
              [x - r, y - r],
              [x + r, y + r],
            ],
            { layers: [BUILDING_LAYER_ID] }
          )) as Drawn[]
          const building = buildingUnder(pin, drawn)
          if (!building) return null
          return {
            geometry: building.geometry,
            kind: pin.kind,
            live: pin.live,
            id: pin.id,
            height: Number(building.properties?.render_height ?? 10),
            base: Number(building.properties?.render_min_height ?? 0),
          }
        } catch (error) {
          Logger.warn('events', 'Could not light a building', { error: String(error) })
          return null
        }
      })
    )
    const buildings = dedupeLit(found.filter((b): b is LitBuilding => b !== null))
    setLit({
      type: 'FeatureCollection',
      features: buildings.map((b) => ({
        type: 'Feature',
        geometry: b.geometry,
        properties: { id: b.id, kind: b.kind, color: shadeOf(b.kind, b.live), height: b.height, base: b.base },
      })),
    })
  }

  /** A pin or a lit building, tapped: the event or the place it stands for. */
  const openPlace = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const f = e.nativeEvent.features[0]
    const id = f?.properties?.id
    if (typeof id !== 'string') return
    router.push(f?.properties?.kind === 'venue' ? `/venue/${id}` : `/event/${id}`)
  }

  const pinData = useMemo<Collection<PinFeature>>(
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

  const style = useMemo(() => homeMapStyle(), [])

  return (
    <Map
      ref={map}
      style={StyleSheet.absoluteFill}
      mapStyle={style}
      logo={false}
      attribution
      attributionPosition={{ top: topInset + SPACE.sm, left: SPACE.sm }}
      compass={false}
      onRegionDidChange={onRegionDidChange}
      onDidFinishLoadingMap={onLoaded}
      // Each frame drawn with every tile loaded; `needsLight` and the signature make it once per new view of new pins.
      // Not `onDidFinishRenderingMapFully`: on iOS that fires once, when the map first loads.
      onDidFinishRenderingFrameFully={() => void light().catch((error) => Logger.warn('events', 'Lighting pass threw', { error: String(error) }))}
      // No PII: which style host failed is all a fix needs.
      onDidFailLoadingMap={() => Logger.error('events', 'Home map style failed to load', { styleHost: styleHost(style) })}
      accessibilityLabel="Map of events and places"
    >
      <Camera
        ref={camera}
        initialViewState={{ center: center ? [center.longitude, center.latitude] : DEFAULT_CENTRE, zoom: ZOOM, pitch: PITCH }}
        // The drawer covers the bottom of the map: keep the centre in the part you can see.
        padding={{ bottom: bottomInset }}
      />
      {center ? <NativeUserLocation /> : null}
      {/* A pin inside a building is hidden by it, so the lit building is the marker: tap it too. */}
      <GeoJSONSource id="lit-buildings" data={lit} onPress={openPlace}>
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
      <GeoJSONSource id="pins" data={pinData} onPress={openPlace}>
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
})
