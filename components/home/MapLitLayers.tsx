import { Ionicons } from '@expo/vector-icons'
import {
  GeoJSONSource,
  Layer,
  Marker,
  VectorSource,
  type CircleLayerSpecification,
  type PressEventWithFeatures,
  type VectorSourceRef,
} from '@maplibre/maplibre-react-native'
import { memo, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, StyleSheet, View, type NativeSyntheticEvent } from 'react-native'

import { Logger } from '../../lib/logger'
import { glowBreathes, glowOpacity, glowRadius, type BandFeature, type GlowFeature } from '../../lib/mapLit'
import {
  BUILDING_LAYER_ID,
  CITY_BUILDINGS,
  LABELS_FROM_LAYER_ID,
  OWN_BUILDINGS,
  OWN_BUILDINGS_ATTRIBUTION,
  type OwnBuildingState,
} from '../../lib/mapStyleEmber'
import { MAP_THEME } from '../../lib/mapTheme'
import { EMBER, EMBER_RADIUS, ICON, SPACE } from '../../lib/theme'
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

/**
 * The city's buildings from our own tiles (stage 2, SCRUM-572): one feature
 * per building, each with its own id. A lit one is lit as itself, through
 * feature-state (`states`, applied as a diff: set for the new, removed for the
 * gone), so there is no copy over it and nothing to flicker; tapping it opens
 * the place it stands for. Credited next to OpenFreeMap.
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
  const applied = useRef(new Map<number, string>())
  useEffect(() => {
    const src = source.current
    if (!src) return
    const at = (featureId: number) => ({ id: featureId, sourceLayer: OWN_BUILDINGS.sourceLayer })
    const next = new Map(states.map((s) => [s.featureId, `${s.kind}:${s.live}`]))
    for (const featureId of applied.current.keys()) {
      if (!next.has(featureId)) src.removeFeatureState(at(featureId)).catch((error) => Logger.warn('events', 'Could not unlight a building', { error: String(error) }))
    }
    for (const s of states) {
      if (applied.current.get(s.featureId) === next.get(s.featureId)) continue
      const state: OwnBuildingState = { lit: s.kind, live: s.live }
      src.setFeatureState(at(s.featureId), state).catch((error) => Logger.warn('events', 'Could not light a building', { error: String(error) }))
    }
    applied.current = next
  }, [states])
  const onPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const featureId = e.nativeEvent.features[0]?.id
    const lit = states.find((s) => s.featureId === featureId)
    if (lit) onOpen(lit.kind, lit.pinId)
  }
  return (
    <VectorSource
      id="blendn-buildings"
      ref={source}
      tiles={[url]}
      // Built at z14 only; MapLibre overzooms past it.
      minzoom={OWN_BUILDINGS.minzoom}
      maxzoom={OWN_BUILDINGS.minzoom}
      attribution={OWN_BUILDINGS_ATTRIBUTION}
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
}: {
  data: Collection<BandFeature>
  onPress: (e: NativeSyntheticEvent<PressEventWithFeatures>) => void
}) {
  return (
    <GeoJSONSource id="lit-buildings" data={data} onPress={onPress}>
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
          // Each band is one solid colour: the foot-to-crown step is the gradient.
          'fill-extrusion-vertical-gradient': false,
        }}
      />
    </GeoJSONSource>
  )
})

/** Reduce Motion, followed live: it is switched on and off mid-session (review M4). */
function useReduceMotion(): boolean {
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
 * The glow on the ground under every lit place, under the buildings. A live
 * event's breathes by flipping its opacity every half period and letting the
 * paint transition carry it — no per-frame JavaScript — for
 * `MAP_THEME.glow.breatheForMs` after the places change, then holds steady, so
 * the map stops redrawing (review H2, WCAG 2.2.2). It holds steady at once with
 * Reduce Motion, or with the map out of view.
 */
export const GroundGlow = memo(function GroundGlow({ data, visible }: { data: Collection<GlowFeature>; visible: boolean }) {
  const reduceMotion = useReduceMotion()
  const breathing = glowBreathes({ visible, reduceMotion, anyLive: data.features.some((f) => f.properties.pulse) })
  const [phase, setPhase] = useState<'steady' | 'low' | 'high'>('steady')
  const { periodMs, breatheForMs } = MAP_THEME.glow
  useEffect(() => {
    if (!breathing) return
    const tick = setInterval(() => setPhase((p) => (p === 'high' ? 'low' : 'high')), periodMs / 2)
    const stop = setTimeout(() => {
      clearInterval(tick)
      setPhase('steady')
    }, breatheForMs)
    return () => {
      clearInterval(tick)
      clearTimeout(stop)
    }
  }, [breathing, data, periodMs, breatheForMs])
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
        paint={{ ...look, 'circle-opacity': ['get', 'opacity'] }}
      />
      <Layer
        id="glow-live"
        type="circle"
        beforeId={BUILDING_LAYER_ID}
        filter={['==', ['get', 'pulse'], true]}
        paint={{ ...look, 'circle-opacity': glowOpacity(breathing ? phase : 'steady'), 'circle-opacity-transition': { duration: periodMs / 2, delay: 0 } }}
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
  chipWrap: { alignItems: 'center', justifyContent: 'flex-end', minHeight: MAP_THEME.chip.minTouchPx },
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
