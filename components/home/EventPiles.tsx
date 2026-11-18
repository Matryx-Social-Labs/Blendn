import { GeoJSONSource, Layer, type GeoJSONSourceRef, type PressEventWithFeatures } from '@maplibre/maplibre-react-native'
import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import type { NativeSyntheticEvent } from 'react-native'

import { shadeOf, type Pin } from '../../lib/homeMap'
import { bubbleRadius, CLUSTER, splitFocus } from '../../lib/mapPresence'
import { MAP_THEME } from '../../lib/mapTheme'
import { Logger } from '../../lib/logger'

type Point = { type: 'Point'; coordinates: [number, number] }
type Feature = { type: 'Feature'; id: string; geometry: Point; properties: { id: string; kind: string; glow: number; color: string; live: number } }
type Collection = { type: 'FeatureCollection'; features: Feature[] }

const collection = (pins: readonly Pin[]): Collection => ({
  type: 'FeatureCollection',
  features: pins.map((p) => ({
    type: 'Feature',
    id: p.id,
    geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
    properties: { id: p.id, kind: p.kind, glow: p.glow, color: shadeOf(p.kind, p.live), live: p.live ? 1 : 0 },
  })),
})

const NOT_PILED = ['!', ['has', 'point_count']] as const
/** A number's bubble radius by its count: 15 / 18 / 21 pt (`bubbleRadius`), as a MapLibre step. */
const BUBBLE_RADIUS = ['step', ['get', 'point_count'], bubbleRadius(2), 10, bubbleRadius(10), 25, bubbleRadius(25)] as const

/**
 * The Pulse map's events (pulse-map 08, Option 3, owner 2026-11-17): MapLibre's own clustering, so nothing silently
 * disappears. Every event is a dot at every zoom; a pile is a number (ink, ember rim, white numerals in the style's own
 * glyphs); a number tapped eases to the zoom that opens it (`onExpand`). The focused event is drawn from its own source,
 * last, so it is never inside a number and sits on top: 9 pt, a white ring, an ember halo. With a focus the rest drop
 * their glow and go to 5 pt at 85%. A live event has a white rim.
 */
export function EventPiles({
  pins,
  focusId,
  onOpen,
  onExpand,
  children,
}: {
  pins: readonly Pin[]
  focusId: string | null
  onOpen: (kind: string, id: string) => void
  /** A number was tapped: the camera eases there (the person's own move). */
  onExpand: (to: { center: [number, number]; zoom: number }) => void
  /** Drawn above the piles and under the focus: the you-dot. */
  children?: ReactNode
}) {
  const source = useRef<GeoJSONSourceRef>(null)
  const { piled, focus } = useMemo(() => splitFocus(pins, focusId), [pins, focusId])
  const piledData = useMemo(() => collection(piled), [piled])
  const focusData = useMemo(() => (focus ? collection([focus]) : null), [focus])
  const lit = focus !== null

  const press = useCallback(
    (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const f = e.nativeEvent.features[0]
      const props = f?.properties as { cluster?: boolean; cluster_id?: number; id?: unknown; kind?: unknown } | undefined
      if (props?.cluster && typeof props.cluster_id === 'number') {
        const center = (f?.geometry as Point | undefined)?.coordinates
        if (!center) return
        source.current
          ?.getClusterExpansionZoom(props.cluster_id)
          .then((zoom) => onExpand({ center, zoom }))
          .catch((error) => Logger.warn('events', 'Home map pile would not expand', { error: String(error) }))
        return
      }
      if (typeof props?.id === 'string') onOpen(String(props.kind), props.id)
    },
    [onExpand, onOpen]
  )

  return (
    <>
      <GeoJSONSource
        ref={source}
        id="pins"
        data={piledData}
        cluster
        clusterRadius={CLUSTER.radius}
        clusterMaxZoom={CLUSTER.maxZoom}
        // A pile with anything live carries a live mark (its count of live events).
        clusterProperties={{ live: [['+', ['accumulated'], ['get', 'live']], ['get', 'live']] }}
        onPress={press}
      >
        {/*
          Every layer keyed by its id: MLRN drops falsy children and re-maps the rest by index, so without keys the glow
          leaving (a focus arriving) handed its slot, and a frozen id, to the next layer ("`id` cannot be changed").
        */}
        {lit ? null : (
          <Layer
            key="pin-glow"
            id="pin-glow"
            type="circle"
            filter={NOT_PILED as never}
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': ['*', ['get', 'glow'], MAP_THEME.pin.glowPxPerStep],
              'circle-blur': 1,
              'circle-opacity': MAP_THEME.pin.glowOpacity,
            }}
          />
        )}
        <Layer
          key="pin-dot"
          id="pin-dot"
          type="circle"
          filter={NOT_PILED as never}
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': lit ? MAP_THEME.pin.dimmed.radiusPx : MAP_THEME.pin.dotRadiusPx,
            'circle-opacity': lit ? MAP_THEME.pin.dimmed.opacity : 1,
            'circle-stroke-color': ['case', ['==', ['get', 'live'], 1], MAP_THEME.pin.liveRim, MAP_THEME.pin.dotStroke],
            'circle-stroke-width': ['case', ['==', ['get', 'live'], 1], MAP_THEME.pin.liveRimPx, MAP_THEME.pin.dotStrokePx],
          }}
        />
        <Layer
          key="pile-bubble"
          id="pile-bubble"
          type="circle"
          filter={['has', 'point_count'] as never}
          paint={{
            'circle-color': MAP_THEME.pile.fill,
            'circle-radius': BUBBLE_RADIUS as never,
            'circle-stroke-color': ['case', ['>', ['get', 'live'], 0], MAP_THEME.pin.liveRim, MAP_THEME.pile.rim],
            'circle-stroke-width': MAP_THEME.pile.rimPx,
          }}
        />
      </GeoJSONSource>
      {/* Above the piles' bubbles, under their numerals and the focus: you (pulse-map 08). */}
      {children}
      <Layer
        key="pile-count"
        id="pile-count"
        source="pins"
        type="symbol"
        filter={['has', 'point_count'] as never}
        layout={{
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': MAP_THEME.pile.font as never,
          'text-size': MAP_THEME.pile.textSize,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }}
        paint={{ 'text-color': MAP_THEME.pile.text, 'text-halo-color': MAP_THEME.pile.halo, 'text-halo-width': MAP_THEME.pile.haloPx }}
      />
      {focusData ? (
        <GeoJSONSource id="pins-focus" data={focusData} onPress={press}>
          <Layer
            key="pin-focus-halo"
            id="pin-focus-halo"
            type="circle"
            paint={{
              'circle-color': MAP_THEME.pin.focus.color,
              'circle-radius': MAP_THEME.pin.glowPxPerStep * 2,
              'circle-blur': 1,
              'circle-opacity': MAP_THEME.pin.glowOpacity,
            }}
          />
          <Layer
            key="pin-focus"
            id="pin-focus"
            type="circle"
            paint={{
              'circle-color': MAP_THEME.pin.focus.color,
              'circle-radius': MAP_THEME.pin.focus.radiusPx,
              'circle-stroke-color': MAP_THEME.pin.focus.ring,
              'circle-stroke-width': MAP_THEME.pin.focus.ringPx,
            }}
          />
        </GeoJSONSource>
      ) : null}
    </>
  )
}
