import { type GeoJSONSourceRef, type MapRef } from '@maplibre/maplibre-react-native'
import { useEffect, useState, type RefObject } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'

import { SIZE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { pileSpeech, PILE_SPEECH_MAX } from '../../lib/mapPresence'

type Target = { key: string; at: [number, number]; xy: [number, number]; speech: string; clusterId: number | null; id: string | null; kind: string }
export type SpokenChip = { id: string; kind: string; at: [number, number]; speech: string }
const NO_CHIPS: readonly SpokenChip[] = []
type Found = { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> | null }

/**
 * After the camera stops, the piles are re-clustered for the new view before they are read: past MapLibre's 300 ms
 * symbol cross-fade, during which the outgoing zoom's pile is still rendered (drives: the old "16" read beside a "14").
 */
const SETTLE_MS = 400
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
    xy: [0, 0],
    speech: pileSpeech({ n: p.n, live: typeof p.live === 'number' ? p.live : 0, cluster }),
    clusterId: cluster ? (p.cluster_id as number) : null,
    id: typeof p.id === 'string' ? p.id : null,
    kind: typeof p.kind === 'string' ? p.kind : 'event',
  }
}

/**
 * The map's numbers for a screen reader (pulse-map 10). A pile is a MapLibre layer, which VoiceOver and TalkBack cannot
 * reach: with one on, each number in the visible map (`box`, under the top bar and over the drawer) gets an invisible
 * target that says it ("13 events here, double-tap to zoom in") and does what a tap on it does. Read again each time the
 * camera stops (`settled`). Off, it reads and draws nothing. Drawn over the map, not inside it: MapLibre's Android view
 * keeps its child views (Markers) from TalkBack, so each target is a plain view at its number's screen point.
 */
export function PileSpeech({
  on,
  map,
  source,
  box,
  settled,
  summary = null,
  chips = NO_CHIPS,
  onExpand,
  onOpen,
}: {
  on: boolean
  map: RefObject<MapRef | null>
  source: RefObject<GeoJSONSourceRef | null>
  box: { left: number; top: number; right: number; bottom: number }
  settled: number
  /** The map as a whole (`mapSummary`), spoken first: a strip along the top of the visible map, its touches passed through. */
  summary?: string | null
  /** The lit names, for TalkBack (MapLibre's Android view keeps its Markers from it); iOS reads the chips themselves. */
  chips?: readonly SpokenChip[]
  onExpand: (to: { center: [number, number]; zoom: number }) => void
  onOpen: (kind: string, id: string) => void
}) {
  const [targets, setTargets] = useState<Target[]>([])
  const { left, top, right, bottom } = box
  useEffect(() => {
    if (!on) return
    let stale = false
    const timer = setTimeout(() => {
      // Through a promise: MapLibre throws synchronously while the map remounts (a text-size change), not rejects.
      Promise.resolve()
        .then(() => map.current?.queryRenderedFeatures([[left, top], [right, bottom]], { layers: ['pile-bubble'] }) ?? [])
        .then(async (found) => {
          const seen = new Set<string>()
          const next = (found as Found[])
            .map(targetOf)
            .filter((t): t is Target => !!t && !seen.has(t.key) && !!seen.add(t.key))
            .slice(0, PILE_SPEECH_MAX)
          // Each number's point on the screen: the targets are drawn over the map, not inside it.
          const named = chips.map((c): Target => ({ key: `chip-${c.id}`, at: c.at, xy: [0, 0], speech: c.speech, clusterId: null, id: c.id, kind: c.kind }))
          const placed = await Promise.all([...next, ...named].map(async (t) => ({ ...t, xy: (await map.current?.project(t.at)) ?? t.xy })))
          if (!stale) setTargets(placed)
        })
        .catch((error) => Logger.warn('events', 'Could not read the map’s numbers for a screen reader', { error: String(error) }))
    }, SETTLE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [on, map, settled, left, top, right, bottom, chips])

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
      {on && summary ? (
        <View
          accessible
          accessibilityLabel={summary}
          pointerEvents="none"
          // A strip along the top of the visible map: first in reading order, and never over a chip or a number below it.
          style={[styles.summary, { left, top, width: right - left, height: TARGET_PT }]}
          testID="map-summary"
        />
      ) : null}
      {(on ? targets : []).map((t) => (
        <Pressable
          key={t.key}
          style={[styles.target, { left: t.xy[0] - TARGET_PT / 2, top: t.xy[1] - TARGET_PT / 2 }]}
          accessibilityRole="button"
          accessibilityLabel={t.speech}
          onPress={() => act(t)}
          onAccessibilityTap={() => act(t)}
        />
      ))}
    </>
  )
}

const styles = StyleSheet.create({ target: { position: 'absolute', width: TARGET_PT, height: TARGET_PT }, summary: { position: 'absolute' } })
