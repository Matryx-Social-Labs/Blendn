import type { MapRef } from '@maplibre/maplibre-react-native'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { BUILDING_SEARCH_PX, LIGHT_MIN_ZOOM, lightCandidates, lightSignature, litPlaceFor, type Bounds, type Pin } from '../../lib/homeMap'
import { Logger } from '../../lib/logger'
import {
  bandsFor,
  chipLiftPx,
  chipLine,
  chipSpeech,
  dedupeLit,
  glowFor,
  nearestTo,
  topOfM,
  type BandFeature,
  type GlowFeature,
  type LitBuilding,
  type LitPlace,
  type LngLat,
} from '../../lib/mapLit'
import { BUILDING_LAYER_ID } from '../../lib/mapStyleEmber'
import { MAP_THEME } from '../../lib/mapTheme'

export type Segment = 'events' | 'places'
export type Collection<F> = { type: 'FeatureCollection'; features: F[] }
/** A name above a lit roof. */
export type Chip = { id: string; kind: Pin['kind']; live: boolean; title: string; line: string; speech: string; at: LngLat; lift: number }
export type Lit = { bands: Collection<BandFeature>; glow: Collection<GlowFeature>; chips: Chip[] }
/** The settled camera, as the last region change reported it. */
export type MapView = { bounds: Bounds | null; centre: LngLat | null; zoom: number; pitch: number }

type Drawn = { id?: string | number; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> | null }

const collection = <F>(features: F[]): Collection<F> => ({ type: 'FeatureCollection', features })
export const NO_LIT: Lit = { bands: collection([]), glow: collection([]), chips: [] }

/**
 * Lighting the pins on the home map (step 2c): which building each one stands
 * in, and what that looks like (`lib/mapLit.ts`).
 *
 * A pass runs on a fully drawn frame after the view or the pins changed, and
 * costs as little as it can on the UI thread (review H1):
 *
 * - only the pins in view, nearest the centre, at most `MAP_THEME.lit.max`;
 * - a pin's building is looked up once and remembered; a pass reads the map
 *   only for pins it has not seen, in **one** `queryRenderedFeatures` over the
 *   box around them all;
 * - a lookup that failed, or whose box ran off the screen (the building may be
 *   cut off there), is not remembered: the next pass asks again.
 *
 * Passes can overlap (each awaits the bridge): one that a later one has
 * overtaken drops its result, and a pass counts as done only when it finished
 * cleanly (review H4). An unchanged result is not published again, so the map
 * is not handed the same GeoJSON on every settle (review M9).
 */
export function useMapLighting({
  map,
  view,
  pins,
  segment,
  size,
  featureIds = false,
}: {
  map: RefObject<MapRef | null>
  view: RefObject<MapView>
  /** As live as of now (`liveAt`). */
  pins: Pin[]
  segment: Segment
  /** The map's size in points. */
  size: { width: number; height: number }
  /** Whether the building tiles give each building its own id (our tiles), so it is lit by id. */
  featureIds?: boolean
}): { lit: Lit; onFrame: () => void; relight: () => void } {
  const [litFor, setLitFor] = useState<{ segment: Segment; lit: Lit; key: string }>({ segment, lit: NO_LIT, key: '' })
  const needsLight = useRef(false)
  const lastLit = useRef('')
  const pass = useRef(0)
  const seen = useRef(new Map<string, { lng: number; lat: number; building: LitBuilding | null }>())

  // New pins: their buildings are looked for once the tiles under them are drawn.
  useEffect(() => {
    needsLight.current = true
  }, [pins])

  const publish = (shown: Segment, lit: Lit) => {
    const key = JSON.stringify(lit)
    setLitFor((held) => (held.segment === shown && held.key === key ? held : { segment: shown, lit, key }))
  }

  const run = async () => {
    const m = map.current
    const v = view.current
    if (!m || !v.bounds || !v.centre) return
    const token = ++pass.current
    const shown = segment
    if (v.zoom < LIGHT_MIN_ZOOM) {
      lastLit.current = ''
      publish(shown, NO_LIT)
      return
    }
    const candidates = lightCandidates(pins, v.bounds, v.centre, MAP_THEME.lit.max)
    const signature = lightSignature(candidates, { centre: v.centre, zoom: v.zoom, pitch: v.pitch })
    if (signature === lastLit.current) return
    const keyOf = (p: Pin) => `${shown}:${p.id}`
    const known = (p: Pin) => {
      const s = seen.current.get(keyOf(p))
      return s !== undefined && s.lng === p.longitude && s.lat === p.latitude
    }
    let clean = true
    const misses = candidates.filter((p) => !known(p))
    const fresh = new Map<string, LitBuilding | null>()
    if (misses.length > 0) {
      const screens = await Promise.all(
        misses.map((p) =>
          m
            .project([p.longitude, p.latitude])
            .then((s) => s as [number, number])
            .catch(() => null)
        )
      )
      if (token !== pass.current) return
      const placed = misses.map((p, i) => ({ p, s: screens[i] })).filter((x): x is { p: Pin; s: [number, number] } => x.s !== null)
      if (placed.length < misses.length) clean = false
      if (placed.length > 0) {
        const r = BUILDING_SEARCH_PX
        const box: [[number, number], [number, number]] = [
          [Math.max(0, Math.min(...placed.map(({ s }) => s[0])) - r), Math.max(0, Math.min(...placed.map(({ s }) => s[1])) - r)],
          [Math.min(size.width, Math.max(...placed.map(({ s }) => s[0])) + r), Math.min(size.height, Math.max(...placed.map(({ s }) => s[1])) + r)],
        ]
        const drawn = await m
          .queryRenderedFeatures(box, { layers: [BUILDING_LAYER_ID] })
          .then((features) => features as Drawn[])
          .catch((error) => {
            Logger.warn('events', 'Could not read the buildings under the pins', { error: String(error) })
            return null
          })
        if (token !== pass.current) return
        if (drawn === null) clean = false
        for (const { p, s } of placed) {
          // Unread buildings still leave the pin marked (a beacon), but are asked for again next pass.
          const building = drawn ? litPlaceFor(p, drawn, featureIds).building : null
          fresh.set(p.id, building)
          const wholeBoxOnScreen = s[0] - r >= 0 && s[1] - r >= 0 && s[0] + r <= size.width && s[1] + r <= size.height
          if (drawn && wholeBoxOnScreen) seen.current.set(keyOf(p), { lng: p.longitude, lat: p.latitude, building })
          else clean = false
        }
      }
    }
    const places: (LitPlace & { pin: Pin })[] = []
    for (const p of candidates) {
      const building = fresh.has(p.id) ? fresh.get(p.id) : seen.current.get(keyOf(p))?.building
      if (building === undefined) continue
      // Liveness is the pin's as of now, never the remembered one (review M1).
      places.push({ id: p.id, kind: p.kind, live: p.live, at: [p.longitude, p.latitude], building, pin: p })
    }
    const kept = dedupeLit(places)
    publish(shown, {
      bands: collection(kept.flatMap(bandsFor)),
      glow: collection(kept.map(glowFor)),
      chips: nearestTo(kept, v.centre, MAP_THEME.chip.max).map((p) => ({
        id: p.id,
        kind: p.kind,
        live: p.live,
        title: p.pin.title,
        line: chipLine(p.pin),
        speech: chipSpeech(p.pin),
        at: p.at,
        lift: chipLiftPx(topOfM(p), { zoom: v.zoom, pitch: v.pitch, latitude: p.at[1] }),
      })),
    })
    // Unclean: not marked done, so the next settle asks again (not the next frame: frames keep coming while a glow fades).
    if (clean) lastLit.current = signature
  }

  /** On a fully drawn frame: a pass if one is due. Checked before anything async, since this runs every frame. */
  const onFrame = () => {
    if (!needsLight.current) return
    needsLight.current = false
    run().catch((error) => Logger.warn('events', 'Lighting pass threw', { error: String(error) }))
  }

  const relight = () => {
    needsLight.current = true
  }

  return { lit: litFor.segment === segment ? litFor.lit : NO_LIT, onFrame, relight }
}
