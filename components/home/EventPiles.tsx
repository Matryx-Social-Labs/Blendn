import { GeoJSONSource, Layer, type CircleLayerSpecification, type GeoJSONSourceRef, type PressEventWithFeatures } from '@maplibre/maplibre-react-native'
import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import type { NativeSyntheticEvent } from 'react-native'

import { shadeOf, type Pin } from '../../lib/homeMap'
import { bubbleRadius, CLUSTER, splitFocus } from '../../lib/mapPresence'
import { MAP_THEME } from '../../lib/mapTheme'
import { Logger } from '../../lib/logger'
import { useLitFade } from './useLitFade'

type Point = { type: 'Point'; coordinates: [number, number] }
type Feature = {
  type: 'Feature'
  id: string
  geometry: Point
  properties: { id: string; kind: string; glow: number; color: string; live: number; lit: number; n: number }
}
type Collection = { type: 'FeatureCollection'; features: Feature[] }

/**
 * One feature per spot. Several events at one coordinate are one feature that counts them (`n`), its top event a live
 * one; past z13 nothing piles, so three at one venue were one silent dot (pulse-map 12 A). `lit`: any of them is lit.
 */
const collection = (pins: readonly Pin[], lit: ReadonlySet<string>): Collection => {
  const spots = new Map<string, Pin[]>()
  for (const p of pins) {
    const key = `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`
    spots.set(key, [...(spots.get(key) ?? []), p])
  }
  return {
    type: 'FeatureCollection',
    features: [...spots.values()].map((at) => {
      const p = at.find((q) => q.live) ?? at[0]
      return {
        type: 'Feature',
        id: p.id,
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: {
          id: p.id,
          kind: p.kind,
          glow: p.glow,
          color: shadeOf(p.kind, p.live),
          live: at.some((q) => q.live) ? 1 : 0,
          lit: at.some((q) => lit.has(q.id)) ? 1 : 0,
          n: at.length,
        },
      }
    }),
  }
}

const PILED = ['has', 'point_count'] as const
const NOT_PILED = ['!', PILED] as const
/** A dot: one event at its spot, nothing lit there. */
const A_DOT = ['all', NOT_PILED, ['==', ['get', 'lit'], 0], ['==', ['get', 'n'], 1]] as const
/** A lit spot's dot, handing over to its light. */
const LIT_DOT = ['all', NOT_PILED, ['==', ['get', 'lit'], 1]] as const
/** A number: a pile, or several events at one unlit spot. */
const A_NUMBER = ['any', PILED, ['all', ['==', ['get', 'lit'], 0], ['>', ['get', 'n'], 1]]] as const
/** A number's bubble radius by its count of events: 15 / 18 / 21 pt (`bubbleRadius`), as a MapLibre step. */
const NO_IDS: readonly string[] = []
const BUBBLE_RADIUS = ['step', ['get', 'n'], bubbleRadius(2), 10, bubbleRadius(10), 25, bubbleRadius(25)] as const
/** The count of events (a pile sums its spots' `n`), "1.2k" past a thousand as `point_count_abbreviated` did. */
const COUNT_TEXT = ['case', ['>=', ['get', 'n'], 1000], ['concat', ['to-string', ['/', ['round', ['/', ['get', 'n'], 100]], 10]], 'k'], ['to-string', ['get', 'n']]] as const

/**
 * The Pulse map's events (pulse-map 08, Option 3, owner 2026-11-17): MapLibre's own clustering, so nothing silently
 * disappears. Every event is a dot at every zoom; a pile is a number (ink, ember rim, white numerals in the style's own
 * glyphs); a number tapped eases to the zoom that opens it (`onExpand`). The focused event is drawn from its own source,
 * last, so it is never inside a number and sits on top: 9 pt, a white ring, an ember halo. With a focus the rest drop
 * their glow and go to 5 pt at 85%. A live event has a white rim.
 */
export function EventPiles({
  sourceRef,
  pins,
  litIds = NO_IDS,
  focusId,
  onOpen,
  onExpand,
  children,
}: {
  /** The clustered source, for a caller that expands a pile itself (`PileSpeech`). */
  sourceRef?: RefObject<GeoJSONSourceRef | null>
  pins: readonly Pin[]
  /** Pins a light stands for (`Lit.pinIds`): from z14 the light is their mark, so their dots fade out as it fades in. */
  litIds?: readonly string[]
  focusId: string | null
  onOpen: (kind: string, id: string) => void
  /** A number was tapped: the camera eases there (the person's own move). */
  onExpand: (to: { center: [number, number]; zoom: number }) => void
  /** Drawn above the piles and under the focus: the you-dot. */
  children?: ReactNode
}) {
  const own = useRef<GeoJSONSourceRef>(null)
  const source = sourceRef ?? own
  const { piled, focus } = useMemo(() => splitFocus(pins, focusId), [pins, focusId])
  const litSet = useMemo(() => new Set(litIds), [litIds])
  const piledData = useMemo(() => collection(piled, litSet), [piled, litSet])
  const focusData = useMemo(() => (focus ? collection([focus], litSet) : null), [focus, litSet])
  const lit = focus !== null
  // The lights' own one fade (motion #42): as they arrive, the dots they stand for leave over the same `long`.
  const fade = useLitFade(litIds.length > 0)
  const handOver = 1 - fade.opacity
  const focusLit = !!focus && litSet.has(focus.id)

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
    [onExpand, onOpen, source]
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
        // A pile with anything live carries a live mark (its count of live events); `n` sums the events, not the spots.
        clusterProperties={{ live: [['+', ['accumulated'], ['get', 'live']], ['get', 'live']], n: [['+', ['accumulated'], ['get', 'n']], ['get', 'n']] }}
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
            filter={A_DOT as never}
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
          filter={A_DOT as never}
          paint={dotPaint(lit, 1)}
        />
        {/* A lit place's dot (pulse-map 12 A): the light is its mark, so the dot leaves as the light arrives. */}
        <Layer
          key="pin-dot-lit"
          id="pin-dot-lit"
          type="circle"
          filter={LIT_DOT as never}
          paint={{ ...dotPaint(lit, handOver), 'circle-opacity-transition': fade.transition, 'circle-stroke-opacity-transition': fade.transition }}
        />
        <Layer
          key="pile-bubble"
          id="pile-bubble"
          type="circle"
          filter={A_NUMBER as never}
          paint={{
            'circle-color': MAP_THEME.pile.fill,
            'circle-radius': BUBBLE_RADIUS as never,
            'circle-stroke-color': ['case', ['>', ['get', 'live'], 0], MAP_THEME.pin.liveRim, MAP_THEME.pile.rim],
            'circle-stroke-width': MAP_THEME.pile.rimPx,
          }}
        />
      </GeoJSONSource>
      {/* Above the piles' bubbles, under the focus and the numerals: you (pulse-map 08). */}
      {children}
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
              'circle-opacity': MAP_THEME.pin.glowOpacity * (focusLit ? handOver : 1),
              'circle-opacity-transition': fade.transition,
            }}
          />
          {/* Lit, the focus is its brightest light and its chip (pulse-map 12 A): its dot hands over like the rest. */}
          <Layer
            key="pin-focus"
            id="pin-focus"
            type="circle"
            paint={{
              'circle-color': MAP_THEME.pin.focus.color,
              'circle-radius': MAP_THEME.pin.focus.radiusPx,
              'circle-stroke-color': MAP_THEME.pin.focus.ring,
              'circle-stroke-width': MAP_THEME.pin.focus.ringPx,
              'circle-opacity': focusLit ? handOver : 1,
              'circle-stroke-opacity': focusLit ? handOver : 1,
              'circle-opacity-transition': fade.transition,
              'circle-stroke-opacity-transition': fade.transition,
            }}
          />
        </GeoJSONSource>
      ) : null}
      {/* Last: a count is never hidden, not by you and not by a focus landing on its pile (pulse-map 08, iOS drive z10). */}
      <Layer
        key="pile-count"
        id="pile-count"
        source="pins"
        type="symbol"
        filter={A_NUMBER as never}
        layout={{
          'text-field': COUNT_TEXT as never,
          'text-font': MAP_THEME.pile.font as never,
          'text-size': MAP_THEME.pile.textSize,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }}
        paint={{ 'text-color': MAP_THEME.pile.text, 'text-halo-color': MAP_THEME.pile.halo, 'text-halo-width': MAP_THEME.pile.haloPx }}
      />
    </>
  )
}

/** A dot's look: dimmed while a focus is lit (5 pt at 85%), its opacity times `strength` (a lit dot handing over). */
function dotPaint(lit: boolean, strength: number): NonNullable<CircleLayerSpecification['paint']> {
  const opacity = (lit ? MAP_THEME.pin.dimmed.opacity : 1) * strength
  return {
    'circle-color': ['get', 'color'],
    'circle-radius': lit ? MAP_THEME.pin.dimmed.radiusPx : MAP_THEME.pin.dotRadiusPx,
    'circle-opacity': opacity,
    'circle-stroke-opacity': strength,
    'circle-stroke-color': ['case', ['==', ['get', 'live'], 1], MAP_THEME.pin.liveRim, MAP_THEME.pin.dotStroke],
    'circle-stroke-width': ['case', ['==', ['get', 'live'], 1], MAP_THEME.pin.liveRimPx, MAP_THEME.pin.dotStrokePx],
  }
}
