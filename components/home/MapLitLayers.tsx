import {
  GeoJSONSource,
  Layer,
  Marker,
  VectorSource,
  type CircleLayerSpecification,
  type PressEventWithFeatures,
  type VectorSourceRef,
} from '@maplibre/maplibre-react-native'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, StyleSheet, View, type NativeSyntheticEvent } from 'react-native'

import { Logger } from '../../lib/logger'
import { glowRadius, litFade, litStateTapped, type BandFeature, type GlowFeature } from '../../lib/mapLit'
import {
  CITY_BUILDINGS,
  LABELS_FROM_LAYER_ID,
  OWN_BUILDINGS,
  OWN_BUILDINGS_TILE_ZOOM,
  type OwnBuildingState,
} from '../../lib/mapStyleEmber'
import { MAP_THEME } from '../../lib/mapTheme'
import { COLOR, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { Icon } from '../ui/Icon'
import { Text } from '../ui/Text'
import type { Chip, Collection, LitState } from './useMapLighting'

/**
 * The home map's layers that are ours, not the basemap's (step 2c): the city's
 * buildings, the lit copies, the ground glows and the name chips. Each is its
 * own memoised component, so a re-render of the map hands native only what
 * changed.
 */

/** The ground glow's radius: metres from the theme at every zoom, nothing else. */
const GLOW_RADIUS = glowRadius()

/** The city's buildings, under the road names. The lit copies and glows are placed against this layer. */
export const CityBuildings = memo(function CityBuildings() {
  const { id, source, sourceLayer, minzoom, filter, paint } = CITY_BUILDINGS
  return (
    <Layer
      id={id}
      type="fill-extrusion"
      source={source}
      source-layer={sourceLayer}
      minzoom={minzoom}
      filter={filter}
      beforeId={LABELS_FROM_LAYER_ID}
      paint={paint}
    />
  )
})

/** Tries at feature-state per building before giving up until the lighting changes again (review M3). */
const STATE_TRIES = 3
/** The wait before the first retry; it doubles each time. */
const STATE_RETRY_MS = 400

/**
 * The city's buildings from our own tiles (stage 2, SCRUM-572): one feature
 * per building, each with its own id. A lit one is lit as itself, through
 * feature-state, applied as a diff: set for the new, removed for the gone, and
 * counted as applied only once native says so (a refusal is retried a few
 * times, then left until the lighting changes). Tapping it opens the place it
 * stands for. Credited in the corner credit and About › Map data (`MAP_CREDITS`).
 */
export const OwnBuildings = memo(function OwnBuildings({
  url,
  states,
  onOpen,
}: {
  url: string
  states: LitState[]
  onOpen: (kind: LitState['kind'], id: string) => void
}) {
  const source = useRef<VectorSourceRef>(null)
  // What native holds, per building: `kind:live`.
  const applied = useRef(new Map<number, string>())
  const tiles = useMemo(() => [url], [url])
  useEffect(() => {
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (featureId: number) => ({ id: featureId, sourceLayer: OWN_BUILDINGS.sourceLayer })
    const want = new Map(states.map((s) => [s.featureId, s]))
    const retry = (tries: number, again: () => void, what: string, error: unknown) => {
      if (!alive) return
      if (tries < STATE_TRIES) timers.push(setTimeout(again, STATE_RETRY_MS * 2 ** (tries - 1)))
      else Logger.warn('events', `Could not ${what} a building`, { error: String(error) })
    }
    const set = (s: LitState, tries = 1) => {
      const key = `${s.kind}:${s.live}`
      const state: OwnBuildingState = { lit: s.kind, live: s.live }
      source.current
        ?.setFeatureState(at(s.featureId), state)
        .then(() => {
          if (alive && want.get(s.featureId) === s) applied.current.set(s.featureId, key)
        })
        .catch((error) => retry(tries, () => set(s, tries + 1), 'light', error))
    }
    const unset = (featureId: number, tries = 1) => {
      source.current
        ?.removeFeatureState(at(featureId))
        .then(() => {
          if (alive && !want.has(featureId)) applied.current.delete(featureId)
        })
        .catch((error) => retry(tries, () => unset(featureId, tries + 1), 'unlight', error))
    }
    for (const featureId of applied.current.keys()) if (!want.has(featureId)) unset(featureId)
    for (const s of states) if (applied.current.get(s.featureId) !== `${s.kind}:${s.live}`) set(s)
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [states])
  const onPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const lit = litStateTapped(e.nativeEvent.features, states)
    if (lit) onOpen(lit.kind, lit.pinId)
  }
  return (
    <VectorSource
      id="blendn-buildings"
      ref={source}
      tiles={tiles}
      // Built at one zoom only; MapLibre overzooms past it.
      minzoom={OWN_BUILDINGS_TILE_ZOOM}
      maxzoom={OWN_BUILDINGS_TILE_ZOOM}
      onPress={onPress}
    >
      <Layer
        id={OWN_BUILDINGS.id}
        type="fill-extrusion"
        source-layer={OWN_BUILDINGS.sourceLayer}
        minzoom={OWN_BUILDINGS.minzoom}
        beforeId={LABELS_FROM_LAYER_ID}
        paint={OWN_BUILDINGS.paint}
      />
    </VectorSource>
  )
})

/** The lit copies of buildings, and beacons, over the city's. A pin inside a building is hidden by it, so the lit building is the marker: tap it too. */
export const LitBuildings = memo(function LitBuildings({
  data,
  onPress,
  over,
}: {
  data: Collection<BandFeature>
  onPress: (e: NativeSyntheticEvent<PressEventWithFeatures>) => void
  /** The city's buildings layer showing: the copies go over it. */
  over: string
}) {
  const { opacity, transition } = useLitFade(data.features.length > 0)
  return (
    <GeoJSONSource id="lit-buildings" data={data} onPress={onPress}>
      <Layer
        id="lit-buildings"
        type="fill-extrusion"
        // Over the city's copy, under the road names.
        afterId={over}
        paint={{
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': opacity,
          'fill-extrusion-opacity-transition': transition,
          // Each band is one solid colour: the foot-to-crown step is the gradient.
          'fill-extrusion-vertical-gradient': false,
        }}
      />
    </GeoJSONSource>
  )
})

/** Reduce Motion, followed live: it is switched on and off mid-session (review M4). */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setOn(value)
      })
      .catch((error) => Logger.warn('general', 'Could not read Reduce Motion', { error: String(error) }))
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return on
}

/**
 * The lit layers' one fade-in (motion #42): 0 until there is something to light, then 1 for good, so the layer arrives
 * over `long` (200 ms under Reduce Motion) the first time and is never faded again. `opacity` is a constant a paint
 * transition can carry; a data-driven one is not transitioned by the map.
 */
function useLitFade(hasData: boolean) {
  const reduceMotion = useReduceMotion()
  const [arrived, setArrived] = useState(false)
  // A frame after the first data is drawn at 0, so the transition has a start to run from.
  useEffect(() => {
    if (!hasData) return
    const frame = requestAnimationFrame(() => setArrived(true))
    return () => cancelAnimationFrame(frame)
  }, [hasData])
  return { opacity: arrived ? 1 : 0, transition: litFade(reduceMotion) }
}

/**
 * The glow on the ground under every lit place, under the buildings. It does not pulse (motion #42: "No pulse"): each
 * glow arrives with the layers' one fade and holds still, so the map redraws nothing while it is looked at (WCAG 2.2.2).
 * Two layers, a building's and a beacon's, because a paint transition needs a constant opacity.
 *
 * `visible` is HomeMap's, from when the glow breathed; it no longer changes anything.
 */
export const GroundGlow = memo(function GroundGlow({
  data,
  under,
}: {
  data: Collection<GlowFeature>
  visible?: boolean
  /** The city's buildings layer showing: the glow goes under it. */
  under: string
}) {
  const { opacity, transition } = useLitFade(data.features.length > 0)
  const look: NonNullable<CircleLayerSpecification['paint']> = {
    'circle-color': ['get', 'color'],
    'circle-radius': GLOW_RADIUS,
    'circle-blur': 1,
    // Flat on the ground, shrinking into the distance like the ground does.
    'circle-pitch-alignment': 'map',
    'circle-pitch-scale': 'map',
    'circle-opacity-transition': transition,
  }
  return (
    <GeoJSONSource id="lit-glow" data={data}>
      <Layer
        id="glow-still"
        type="circle"
        beforeId={under}
        filter={['!=', ['get', 'beacon'], true]}
        paint={{ ...look, 'circle-opacity': opacity * MAP_THEME.glow.still }}
      />
      <Layer
        id="glow-beacon"
        type="circle"
        beforeId={under}
        filter={['==', ['get', 'beacon'], true]}
        paint={{ ...look, 'circle-opacity': opacity * MAP_THEME.glow.beacon }}
      />
    </GeoJSONSource>
  )
})

/** The names above the nearest lit roofs. */
export const Chips = memo(function Chips({ chips, onOpen }: { chips: Chip[]; onOpen: (kind: Chip['kind'], id: string) => void }) {
  return (
    <>
      {chips.map((chip) => (
        <Marker key={chip.id} id={`chip-${chip.id}`} lngLat={chip.at} anchor="bottom" offset={[0, -chip.lift]} onPress={() => onOpen(chip.kind, chip.id)}>
          <MapChip chip={chip} onOpen={onOpen} />
        </Marker>
      ))}
    </>
  )
})

/**
 * One chip: "LIVE ●" or the start for an event, a glyph and the bucket for a
 * venue. A screen reader hears plain words ("live now") and can open it; the
 * target is at least 44 pt tall (review M5).
 */
function MapChip({ chip, onOpen }: { chip: Chip; onOpen: (kind: Chip['kind'], id: string) => void }) {
  const look = MAP_THEME[chip.kind]
  return (
    <View
      style={styles.chipWrap}
      accessible
      accessibilityRole="button"
      accessibilityLabel={chip.speech}
      onAccessibilityTap={() => onOpen(chip.kind, chip.id)}
    >
      <View style={[styles.chip, { borderColor: look.crown }]}>
        {chip.kind === 'venue' ? <Icon name="map-pin" size={ICON.inline} color={look.crown} /> : null}
        <View style={styles.chipText}>
          <Text variant="caption" color={COLOR.textPrimary} numberOfLines={1}>
            {chip.title}
          </Text>
          {chip.line ? (
            <Text variant="caption" color={chip.live && chip.kind === 'event' ? look.crown : COLOR.textSecondary} numberOfLines={1}>
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
  chipWrap: { alignItems: 'center', justifyContent: 'flex-end', minHeight: MAP_THEME.chip.minTouchPx },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.sm,
    maxWidth: MAP_THEME.chip.maxWidthPx,
    borderRadius: RADIUS.capsule,
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: COLOR.ink,
  },
  // Lets a long name shrink to the chip's width and end in an ellipsis.
  chipText: { flexShrink: 1 },
  stem: { width: SPACE.xxs, height: SPACE.md },
})
