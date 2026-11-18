import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { useMemo } from 'react'

import { youMark } from '../../lib/mapPresence'
import { MAP_THEME } from '../../lib/mapTheme'
import type { PreciseFix } from '../../lib/roomButton'

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
 * Drawn under the events, so the one bright thing on the map stays the focus.
 */
export function YouMark({ fix, sharing, now }: { fix: PreciseFix | null; sharing: boolean; now: number }) {
  const mark = youMark({ sharing, permission: 'granted', fix, now })
  const data = useMemo(
    () => (fix ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [fix.longitude, fix.latitude] } }] } : null),
    [fix]
  )
  if (!data || !fix || mark.kind === 'off' || mark.kind === 'none' || mark.kind === 'denied') return null
  const approximate = mark.kind === 'approximate'
  const stale = mark.kind === 'stale'
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
      {approximate ? null : (
        <Layer
          key="you-dot"
          id="you-dot"
          type="circle"
          paint={{
            'circle-color': stale ? MAP_THEME.you.stale : MAP_THEME.you.dot,
            'circle-radius': MAP_THEME.you.radiusPx,
            'circle-stroke-color': MAP_THEME.you.ring,
            'circle-stroke-width': MAP_THEME.you.ringPx,
          }}
        />
      )}
    </GeoJSONSource>
  )
}
