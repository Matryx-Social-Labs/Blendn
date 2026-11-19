import type { MapRef } from '@maplibre/maplibre-react-native'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { BUILDING_SEARCH_PX, LIGHT_MIN_ZOOM, lightCandidates, lightSignature, litPlaceFor, type Bounds, type Pin } from '../../lib/homeMap'
import { Logger } from '../../lib/logger'
import {
  bandsFor,
  chipBox,
  chipLiftPx,
  chipLine,
  stackedChip,
  stackLine,
  withDistance,
  dedupeLit,
  glowFor,
  nearestTo,
  pickChips,
  chipSizePx,
  topOfM,
  type BandFeature,
  type GlowFeature,
  type LitBuilding,
  type LitPlace,
  type Box,
  type LngLat,
} from '../../lib/mapLit'
import { BUILDING_LAYER_ID, OWN_BUILDINGS_LAYER_ID } from '../../lib/mapStyleEmber'
import { edgeMarker, staleCalloutBox } from '../../lib/mapPresence'
import { MAP_THEME } from '../../lib/mapTheme'
import { SIZE, SPACE } from '../../lib/design/tokens'

export type Segment = 'events' | 'places'
export type Collection<F> = { type: 'FeatureCollection'; features: F[] }
/** A name above a lit roof. */
/** `count`: the events the lit place stands for (several at one venue: its name and the count, pulse-map 12 A). */
/** The room an edge marker may take (its widest, and its height with air): names keep out of it. */
const EDGE_BLOCK = { width: MAP_THEME.chip.maxWidthPx, height: SIZE.targetIos }

export type Chip = { id: string; kind: Pin['kind']; live: boolean; title: string; line: string; speech: string; at: LngLat; lift: number; count: number }
/** A building in our tiles lit through feature-state: its id, and the pin it stands for (a tap on it opens that). */
export type LitState = { featureId: number; pinId: string; kind: Pin['kind']; live: boolean }
/** `pinIds`: every pin a light stands for. The light is their mark, so their dots hand over to it (pulse-map 12 A). */
export type Lit = { bands: Collection<BandFeature>; glow: Collection<GlowFeature>; chips: Chip[]; states: LitState[]; pinIds: string[] }
/** The settled camera, as the last region change reported it. */
export type MapView = { bounds: Bounds | null; centre: LngLat | null; zoom: number; pitch: number }

type Drawn = { id?: string | number; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> | null }

const collection = <F>(features: F[]): Collection<F> => ({ type: 'FeatureCollection', features })
/** Buildings remembered, at most: a long pan around a city should not grow without end. */
const SEEN_MAX = 500
/** How many more than `chip.max` are projected, so a name that cannot be placed is replaced by the next nearest. */
const CHIP_POOL = 3
/** The person's dot, and the ring around it, as a box either side of the fix. */
const USER_DOT_HALF_PX = 22
const SIDE_GUTTER = SPACE.lg
export const NO_LIT: Lit = { bands: collection([]), glow: collection([]), chips: [], states: [], pinIds: [] }

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
 *
 * On our own building tiles (`featureIds`), a building has its own id: with
 * `litBy: 'feature-state'` it is lit as itself (`states`), and no GeoJSON
 * copy is drawn over it; beacons, glows and chips are the same either way.
 */
export function useMapLighting({
  map,
  view,
  pins,
  segment,
  size,
  featureIds = false,
  litBy = 'copy',
  visible,
  userAt = null,
  edge = null,
  stale = null,
  knownDistance = null,
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
  /** With `featureIds`: light a building through feature-state on itself, or by a GeoJSON copy over it. */
  litBy?: 'feature-state' | 'copy'
  /**
   * The part of the map the person can see: below the top chrome (the capsule and the bell), above the drawer. A chip must lie
   * wholly inside it, off the screen edge and clear of `userAt` and of the other chips, or it is not drawn (visual QA r5: chips
   * collided with the capsule, the bell, the dot and each other, and clipped at the edge). Absent, the nearest are drawn as before.
   */
  visible?: { top: number; bottom: number }
  /** Where the person is, so no name covers their dot. */
  userAt?: LngLat | null
  /** The lap's venue and the box its edge marker keeps to (`EdgeMarker`): no name is drawn under the marker. */
  edge?: { at: LngLat; box: Box } | null
  /** The stale callout while your dot is grey (`StaleCallout`), its room and the side it hangs: no name is drawn under it. */
  stale?: { room: { width: number; height: number; gap: number }; below: boolean } | null
  /** A distance the screen already shows for one event (the lead card's): its chip says the same number. */
  knownDistance?: { id: string; km: number } | null
}): { lit: Lit; onFrame: () => void; relight: () => void; passes: number } {
  const [litFor, setLitFor] = useState<{ segment: Segment; lit: Lit; key: string }>({ segment, lit: NO_LIT, key: '' })
  const needsLight = useRef(false)
  const lastLit = useRef('')
  const pass = useRef(0)
  const seen = useRef(new Map<string, { lng: number; lat: number; building: LitBuilding | null }>())
  /** Passes that ran to the end (published, or found nothing new to publish): "lit for this view" is one finishing after it. */
  const [passes, setPasses] = useState(0)

  // New pins, or the other tiles drawing the buildings: look again once they are drawn. A pass still
  // waiting on the bridge was for the old tiles: dropped (review M1).
  useEffect(() => {
    pass.current += 1
    needsLight.current = true
  }, [pins, featureIds])

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
      setPasses((n) => n + 1)
      return
    }
    const candidates = lightCandidates(pins, v.bounds, v.centre, MAP_THEME.lit.max)
    // Which tiles drew the buildings is part of what was looked up: a building found in one is not one in the other.
    const tiles = featureIds ? 'own' : 'openfreemap'
    // The lookup reads the layer the buildings are drawn in: ours has its own id, so OpenFreeMap's merged ids never come back here.
    const layer = featureIds ? OWN_BUILDINGS_LAYER_ID : BUILDING_LAYER_ID
    const signature = `${tiles}|${lightSignature(candidates, { centre: v.centre, zoom: v.zoom, pitch: v.pitch })}|${visible ? `${visible.top}:${visible.bottom}` : ''}|${userAt ? userAt.join(',') : ''}|${edge ? `${edge.at.join(',')}@${Object.values(edge.box).join(',')}` : ''}|${stale ? `stale:${stale.below}` : ''}|${knownDistance ? `${knownDistance.id}=${knownDistance.km}` : ''}`
    if (signature === lastLit.current) {
      setPasses((n) => n + 1)
      return
    }
    const keyOf = (p: Pin) => `${tiles}:${shown}:${p.id}`
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
          .queryRenderedFeatures(box, { layers: [layer] })
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
          if (drawn && wholeBoxOnScreen) {
            seen.current.set(keyOf(p), { lng: p.longitude, lat: p.latitude, building })
            if (seen.current.size > SEEN_MAX) seen.current.delete(seen.current.keys().next().value as string)
          } else clean = false
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
    const byId = new Map(candidates.map((c) => [c.id, c]))
    // An event's line says when and how far from you (pulse-map 05, 12 A): "3 tonight · 200 m"; a venue's stays its bucket.
    const knownKm = (p: { ids: string[] }) => (knownDistance && p.ids.includes(knownDistance.id) ? knownDistance.km : null)
    const lineFor = (p: LitPlace & { pin: Pin; count: number; ids: string[] }) => {
      if (p.kind !== 'event') return chipLine(p.pin)
      const when = p.count > 1 ? stackLine(p.ids.map((id) => byId.get(id) ?? p.pin)) : chipLine(p.pin)
      return withDistance(when, p.at, userAt, knownKm(p))
    }
    const chipFor = (p: LitPlace & { pin: Pin; count: number; ids: string[] }): Chip => ({
      id: p.id,
      kind: p.kind,
      live: p.live,
      ...spokenWithDistance(stackedChip(p.pin, p.count), p, userAt, knownKm(p)),
      line: lineFor(p),
      at: p.at,
      lift: chipLiftPx(topOfM(p), { zoom: v.zoom, pitch: v.pitch, latitude: p.at[1] }),
    })
    const nearest = nearestTo(kept, v.centre, MAP_THEME.chip.max * CHIP_POOL).map(chipFor)
    let chips = nearest.slice(0, MAP_THEME.chip.max)
    if (visible) {
      const projected = await Promise.all(nearest.map((c) => m.project(c.at).then((s) => s as [number, number]).catch(() => null)))
      const dot = userAt ? await m.project(userAt).then((s) => s as [number, number]).catch(() => null) : null
      const edgeAt = edge ? await m.project(edge.at).then((s) => s as [number, number]).catch(() => null) : null
      if (token !== pass.current) return
      if (projected.every((s) => s !== null)) {
        const zone = { left: SIDE_GUTTER, right: size.width - SIDE_GUTTER, top: visible.top, bottom: visible.bottom }
        const blocked = dot ? [{ left: dot[0] - USER_DOT_HALF_PX, right: dot[0] + USER_DOT_HALF_PX, top: dot[1] - USER_DOT_HALF_PX, bottom: dot[1] + USER_DOT_HALF_PX }] : []
        const marker = edgeAt ? edgeMarker(edgeAt, edge?.box ?? zone, EDGE_BLOCK) : null
        if (marker) blocked.push({ left: marker.left, right: marker.left + EDGE_BLOCK.width, top: marker.top, bottom: marker.top + EDGE_BLOCK.height })
        if (stale && dot) blocked.push(staleCalloutBox(dot, stale.room, stale.below))
        chips = pickChips(
          nearest.map((c, i) => ({ item: c, box: chipBox(projected[i] as [number, number], c.lift, chipSizePx(c)) })),
          zone,
          blocked,
          MAP_THEME.chip.max
        )
      } else clean = false
    }
    const byState = (p: LitPlace) => featureIds && litBy === 'feature-state' && p.building?.featureId != null
    publish(shown, {
      // A building lit through feature-state needs no copy drawn over it.
      bands: collection(kept.flatMap((p) => (byState(p) && p.building ? bandsFor({ ...p, building: { ...p.building, footprint: null } }) : bandsFor(p)))),
      states: kept.filter(byState).map((p) => ({ featureId: p.building?.featureId as number, pinId: p.id, kind: p.kind, live: p.live })),
      glow: collection(kept.map(glowFor)),
      chips,
      pinIds: kept.flatMap((p) => p.ids),
    })
    // Unclean: not marked done, so the next settle asks again (not the next frame: frames keep coming while a glow fades).
    if (clean) lastLit.current = signature
    setPasses((n) => n + 1)
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

  return { lit: litFor.segment === segment ? litFor.lit : NO_LIT, onFrame, relight, passes }
}

/** A screen reader hears the same distance the chip shows ("…, 200 m away"); none without a fix. */
function spokenWithDistance<T extends { speech: string }>(chip: T, p: { kind: string; at: LngLat }, from: LngLat | null | undefined, knownKm: number | null): T {
  const far = p.kind === 'event' && from ? withDistance('', p.at, from, knownKm) : ''
  return far ? { ...chip, speech: `${chip.speech}, ${far} away` } : chip
}
