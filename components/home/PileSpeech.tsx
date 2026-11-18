import { Marker, type GeoJSONSourceRef, type MapRef } from '@maplibre/maplibre-react-native'
import { useEffect, useState, type RefObject } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { SIZE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { pileSpeech, PILE_SPEECH_MAX } from '../../lib/mapPresence'
import { annotationTitle } from './MapLitLayers'

type Target = { key: string; at: [number, number]; speech: string; clusterId: number | null; id: string | null; kind: string }
type Found = { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> | null }

/** After the camera stops, the piles are re-clustered for the new view before they are read. */
const SETTLE_MS = 250
/** A target's size: the platform's minimum (44 pt iOS, 48 dp Android), as the bubble's own hit area. */
const TARGET_PT = Platform.OS === 'ios' ? SIZE.targetIos : SIZE.targetAndroid

const targetOf = (f: Found): Target | null => {
  const at = f.geometry?.coordinates
  const p = f.properties ?? {}
  if (!Array.isArray(at) || typeof p.n !== 'number') return null
  const cluster = p.cluster === true && typeof p.cluster_id === 'number'
  return {
    key: cluster ? `pile-${p.cluster_id}` : `spot-${String(p.id)}`,
    at: [Number(at[0]), Number(at[1])],
    speech: pileSpeech({ n: p.n, live: typeof p.live === 'number' ? p.live : 0, cluster }),
    clusterId: cluster ? (p.cluster_id as number) : null,
    id: typeof p.id === 'string' ? p.id : null,
    kind: typeof p.kind === 'string' ? p.kind : 'event',
  }
}

/**
 * The map's numbers for a screen reader (pulse-map 10). A pile is a MapLibre layer, which VoiceOver and TalkBack cannot
 * reach: with one on, each number in the visible map (`box`, under the top bar and over the drawer) gets an invisible
 * marker that says it ("13 events here, double-tap to zoom in") and does what a tap on it does. Read again each time the
 * camera stops (`settled`). Off, it reads and draws nothing.
 */
export function PileSpeech({
  on,
  map,
  source,
  box,
  settled,
  onExpand,
  onOpen,
}: {
  on: boolean
  map: RefObject<MapRef | null>
  source: RefObject<GeoJSONSourceRef | null>
  box: { left: number; top: number; right: number; bottom: number }
  settled: number
  onExpand: (to: { center: [number, number]; zoom: number }) => void
  onOpen: (kind: string, id: string) => void
}) {
  const [targets, setTargets] = useState<Target[]>([])
  const { left, top, right, bottom } = box
  useEffect(() => {
    if (!on) return
    let stale = false
    const timer = setTimeout(() => {
      map.current
        ?.queryRenderedFeatures([[left, top], [right, bottom]], { layers: ['pile-bubble'] })
        .then((found) => {
          if (stale) return
          const seen = new Set<string>()
          const next = (found as Found[]).map(targetOf).filter((t): t is Target => !!t && !seen.has(t.key) && !!seen.add(t.key))
          setTargets(next.slice(0, PILE_SPEECH_MAX))
        })
        .catch((error) => Logger.warn('events', 'Could not read the map’s numbers for a screen reader', { error: String(error) }))
    }, SETTLE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [on, map, settled, left, top, right, bottom])

  const act = (t: Target) => {
    if (t.clusterId === null) {
      if (t.id) onOpen(t.kind, t.id)
      return
    }
    source.current
      ?.getClusterExpansionZoom(t.clusterId)
      .then((zoom) => onExpand({ center: t.at, zoom }))
      .catch((error) => Logger.warn('events', 'Home map pile would not expand', { error: String(error) }))
  }

  return (
    <>
      {(on ? targets : []).map((t) => (
        <Marker key={t.key} id={`speech-${t.key}`} lngLat={t.at} anchor="center" onPress={() => act(t)} {...annotationTitle(t.speech)}>
          <View style={styles.target} accessible accessibilityRole="button" accessibilityLabel={t.speech} onAccessibilityTap={() => act(t)} />
        </Marker>
      ))}
    </>
  )
}

const styles = StyleSheet.create({ target: { width: TARGET_PT, height: TARGET_PT } })
