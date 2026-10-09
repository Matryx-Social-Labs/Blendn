import { Ionicons } from '@expo/vector-icons'
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type CircleLayerSpecification,
  type LightSpecification,
  type MapRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native'
import { router } from 'expo-router'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View, type NativeSyntheticEvent } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { eventFromApi } from '../../lib/api'
import { apiClient } from '../../lib/apiClient'
import {
  backoffMs,
  BUILDING_SEARCH_PX,
  insideLastCircle,
  LIGHT_MIN_ZOOM,
  lightSignature,
  litPlaceFor,
  loadPins,
  onScreen,
  roundQuery,
  shadeOf,
  shouldFollowCity,
  shouldFollowFix,
  viewportQuery,
  type Bounds,
  type Pin,
  type PinQuery,
} from '../../lib/homeMap'
import { Logger } from '../../lib/logger'
import {
  bandsFor,
  chipLiftPx,
  chipLine,
  dedupeLit,
  glowBreathes,
  glowFor,
  glowOpacity,
  glowRadius,
  nearest,
  topOfM,
  type BandFeature,
  type GlowFeature,
  type LitPlace,
  type LngLat,
} from '../../lib/mapLit'
import { BUILDING_LAYER_ID, homeMapStyle, styleHost } from '../../lib/mapStyleEmber'
import { MAP_THEME } from '../../lib/mapTheme'
import { EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'
import { Text } from '../ui/Text'

/** Where the map opens before the phone has a fix: central Bengaluru. */
const DEFAULT_CENTRE: [number, number] = [77.5946, 12.9716]
/** Close enough that a lit building and a beacon read as 3D (step 2c drive: at 15 a beacon was a hairline), wide enough for a few streets. */
const ZOOM = 16
/** Tilted, so the lit buildings read as buildings (plan v2 §4: 45–60°). */
const PITCH = 55
/** A pan settles before the server is asked; the lists allow 60 reads a minute. */
const QUERY_DEBOUNCE_MS = 600
/** How many pins one viewport asks for. */
const PIN_LIMIT = 50

type Point = { type: 'Point'; coordinates: [number, number] }
type PinFeature = { type: 'Feature'; id: string; geometry: Point; properties: { id: string; kind: string; glow: number; color: string } }
type Collection<F> = { type: 'FeatureCollection'; features: F[] }
type Drawn = { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> | null }
/** A name above a lit roof. */
type Chip = { id: string; kind: Pin['kind']; live: boolean; title: string; line: string; at: LngLat; lift: number }
type Lit = { bands: Collection<BandFeature>; glow: Collection<GlowFeature>; chips: Chip[] }

type Segment = 'events' | 'places'

const collection = <F,>(features: F[]): Collection<F> => ({ type: 'FeatureCollection', features })
const NO_LIT: Lit = { bands: collection([]), glow: collection([]), chips: [] }
const NO_PINS: Pin[] = []

/** `MAP_THEME.light`, as the spec's (mutable) type. */
const LIGHT: LightSpecification = { ...MAP_THEME.light, position: [...MAP_THEME.light.position] }
/** The ground glow's radius: metres from the theme at every zoom, nothing else. */
const GLOW_RADIUS = glowRadius()

/** The pin source's reads, adapted to `loadPins`. Fresh, never a cached page: a taken-over venue must not linger. */
const pinApi = {
  getEvents: async (q: PinQuery & { limit: number }) => {
    const res = await apiClient.getEvents(q, { force: true })
    return { ...res, data: res.data ? { events: res.data.events.map(eventFromApi) } : undefined }
  },
  getVenues: (q: PinQuery & { limit: number; sortBy: 'distance' }) => apiClient.getVenues(q, { force: true }),
}

/**
 * The map behind the home drawer (plan v2 §4, step 2 PR B; restyled step 2c):
 * MapLibre over OpenFreeMap, dark in Ember, tilted, one map-anchored light.
 *
 * - **Pins follow the segment**: events on Events, venues on Places, for the
 *   part of the map on screen (its centre and a radius reaching its corners,
 *   the same `lat`/`lon`/`radius` the lists take). Cleared on a segment switch;
 *   no request while the view stays inside the circle already loaded; a
 *   refusal backs off. Which venues exist is the server's rule; the map draws
 *   what it is sent.
 * - **Below the buildings' zoom a pin is a dot**, a venue's glow stepping with
 *   its bucket (quiet → 20+), never a number.
 * - **From there up, each on-screen pin is lit** (`lib/mapLit.ts`), once the
 *   tiles under it are drawn: the building it stands in is drawn again over
 *   the city's copy, wider and taller so the two never flicker, in ember (an
 *   event) or rose (a venue) with a lighter crown; with no building, a slim
 *   pillar stands on the pin. A live event's ground glow breathes, unless
 *   motion is reduced or the screen is out of view. The nearest few carry a
 *   chip with the name above the roof. The tiles merge buildings and carry no
 *   per-building id, so the lit copy is a GeoJSON layer of the footprint.
 * - **The camera keeps what matters above the drawer**: its bottom padding is
 *   the drawer's height at the settled snap, on every move.
 * - **The check-in boundary is never drawn.** No payload carries it; every
 *   lit shape is a public building outline or a public pin, sized by
 *   `lib/mapTheme.ts` alone.
 */
export const HomeMap = memo(function HomeMap({
  center,
  cityCentre,
  segment,
  topInset,
  bottomInset,
  active,
}: {
  center: { latitude: number; longitude: number } | null
  /** The picked city's centre: the map goes there whenever the city changes. */
  cityCentre: { latitude: number; longitude: number } | null
  segment: Segment
  /** Where the top bar ends, so the attribution is not under it. */
  topInset: number
  /** How much of the map the drawer covers at its settled snap. */
  bottomInset: number
  /** The screen is in view: a live glow breathes only then. */
  active: boolean
}) {
  const { width, height } = useWindowDimensions()
  const map = useRef<MapRef>(null)
  const camera = useRef<CameraRef>(null)
  // The person has moved the map: the first live fix no longer takes it over.
  const touched = useRef(false)
  const followedFix = useRef<{ latitude: number; longitude: number } | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The last circle answered, and for which segment: a switch asks again.
  const lastQuery = useRef<{ segment: Segment; q: PinQuery } | null>(null)
  const failures = useRef(0)
  const blockedUntil = useRef(0)
  const needsLight = useRef(false)
  const lastLit = useRef('')
  const view = useRef<{ bounds: Bounds | null; zoom: number; pitch: number }>({ bounds: null, zoom: ZOOM, pitch: PITCH })
  /*
   * The drawer covers the bottom of the map. A camera move without the padding
   * drops it (the declarative prop applies at mount only), so every move
   * carries it — the first iOS drive showed the person's own dot under the drawer.
   */
  const padding = useRef({ bottom: bottomInset })
  useEffect(() => {
    padding.current = { bottom: bottomInset }
  }, [bottomInset])
  const [query, setQuery] = useState<PinQuery | null>(null)
  /*
   * Pins and their lighting belong to the segment they were loaded for: a
   * switch shows the other segment's at once, never the old ones, and the
   * query effect below asks again for the same view.
   */
  const [loaded, setLoaded] = useState<{ segment: Segment; pins: Pin[] }>({ segment, pins: NO_PINS })
  const pins = loaded.segment === segment ? loaded.pins : NO_PINS
  const [litFor, setLitFor] = useState<{ segment: Segment; lit: Lit }>({ segment, lit: NO_LIT })
  const lit = litFor.segment === segment ? litFor.lit : NO_LIT

  // The person's position — a cached one, then the live fix — until they move the map themselves.
  useEffect(() => {
    if (!center || !shouldFollowFix(followedFix.current, center, touched.current)) return
    followedFix.current = center
    camera.current?.easeTo({ center: [center.longitude, center.latitude], padding: padding.current, duration: 400 })
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
    camera.current?.easeTo({ center: [cityLon, cityLat], padding: padding.current, duration: 600 })
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
    const last = lastQuery.current?.segment === segment ? lastQuery.current.q : null
    if (insideLastCircle(last, next) || Date.now() < blockedUntil.current) return
    setQuery(next)
  }

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, zoom, pitch, userInteraction } = e.nativeEvent
    if (userInteraction) touched.current = true
    view.current = { bounds: bounds as Bounds, zoom, pitch }
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

  useEffect(() => {
    if (!query) return
    let stale = false
    loadPins(segment, query, pinApi, PIN_LIMIT)
      .then((result) => {
        if (stale) return
        if (result.kind === 'pins') {
          failures.current = 0
          lastQuery.current = { segment, q: query }
          setLoaded({ segment, pins: result.pins })
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

  /** Find each on-screen pin's building among those drawn, and light it (or stand a beacon on the pin). */
  const light = async () => {
    const m = map.current
    if (!m || !needsLight.current) return
    needsLight.current = false
    const { zoom, pitch, bounds } = view.current
    const shown = segment
    if (zoom < LIGHT_MIN_ZOOM) {
      lastLit.current = ''
      if (lit !== NO_LIT) setLitFor({ segment: shown, lit: NO_LIT })
      return
    }
    const signature = lightSignature(pins, bounds)
    if (signature === lastLit.current) return
    lastLit.current = signature
    const found = await Promise.all(
      pins.map(async (pin): Promise<(LitPlace & { screen: [number, number]; pin: Pin }) | null> => {
        let screen: [number, number]
        try {
          screen = (await m.project([pin.longitude, pin.latitude])) as [number, number]
        } catch (error) {
          Logger.warn('events', 'Could not place a pin on screen', { error: String(error) })
          return null
        }
        if (!onScreen(screen, { width, height })) return null
        const [x, y] = screen
        const r = BUILDING_SEARCH_PX
        const drawn = await m
          .queryRenderedFeatures(
            [
              [x - r, y - r],
              [x + r, y + r],
            ],
            { layers: [BUILDING_LAYER_ID] }
          )
          .then((features) => features as Drawn[])
          .catch((error) => {
            // Unread buildings still leave the pin marked: it gets a beacon.
            Logger.warn('events', 'Could not read the buildings under a pin', { error: String(error) })
            return null
          })
        return { ...litPlaceFor(pin, drawn), screen, pin }
      })
    )
    const places = dedupeLit(found.filter((p): p is NonNullable<typeof p> => p !== null))
    // The camera's centre sits above the drawer: the nearest to it get chips.
    const centre: [number, number] = [width / 2, (height - padding.current.bottom) / 2]
    setLitFor({
      segment: shown,
      lit: {
        bands: collection(places.flatMap(bandsFor)),
        glow: collection(places.map(glowFor).filter((g): g is GlowFeature => g !== null)),
        chips: nearest(places, centre, MAP_THEME.chip.max).map((p) => ({
          id: p.id,
          kind: p.kind,
          live: p.live,
          title: p.pin.title,
          line: chipLine(p.pin),
          at: p.at,
          lift: chipLiftPx(topOfM(p), { zoom, pitch, latitude: p.at[1] }),
        })),
      },
    })
  }

  /** A pin, a lit building or a chip, tapped: the event or the place it stands for. */
  const open = (kind: unknown, id: string) => router.push(kind === 'venue' ? `/venue/${id}` : `/event/${id}`)
  const openPlace = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const f = e.nativeEvent.features[0]
    const id = f?.properties?.id
    if (typeof id === 'string') open(f?.properties?.kind, id)
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
      light={LIGHT}
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
      <GroundGlow data={lit.glow} active={active} />
      {/* A pin inside a building is hidden by it, so the lit building is the marker: tap it too. */}
      <GeoJSONSource id="lit-buildings" data={lit.bands} onPress={openPlace}>
        <Layer
          id="lit-buildings"
          type="fill-extrusion"
          // Over the city's copy, under the road names.
          afterId={BUILDING_LAYER_ID}
          paint={{
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-opacity': 1,
            // Each band is one solid colour: the walls-to-crown step is the gradient.
            'fill-extrusion-vertical-gradient': false,
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="pins" data={pinData} onPress={openPlace}>
        <Layer
          id="pin-glow"
          type="circle"
          maxzoom={LIGHT_MIN_ZOOM}
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': ['*', ['get', 'glow'], MAP_THEME.pin.glowPxPerStep],
            'circle-blur': 1,
            'circle-opacity': MAP_THEME.pin.glowOpacity,
          }}
        />
        <Layer
          id="pin-dot"
          type="circle"
          maxzoom={LIGHT_MIN_ZOOM}
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': MAP_THEME.pin.dotRadiusPx,
            'circle-stroke-color': MAP_THEME.pin.dotStroke,
            'circle-stroke-width': MAP_THEME.pin.dotStrokePx,
          }}
        />
      </GeoJSONSource>
      {lit.chips.map((chip) => (
        <Marker
          key={chip.id}
          id={`chip-${chip.id}`}
          lngLat={chip.at}
          anchor="bottom"
          offset={[0, -chip.lift]}
          onPress={() => open(chip.kind, chip.id)}
        >
          <MapChip chip={chip} />
        </Marker>
      ))}
    </Map>
  )
})

/**
 * The glow on the ground under a live event and at a beacon's foot, under the
 * buildings. A live one breathes by flipping its opacity every half period and
 * letting the paint transition carry it — no per-frame JavaScript — and holds
 * steady when motion is reduced or the screen is out of view. Its own
 * component, so a breath re-renders this source and nothing else.
 */
function GroundGlow({ data, active }: { data: Collection<GlowFeature>; active: boolean }) {
  const reduceMotion = useReducedMotion()
  const breathing = glowBreathes({ focused: active, reduceMotion, anyLive: data.features.some((f) => f.properties.pulse) })
  const [high, setHigh] = useState(false)
  const half = MAP_THEME.glow.periodMs / 2
  useEffect(() => {
    if (!breathing) return
    const timer = setInterval(() => setHigh((h) => !h), half)
    return () => clearInterval(timer)
  }, [breathing, half])
  const look: NonNullable<CircleLayerSpecification['paint']> = {
    'circle-color': ['get', 'color'],
    'circle-radius': GLOW_RADIUS,
    'circle-blur': 1,
    // Flat on the ground, shrinking into the distance like the ground does.
    'circle-pitch-alignment': 'map',
    'circle-pitch-scale': 'map',
  }
  return (
    <GeoJSONSource id="lit-glow" data={data}>
      <Layer
        id="glow-still"
        type="circle"
        beforeId={BUILDING_LAYER_ID}
        filter={['!=', ['get', 'pulse'], true]}
        paint={{ ...look, 'circle-opacity': MAP_THEME.glow.still }}
      />
      <Layer
        id="glow-live"
        type="circle"
        beforeId={BUILDING_LAYER_ID}
        filter={['==', ['get', 'pulse'], true]}
        paint={{ ...look, 'circle-opacity': glowOpacity(breathing, high), 'circle-opacity-transition': { duration: half, delay: 0 } }}
      />
    </GeoJSONSource>
  )
}

/** The name above a lit roof: "LIVE ●" or the start for an event, a glyph and the bucket for a venue. */
function MapChip({ chip }: { chip: Chip }) {
  const look = MAP_THEME[chip.kind]
  return (
    <View style={styles.chipWrap} accessibilityRole="button" accessibilityLabel={`${chip.title}, ${chip.line}`}>
      <View style={[styles.chip, { borderColor: look.crown }]}>
        {chip.kind === 'venue' ? <Ionicons name="storefront-outline" size={ICON.sm} color={look.crown} /> : null}
        <View style={styles.chipText}>
          <Text variant="caption" color={EMBER.textPrimary} numberOfLines={1}>
            {chip.title}
          </Text>
          {chip.line ? (
            <Text variant="caption" color={chip.live && chip.kind === 'event' ? look.crown : EMBER.textSecondary} numberOfLines={1}>
              {chip.line}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.stem, { backgroundColor: look.crown }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  chipWrap: { alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    maxWidth: MAP_THEME.chip.maxWidthPx,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: EMBER.bg,
  },
  // Lets a long name shrink to the chip's width and end in an ellipsis.
  chipText: { flexShrink: 1 },
  stem: { width: SPACE.xxs, height: SPACE.md },
})
