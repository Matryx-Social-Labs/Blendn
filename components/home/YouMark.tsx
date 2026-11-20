import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native'
import { useEffect, useMemo, useState } from 'react'

import { DURATION } from '../../lib/design/tokens'
import { beamShows, compassName, type Facing } from '../../lib/heading'
import { youMark } from '../../lib/mapPresence'
import { MAP_THEME } from '../../lib/mapTheme'
import { useReducedMotion } from '../../lib/motion'
import type { PreciseFix } from '../../lib/roomButton'
import { useHeading } from '../../lib/useHeading'

/** The Earth's circumference (m) and MapLibre's tile size: metres to points at zoom z is m · 512 · 2^z / (C · cos φ). */
const EARTH_M = 40_075_016.686
const TILE = 512

/** A halo of `metres` on the ground at `latitude`, as a zoom expression (exponential base 2, so exact at every zoom). */
export function haloRadius(metres: number, latitude: number) {
  const perPoint = (z: number) => (metres * TILE * 2 ** z) / (EARTH_M * Math.cos((latitude * Math.PI) / 180))
  return ['interpolate', ['exponential', 2], ['zoom'], 0, perPoint(0), 22, perPoint(22)] as const
}

/**
 * "You" on the Pulse map (pulse-map 06, Option 3): violet, the halo the fix's real accuracy. Precise: dot, white ring,
 * halo. Approximate: the soft circle only. Stale (> 10 min): a grey dot. Off in Blend'n, or no fix: nothing at all.
 * Two parts, drawn apart: the halo under the events (numbers stay crisp over the approximate circle, board 06) and the
 * dot over the piles but under the focus (board 08), so you are never hidden in a number and the focus stays the bright thing.
 */
export function YouMark({ part, fix, sharing, now }: { part: 'halo' | 'dot'; fix: PreciseFix | null; sharing: boolean; now: number }) {
  const mark = youMark({ sharing, permission: 'granted', fix, now })
  const data = useMemo(
    () => (fix ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [fix.longitude, fix.latitude] } }] } : null),
    [fix]
  )
  if (!data || !fix || mark.kind === 'off' || mark.kind === 'none' || mark.kind === 'denied') return null
  const approximate = mark.kind === 'approximate'
  if (part === 'halo')
    return (
      <GeoJSONSource id="you" data={data}>
        <Layer
          key="you-halo"
          id="you-halo"
          type="circle"
          paint={{
            'circle-color': MAP_THEME.you.halo,
            'circle-radius': haloRadius(mark.haloM ?? 0, fix.latitude) as never,
            'circle-stroke-color': approximate ? MAP_THEME.you.approximateEdge : MAP_THEME.you.halo,
            'circle-stroke-width': approximate ? 1 : 0,
            'circle-pitch-alignment': 'map',
          }}
        />
      </GeoJSONSource>
    )
  if (approximate) return null
  return (
    <GeoJSONSource id="you-dot" data={data}>
      <Layer
        key="you-dot"
        id="you-dot"
        type="circle"
        paint={{
          'circle-color': mark.kind === 'stale' ? MAP_THEME.you.stale : MAP_THEME.you.dot,
          'circle-radius': MAP_THEME.you.radiusPx,
          'circle-stroke-color': MAP_THEME.you.ring,
          'circle-stroke-width': MAP_THEME.you.ringPx,
        }}
      />
    </GeoJSONSource>
  )
}

/**
 * The beam's images, one per width (pulse-map 14 A): violet `#BA96D3` fading out over 70 pt from the dot, apex at the
 * centre. Made by `heading-beam-png.mjs` on the pulse-map board from the same wedge as the sheet.
 */
const BEAM_IMAGES = {
  'you-beam-40': require('../../assets/map/you-beam-40.png'),
  'you-beam-70': require('../../assets/map/you-beam-70.png'),
  'you-beam-100': require('../../assets/map/you-beam-100.png'),
} as const
const WIDTHS = [40, 70, 100] as const

/**
 * Which way you face (pulse-map 14 A, picked 2026-11-20): a violet beam from the dot, as wide as the compass is unsure.
 * - **Under the pins**: HomeMap draws it before `EventPiles`, and its source takes no touches, so it never covers a tap.
 * - **True to the world**: rotated against north (`icon-rotation-alignment: map`), so turning the map by hand, or any
 *   camera move, leaves it pointing where you face.
 * - **Only on a precise, fresh fix**, and the compass is watched only then (`useHeading`). Approximate or stale: it
 *   fades out over `DURATION.base`. A width change cross-fades over `DURATION.medium`, at once under Reduce Motion.
 * - **Spoken** through `onFacing` into the map's label, never announced while you turn.
 */
export function YouBeam({
  fix,
  sharing,
  now,
  focused,
  onFacing,
}: {
  fix: PreciseFix | null
  sharing: boolean
  now: number
  /** The map is on screen: only then is the compass read. */
  focused: boolean
  onFacing?: (name: string | null) => void
}) {
  const mark = youMark({ sharing, permission: 'granted', fix, now })
  const reduceMotion = useReducedMotion()
  const facing = useHeading({ on: focused && beamShows(mark.kind), fix, reduceMotion })
  // Gone, it fades out as it was drawn: the last direction and width are kept.
  const [last, setLast] = useState<Facing | null>(facing)
  if (facing && (facing.deg !== last?.deg || facing.width !== last?.width)) setLast(facing)
  const name = facing ? compassName(facing.deg) : null
  useEffect(() => onFacing?.(name), [name, onFacing])
  const data = useMemo(
    () => (fix ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [fix.longitude, fix.latitude] } }] } : null),
    [fix]
  )
  if (!data || mark.kind === 'off' || mark.kind === 'none' || mark.kind === 'denied') return null
  const shown = facing ?? last
  const transition = { duration: !facing ? DURATION.base : reduceMotion ? 0 : DURATION.medium, delay: 0 }
  return (
    <>
      <Images images={BEAM_IMAGES} />
      <GeoJSONSource id="you-beam" data={data}>
        {WIDTHS.map((w) => (
          <Layer
            key={`you-beam-${w}`}
            id={`you-beam-${w}`}
            type="symbol"
            layout={{
              'icon-image': `you-beam-${w}`,
              'icon-rotate': shown?.deg ?? 0,
              'icon-rotation-alignment': 'map',
              'icon-pitch-alignment': 'viewport',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
            paint={{ 'icon-opacity': facing && facing.width === w ? 1 : 0, 'icon-opacity-transition': transition }}
          />
        ))}
      </GeoJSONSource>
    </>
  )
}
