import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  NativeUserLocation,
  type CameraRef,
  type LightSpecification,
  type MapRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native'
import { router } from 'expo-router'
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, StyleSheet, useWindowDimensions, type NativeSyntheticEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { eventFromApi } from '../../lib/api'
import { apiClient } from '../../lib/apiClient'
import {
  backoffMs,
  cameraMove,
  insideLastCircle,
  LIGHT_MIN_ZOOM,
  liveAt,
  loadPins,
  locateTarget,
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
  BUILDING_LAYER_ID,
  drawsOwnBuildings,
  homeMapStyle,
  OWN_BUILDINGS_LAYER_ID,
  OWN_BUILDINGS_LIT_BY,
  parseOwnBuildingsUrl,
  styleHost,
} from '../../lib/mapStyleEmber'
import { MAP_THEME } from '../../lib/mapTheme'
import { SPACE } from '../../lib/theme'
import { LocateButton } from './LocateButton'
import { Chips, CityBuildings, GroundGlow, LitBuildings, OwnBuildings, useReduceMotion } from './MapLitLayers'
import { useMapLighting, type Collection, type MapView, type Segment } from './useMapLighting'

/** Where the map opens before the phone has a fix: central Bengaluru. */
const DEFAULT_CENTRE: [number, number] = [77.5946, 12.9716]
/** A pan settles before the server is asked; the lists allow 60 reads a minute. */
const QUERY_DEBOUNCE_MS = 600
/** How many pins one viewport asks for. */
const PIN_LIMIT = 50
/** An event's pin is re-read against its window this often, so it lights up when its doors open. */
const LIVE_TICK_MS = 60_000

type Point = { type: 'Point'; coordinates: [number, number] }
/** A camera move: where to, how long an ease within a city takes, and a zoom and tilt to arrive at. */
type Move = { to: [number, number]; easeMs: number; at?: { zoom: number; pitch: number } }
type PinFeature = { type: 'Feature'; id: string; geometry: Point; properties: { id: string; kind: string; glow: number; color: string } }

const NO_PINS: Pin[] = []

/** Our building tiles (stage 2), when this build has them; else OpenFreeMap's buildings everywhere. */
const OWN_BUILDINGS_ENV = parseOwnBuildingsUrl(process.env.EXPO_PUBLIC_BUILDINGS_TILES_URL)
const OWN_BUILDINGS_URL = OWN_BUILDINGS_ENV.url
/** Before the map reports its bounds: about a zoom-16 view around a point. */
const roughView = ([lng, lat]: [number, number]): Bounds => [lng - 0.006, lat - 0.006, lng + 0.006, lat + 0.006]

/** `MAP_THEME.light`, as the spec's (mutable) type. */
const LIGHT: LightSpecification = { ...MAP_THEME.light, position: [...MAP_THEME.light.position] }

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
 * MapLibre over OpenFreeMap, dark, tilted, one map-anchored light.
 *
 * - **Pins follow the segment**: events on Events, venues on Places, for the
 *   part of the map on screen (its centre and a radius reaching its corners,
 *   the same `lat`/`lon`/`radius` the lists take). No request while the view
 *   stays inside a circle fully answered; a refusal backs off, a segment switch
 *   included; read again when the screen or the app comes back. Which venues
 *   exist is the server's rule; the map draws what it is sent.
 * - **Below the buildings' zoom a pin is a dot**, a venue's glow stepping with
 *   its bucket (quiet → 20+), never a number.
 * - **From there up, the nearest pins are lit** (`useMapLighting`,
 *   `lib/mapLit.ts`): the building a pin stands in is drawn again over the
 *   city's copy, wider and taller so the two never flicker, banded in ember (an
 *   event) or rose (a venue) under a bright crown, with a glow on the ground;
 *   with no building, a pillar stands on the pin. A live event's glow breathes
 *   for a few seconds, then holds. The nearest few carry a name chip. An event
 *   is live from its start to its end as the clock moves, not as it was at the
 *   last read.
 * - **The buildings are our own tiles** where they cover the view (a city in
 *   `OWN_BUILDINGS_CITIES`, with `EXPO_PUBLIC_BUILDINGS_TILES_URL` set): each
 *   building is its own feature, lit as itself through feature-state.
 *   Elsewhere, OpenFreeMap's, lit by a copy (stage 1).
 * - **The camera keeps what matters above the drawer**: every move carries the
 *   drawer's height as padding, from the first frame. A move asked for before
 *   the map is ready is made once it is. Within a city a move eases; across
 *   cities it jumps under a fade of the map's ground (`cameraMove`).
 * - **A city chosen in the picker always moves the map** (`cityPick`), even to
 *   the city it shows; a city the app decided never takes it from your fix.
 * - **"My location"** (`LocateButton`) brings the map back to your fix, or asks
 *   for one through the Pulse's own location flow (`requestLocation`).
 * - **The check-in boundary is never drawn.** No payload carries it; every
 *   lit shape is a public building outline or a public pin, sized by
 *   `lib/mapTheme.ts` alone.
 */
export const HomeMap = memo(function HomeMap({
  center,
  cityCentre,
  cityPick,
  requestLocation,
  locateVisible,
  segment,
  topInset,
  bottomInset,
  focused,
  glowVisible,
}: {
  center: { latitude: number; longitude: number } | null
  /** The selected city's centre (`shouldFollowCity` says when the map goes there). */
  cityCentre: { latitude: number; longitude: number } | null
  /** Bumped by every city chosen in the picker: the map goes to it, even the city it shows. */
  cityPick: number
  /** Ask for the phone's position (the Pulse's own permission and "Turn on location" flow). */
  requestLocation: () => void
  /** The drawer leaves room for the "my location" button. */
  locateVisible: boolean
  segment: Segment
  /** Where the top bar ends, so the attribution is not under it. */
  topInset: number
  /** How much of the map the drawer covers at its settled snap. */
  bottomInset: number
  /** The home tab is the screen in front: pins are read again when it comes back. */
  focused: boolean
  /** The map can be seen (focused, the drawer not full, no screen reader): only then may a glow breathe. */
  glowVisible: boolean
}) {
  const { width, height } = useWindowDimensions()
  const map = useRef<MapRef>(null)
  const camera = useRef<CameraRef>(null)
  // The person has moved the map (a pan, or a city picked): a fix no longer takes it over.
  const touched = useRef(false)
  // The same, for the "my location" button to draw: filled while the map follows the fix.
  const [moved, setMoved] = useState(false)
  const setTouched = (on: boolean) => {
    touched.current = on
    setMoved(on)
  }
  const reduceMotion = useReduceMotion()
  // Across cities the map's ground covers the jump, then fades off it.
  const fade = useSharedValue(0)
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }))
  const followedFix = useRef<{ latitude: number; longitude: number } | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The last circle fully answered, and for which segment: a switch asks again.
  const lastQuery = useRef<{ segment: Segment; q: PinQuery } | null>(null)
  const failures = useRef(0)
  const blockedUntil = useRef(0)
  const view = useRef<MapView>({ bounds: null, centre: null, zoom: MAP_THEME.camera.zoom, pitch: MAP_THEME.camera.pitch })
  /*
   * The drawer covers the bottom of the map. Every camera move carries the
   * drawer's height as padding (a padding-only change is a no-op on Android),
   * and the first frame has it too (`initialViewState`).
   */
  const padding = useRef({ bottom: bottomInset })
  useEffect(() => {
    padding.current = { bottom: bottomInset }
  }, [bottomInset])
  // A move asked for before the map is ready is dropped by native: hold it until it is (review H3).
  const ready = useRef(false)
  const pendingMove = useRef<Move | null>(null)
  /** Within a city, an ease of `easeMs`; across cities, a jump under the fade (`cameraMove`). */
  const moveTo = (move: Move) => {
    if (!ready.current) {
      pendingMove.current = move
      return
    }
    const { duration, fade: fades } = cameraMove(view.current.centre, move.to, { easeMs: move.easeMs, reduceMotion })
    if (fades) {
      fade.set(1)
      fade.set(withTiming(0, { duration: MAP_THEME.camera.fadeMs }))
    }
    camera.current?.easeTo({ center: move.to, ...move.at, padding: padding.current, duration })
  }

  const [query, setQuery] = useState<PinQuery | null>(null)
  // Read again when the app comes back to the foreground (a venue may have filled up).
  const [refresh, setRefresh] = useState(0)
  /*
   * Pins and their lighting belong to the segment they were loaded for: a
   * switch shows the other segment's at once, never the old ones, and the
   * query effect below asks again for the same view.
   */
  const [loaded, setLoaded] = useState<{ segment: Segment; pins: Pin[] }>({ segment, pins: NO_PINS })
  const [now, setNow] = useState(() => Date.now())
  const pins = useMemo(() => (loaded.segment === segment ? loaded.pins.map((p) => liveAt(p, now)) : NO_PINS), [loaded, segment, now])

  // Which tiles draw the buildings, by the whole view: ours once it is inside a covered city (`drawsOwnBuildings`).
  const startAt: [number, number] = center ? [center.longitude, center.latitude] : DEFAULT_CENTRE
  const [ownTiles, setOwnTiles] = useState(() => drawsOwnBuildings(OWN_BUILDINGS_URL, roughView(startAt), false))
  const buildingLayerId = ownTiles ? OWN_BUILDINGS_LAYER_ID : BUILDING_LAYER_ID

  // A tiles URL that is set but cannot be used is a misconfigured build, not a quiet fallback (review M7).
  useEffect(() => {
    if (OWN_BUILDINGS_ENV.problem) Logger.warn('events', 'EXPO_PUBLIC_BUILDINGS_TILES_URL ignored', { problem: OWN_BUILDINGS_ENV.problem })
  }, [])
  const { lit, onFrame, relight } = useMapLighting({
    map,
    view,
    pins,
    segment,
    size: { width, height },
    featureIds: ownTiles,
    litBy: OWN_BUILDINGS_LIT_BY,
  })

  // The person's position — a cached one, then the live fix — until they move the map themselves.
  useEffect(() => {
    if (!center || !shouldFollowFix(followedFix.current, center, touched.current)) return
    followedFix.current = center
    moveTo({ to: [center.longitude, center.latitude], easeMs: 400 })
  }, [center]) // eslint-disable-line react-hooks/exhaustive-deps -- only a new fix moves the camera here

  // A city chosen in the picker is a place to look at; one the app decided only when you have no fix (`shouldFollowCity`).
  const cityLat = cityCentre?.latitude
  const cityLon = cityCentre?.longitude
  const seenPick = useRef(cityPick)
  const hasFix = center !== null
  useEffect(() => {
    const picked = cityPick !== seenPick.current
    seenPick.current = cityPick
    if (cityLat === undefined || cityLon === undefined) return
    if (!shouldFollowCity({ picked, hasFix, touched: touched.current })) return
    // Choosing a city is moving the map yourself: the next fix must not drag it back.
    if (picked) setTouched(true)
    moveTo({ to: [cityLon, cityLat], easeMs: MAP_THEME.camera.easeMs })
  }, [cityPick, cityLat, cityLon]) // eslint-disable-line react-hooks/exhaustive-deps -- a fix arriving is not a city change

  // "My location": back to the fix and following it again, or ask for one.
  const locate = () => {
    setTouched(false)
    const target = locateTarget(center)
    if (!target) {
      requestLocation()
      return
    }
    followedFix.current = center
    moveTo({ to: target.center, easeMs: MAP_THEME.camera.easeMs, at: { zoom: target.zoom, pitch: target.pitch } })
  }

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current)
    },
    []
  )

  // An event lights up when its doors open, and goes dark when it ends, without a new read.
  useEffect(() => {
    if (!focused) return
    const tick = setInterval(() => setNow(Date.now()), LIVE_TICK_MS)
    return () => clearInterval(tick)
  }, [focused])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRefresh((n) => n + 1)
    })
    return () => sub.remove()
  }, [])

  /** Ask for this view's pins, unless a fully answered circle holds it or a refusal is still cooling off. */
  const ask = (bounds: Bounds) => {
    const next = roundQuery(viewportQuery(bounds))
    const last = lastQuery.current?.segment === segment ? lastQuery.current.q : null
    if (insideLastCircle(last, next) || Date.now() < blockedUntil.current) return
    setQuery(next)
  }

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, center: centre, zoom, pitch, userInteraction } = e.nativeEvent
    if (userInteraction) setTouched(true)
    view.current = { bounds: bounds as Bounds, centre: centre as [number, number], zoom, pitch }
    setOwnTiles((drawing) => drawsOwnBuildings(OWN_BUILDINGS_URL, bounds as Bounds, drawing))
    relight()
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => ask(bounds as Bounds), QUERY_DEBOUNCE_MS)
  }

  // Before anybody moves the map there is no region change to ask from: seed it once the map is up.
  const onLoaded = () => {
    ready.current = true
    const held = pendingMove.current
    pendingMove.current = null
    if (held) moveTo(held)
    const m = map.current
    if (!m) return
    m.getViewState()
      .then(({ bounds, center: centre, zoom, pitch }) => {
        view.current = { bounds: bounds as Bounds, centre: centre as [number, number], zoom, pitch }
        setOwnTiles((drawing) => drawsOwnBuildings(OWN_BUILDINGS_URL, bounds as Bounds, drawing))
        relight()
        ask(bounds as Bounds)
      })
      .catch((error) => Logger.warn('events', 'Home map bounds unavailable', { error: String(error) }))
  }

  // Read the view's pins: when it is asked, the segment switches, the screen comes back, or the app does.
  useEffect(() => {
    if (!query || !focused) return
    let stale = false
    const run = () =>
      loadPins(segment, query, pinApi, PIN_LIMIT)
        .then((result) => {
          if (stale) return
          if (result.kind === 'pins') {
            failures.current = 0
            // A full page may not be all there is: it does not count as covering the circle (review M2).
            lastQuery.current = result.truncated ? null : { segment, q: query }
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
    // A refusal still cooling off holds every read, a segment switch's too (review M3).
    const wait = blockedUntil.current - Date.now()
    const timer = wait > 0 ? setTimeout(run, wait) : null
    if (!timer) run()
    return () => {
      stale = true
      if (timer) clearTimeout(timer)
    }
  }, [query, segment, focused, refresh])

  /** A pin, a lit building or a chip, tapped: the event or the place it stands for. */
  const open = useCallback((kind: unknown, id: string) => router.push(kind === 'venue' ? `/venue/${id}` : `/event/${id}`), [])
  const openPlace = useCallback(
    (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const f = e.nativeEvent.features[0]
      const id = f?.properties?.id
      if (typeof id === 'string') open(f?.properties?.kind, id)
    },
    [open]
  )

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
    <>
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
        // Each frame drawn with every tile loaded; the hook makes it one pass per new view or new pins.
        // Not `onDidFinishRenderingMapFully`: on iOS that fires once, when the map first loads.
        onDidFinishRenderingFrameFully={onFrame}
        // No PII: which style host failed is all a fix needs.
        onDidFailLoadingMap={() => Logger.error('events', 'Home map style failed to load', { styleHost: styleHost(style) })}
        accessibilityLabel="Map of events and places"
      >
        <Camera
          ref={camera}
          initialViewState={{
            center: startAt,
            zoom: MAP_THEME.camera.zoom,
            pitch: MAP_THEME.camera.pitch,
            // The drawer covers the bottom of the map: the first frame keeps its centre in the part you can see.
            padding: { bottom: bottomInset },
          }}
        />
        {/*
         * `mode` passed explicitly: MLRN's Android component starts in COMPASS render mode and applies `mode`
         * only when given, so the puck followed the compass and the map redrew about 7 times a second forever
         * (measured on the emulator, step 2c drive). A plain puck redraws only when the fix moves.
         */}
        {center ? <NativeUserLocation mode="default" /> : null}
        {/*
         * Remounted together when the building source switches: the glow goes under
         * the buildings and the lit copies over them, so they must be added after
         * the buildings layer, in this order.
         */}
        <Fragment key={ownTiles ? 'own-buildings' : 'openfreemap-buildings'}>
          {ownTiles && OWN_BUILDINGS_URL ? <OwnBuildings url={OWN_BUILDINGS_URL} states={lit.states} onOpen={open} /> : <CityBuildings />}
          <GroundGlow data={lit.glow} visible={glowVisible} under={buildingLayerId} />
          <LitBuildings data={lit.bands} onPress={openPlace} over={buildingLayerId} />
        </Fragment>
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
        <Chips chips={lit.chips} onOpen={open} />
      </Map>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fade, fadeStyle]} />
      <LocateButton visible={locateVisible} following={hasFix && !moved} bottom={bottomInset + SPACE.lg} onPress={locate} />
    </>
  )
})

const styles = StyleSheet.create({
  // The map's own ground, so a jump between cities reads as the one surface fading, not a black flash.
  fade: { backgroundColor: MAP_THEME.base.ground },
})
