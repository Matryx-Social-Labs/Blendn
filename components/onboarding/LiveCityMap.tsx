import { Camera, Map, NativeUserLocation, type CameraRef, type CameraStop, type LightSpecification, type MapRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native'
import { getLocales } from 'expo-localization'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, View, type LayoutChangeEvent, type NativeSyntheticEvent } from 'react-native'

import { apiClient } from '../../lib/apiClient'
import { getDistanceKm } from '../../lib/geo'
import { cameraMove, LIGHT_MIN_ZOOM, loadPins, tiltedZoom, type Bounds, type Pin } from '../../lib/homeMap'
import { Logger } from '../../lib/logger'
import type { LngLat } from '../../lib/mapLit'
import { BUILDING_LAYER_ID, homeMapStyle } from '../../lib/mapStyleEmber'
import { MAP_THEME } from '../../lib/mapTheme'
import { CAMERA_MS, FLAT_VIEW, FLY_MS, LIGHT_STEP_MS, LIT_HOLD_MS, litUpTo, OPENING_VIEW, openingCentre } from '../../lib/onboardingMap'
import { pinApi } from '../home/HomeMap'
import { CityBuildings, GroundGlow, LitBuildings } from '../home/MapLitLayers'
import { useMapLighting, type MapView } from '../home/useMapLighting'

/** How far around the middle the places to light are asked for: the opening view's few streets, and a little more. */
const PIN_RADIUS_KM = 1.5
/** Per kind (events, places): the pass lights `MAP_THEME.lit.max` at most anyway. */
const PIN_LIMIT = 25
/** A map that has not drawn by now (slow tiles, no network) is not shown at all: the still stays. */
const DRAW_DEADLINE_MS = 6000
const LIGHT: LightSpecification = { ...MAP_THEME.light, position: [...MAP_THEME.light.position] }
const NO_PINS: Pin[] = []
const keyOf = (at: LngLat | null) => (at ? at.join(',') : '')
/** A settled view this close to where the flight went has arrived. */
const LANDED_KM = 0.3

/**
 * The location step's live map (Flow 2, owner 2026-11-01), over the step's still frame: the landing site's sequence played
 * once in the app (`lib/onboardingMap`). It opens on the catalogue's city for the phone's region (unnamed), flat; once it
 * has drawn, the camera tilts into the app's opening view and the real places near the middle light one by one, nearest
 * first, as on the home map (`useMapLighting`, `lib/mapLit`). Given `you` (Allow, and a fix came), it flies there, lights
 * what is near, and says so through `onShown`.
 *
 * Decorative and still to touch: no gesture, hidden from a screen reader (the question says what the step is for). It is
 * drawn only once it has fully drawn, so a slow or failed map leaves the still, never a broken one; the caller leaves it
 * out under Reduce Motion. One map view, released when the step goes.
 */
export function LiveCityMap({ you, onShown }: { you: LngLat | null; onShown?: () => void }) {
  const map = useRef<MapRef>(null)
  const camera = useRef<CameraRef>(null)
  const view = useRef<MapView>({ bounds: null, centre: null, zoom: FLAT_VIEW.zoom, pitch: FLAT_VIEW.pitch })
  const shownRef = useRef(onShown)
  useEffect(() => {
    shownRef.current = onShown
  })
  const [centre, setCentre] = useState<LngLat | null>(null)
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pins, setPins] = useState<{ at: string; pins: Pin[] }>({ at: '', pins: NO_PINS })
  const [landedAt, setLandedAt] = useState('')
  const style = useMemo(() => homeMapStyle(), [])
  const youKey = keyOf(you)

  // The catalogue's city for this phone's region, asked once.
  useEffect(() => {
    let alive = true
    const region = getLocales()[0]?.regionCode ?? null
    apiClient
      .getEventCities(region)
      .then((res) => {
        if (alive && res.success) setCentre(openingCentre(res.data, region))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // The places to light, around wherever the map is going.
  const target = you ?? centre
  const targetKey = keyOf(target)
  useEffect(() => {
    if (!target) return
    let alive = true
    const q = { lat: target[1], lon: target[0], radius: PIN_RADIUS_KM }
    Promise.all([loadPins('events', q, pinApi, PIN_LIMIT), loadPins('places', q, pinApi, PIN_LIMIT)])
      .then((answers) => {
        if (alive) setPins({ at: targetKey, pins: answers.flatMap((a) => (a.kind === 'pins' ? a.pins : [])) })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // On where it is going only (`targetKey` is `target`, by value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  const { lit, onFrame, relight } = useMapLighting({ map, view, pins: pins.pins, segment: 'events', size })
  // A late answer, or one for a view already settled, lights now: no frame may come to run it.
  useEffect(() => {
    relight()
    onFrame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins])

  // One by one, nearest first (the pass's order), every band of a place at once.
  const order = useMemo(() => lit.glow.features.map((f) => f.properties.id), [lit.glow])
  const orderKey = order.join('|')
  const [step, setStep] = useState({ key: '', n: 0 })
  const n = step.key === orderKey ? step.n : 0
  useEffect(() => {
    if (n >= order.length) return
    const timer = setTimeout(() => setStep({ key: orderKey, n: n + 1 }), LIGHT_STEP_MS)
    return () => clearTimeout(timer)
  }, [n, orderKey, order.length])
  const shown = useMemo(
    () => ({ bands: { ...lit.bands, features: litUpTo(lit.bands.features, order, n) }, glow: { ...lit.glow, features: litUpTo(lit.glow.features, order, n) } }),
    [lit, order, n]
  )

  // Not drawn in time: the still stays.
  useEffect(() => {
    if (drawn || failed || !centre) return
    const timer = setTimeout(() => setFailed(true), DRAW_DEADLINE_MS)
    return () => clearTimeout(timer)
  }, [drawn, failed, centre])

  const stop = (to: CameraStop) => {
    const cam = camera.current
    if (!cam) return
    Promise.resolve()
      .then(() => cam.setStop({ easing: 'ease', ...to }))
      .catch((error) => Logger.warn('events', 'Location map camera stop failed', { error: String(error) }))
  }

  const onDrawn = () => {
    if (drawn || !centre) return
    setDrawn(true)
    // From flat to the opening view; iOS turns a zoom into a height before it tilts (`tiltedZoom`).
    const zoom = tiltedZoom(OPENING_VIEW.zoom, FLAT_VIEW.pitch, OPENING_VIEW.pitch, Platform.OS)
    stop({ center: centre, zoom, pitch: OPENING_VIEW.pitch, bearing: OPENING_VIEW.bearing, duration: CAMERA_MS })
  }

  // Allow, and a fix: fly there. No map to fly (still frame, failed, not drawn yet): nothing to wait for.
  const live = drawn && !failed
  useEffect(() => {
    if (!you) return
    if (!live) {
      shownRef.current?.()
      return
    }
    const { duration } = cameraMove(view.current.centre, you, { easeMs: FLY_MS, reduceMotion: false })
    if (duration > 0) {
      stop({ center: you, zoom: OPENING_VIEW.zoom, pitch: OPENING_VIEW.pitch, bearing: OPENING_VIEW.bearing, duration })
      return
    }
    // Across cities, a jump: flat first, then there tilted, then the zoom (HomeMap `moveTo`, MapLibre iOS projects through the tilt).
    stop({ zoom: view.current.zoom, pitch: 0, duration: 0 })
    stop({ center: you, pitch: OPENING_VIEW.pitch, bearing: OPENING_VIEW.bearing, duration: 0 })
    stop({ center: you, zoom: OPENING_VIEW.zoom, duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youKey, live])

  // Landed by you, your places loaded, and all of them lit: held a moment, then the step may move on.
  const ready = !!you && landedAt === youKey && pins.at === youKey && n >= order.length
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => shownRef.current?.(), LIT_HOLD_MS)
    return () => clearTimeout(timer)
  }, [ready, orderKey])

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, center, zoom, pitch } = e.nativeEvent
    view.current = { bounds: bounds as Bounds, centre: center as LngLat, zoom, pitch }
    if (zoom < LIGHT_MIN_ZOOM) return
    relight()
    if (you && getDistanceKm(center[1], center[0], you[1], you[0]) < LANDED_KM) setLandedAt(keyOf(you))
  }

  if (!centre || failed) return null
  return (
    <View
      testID="location-live-map"
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      // Drawn at 0 until the whole first frame is there: the still under it shows meanwhile.
      style={[StyleSheet.absoluteFill, { opacity: drawn ? 1 : 0 }]}
    >
      <Map
        ref={map}
        style={StyleSheet.absoluteFill}
        // A texture view: a SurfaceView ignores the card's rounded clip and its opacity on Android.
        androidView="texture"
        mapStyle={style}
        light={LIGHT}
        logo={false}
        attribution={false}
        compass={false}
        dragPan={false}
        touchZoom={false}
        doubleTapZoom={false}
        doubleTapHoldZoom={false}
        touchRotate={false}
        touchPitch={false}
        onDidFinishRenderingMapFully={onDrawn}
        onDidFinishRenderingFrameFully={onFrame}
        onRegionDidChange={onRegionDidChange}
        onDidFailLoadingMap={() => {
          Logger.warn('events', 'Location map failed to load')
          setFailed(true)
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Camera ref={camera} initialViewState={{ center: centre, ...FLAT_VIEW }} />
        {you ? <NativeUserLocation mode="default" /> : null}
        <CityBuildings />
        <GroundGlow data={shown.glow} under={BUILDING_LAYER_ID} latitude={(you ?? centre)[1]} />
        <LitBuildings data={shown.bands} onPress={() => {}} over={BUILDING_LAYER_ID} />
      </Map>
    </View>
  )
}
