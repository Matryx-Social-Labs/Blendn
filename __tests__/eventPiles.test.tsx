/*
 * The Pulse map's piles (pulse-map 08, owner 2026-11-17): MapLibre's own clustering, radius 46, numbers up to z13; every
 * event a dot at every zoom (no `maxzoom`); the focused event drawn from its own source, so never inside a number; live
 * events with a white rim; with a focus the rest drop their glow and go to 5 pt at 85%; a number tapped eases to its
 * expansion zoom.
 */
import { act, render } from '@testing-library/react-native'
import React from 'react'

type Props = Record<string, unknown> & { id?: string; children?: React.ReactNode }
const mockSources: Props[] = []
const mockLayers: Props[] = []
const mockExpansion = jest.fn(async () => 15)
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = require('react')
  return {
    GeoJSONSource: R.forwardRef((p: Props, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ getClusterExpansionZoom: mockExpansion }))
      mockSources.push(p)
      // As MLRN does (cloneReactChildrenWithProps): its children are re-mapped, so unkeyed siblings shift.
      const found = Array.isArray(p.children) ? p.children : [p.children]
      return R.Children.map(found.filter((c: unknown) => !!c), (c: React.ReactElement) => R.cloneElement(c))
    }),
    // Like the native side: a mounted layer whose `id` changes throws ("`id` cannot be changed", drive 2026-11-18).
    Layer: (p: Props) => {
      const first = R.useRef(p.id)
      if (first.current !== p.id) throw new Error('`id` cannot be changed')
      mockLayers.push(p)
      return null
    },
  }
})

/* eslint-disable import/first */
import { EventPiles } from '../components/home/EventPiles'
import type { Pin } from '../lib/homeMap'
import { CLUSTER } from '../lib/mapPresence'
import { MAP_THEME } from '../lib/mapTheme'
/* eslint-enable import/first */

const pin = (id: string, live = false): Pin => ({ id, kind: 'event', title: id, latitude: 12.97, longitude: 77.6, glow: 1, live, startsAt: null, endsAt: null, bucket: null })
const PINS = [pin('a'), pin('lit'), pin('b', true)]

const last = (id: string) => [...mockSources].reverse().find((s) => s.id === id)
const layer = (id: string) => [...mockLayers].reverse().find((l) => l.id === id)
const ids = (src: Props | undefined) => ((src?.data as { features: { properties: { id: string } }[] }).features ?? []).map((f) => f.properties.id)

beforeEach(() => {
  mockSources.length = 0
  mockLayers.length = 0
  mockExpansion.mockClear()
})

it('clusters with MapLibre’s own clustering: radius 46, numbers up to z13, a live sum for the pile’s mark', async () => {
  await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  const src = last('pins')
  expect(src).toMatchObject({ cluster: true, clusterRadius: CLUSTER.radius, clusterMaxZoom: CLUSTER.maxZoom })
  // The explicit [reduce, map] form: MLRN's iOS side parses the first as an expression, so the bare operator '+' that
  // Android accepts left iOS with no sum, and every number lost its rim (iOS drive, 2026-11-18).
  expect(src?.clusterProperties).toEqual({ live: [['+', ['accumulated'], ['get', 'live']], ['get', 'live']] })
})

it('every event is a dot at every zoom: no dot layer has a maxzoom', async () => {
  await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  for (const l of mockLayers) expect(l.maxzoom).toBeUndefined()
})

it('the focus comes out of the piles into its own source, drawn last (top)', async () => {
  await render(<EventPiles pins={PINS} focusId="lit" onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(ids(last('pins'))).toEqual(['a', 'b'])
  expect(ids(last('pins-focus'))).toEqual(['lit'])
  const order = mockLayers.map((l) => l.id)
  expect(order.indexOf('pin-focus')).toBeGreaterThan(order.indexOf('pin-dot'))
  expect(layer('pin-focus')?.paint).toMatchObject({ 'circle-radius': MAP_THEME.pin.focus.radiusPx, 'circle-stroke-color': MAP_THEME.pin.focus.ring })
})

/*
 * You stay visible over a pile (pulse-map 08, city zoom: the violet dot sits on the "16"'s edge). The Android drive found
 * you hidden under a "13": the you-mark was drawn before the piles. What EventPiles is given goes between them and the focus.
 */
it('draws what it is given above the piles and under the focus (you, between them)', async () => {
  const { Layer } = require('@maplibre/maplibre-react-native')
  await render(
    <EventPiles pins={PINS} focusId="lit" onOpen={jest.fn()} onExpand={jest.fn()}>
      <Layer id="between" />
    </EventPiles>
  )
  const order = mockLayers.map((l) => l.id)
  expect(order.indexOf('between')).toBeGreaterThan(order.indexOf('pile-bubble'))
  expect(order.indexOf('between')).toBeLessThan(order.indexOf('pin-focus-halo'))
  // …but under the numerals: a fix at a pile's centre covered the "13" (drive). The count reads the piles' own source.
  expect(order.indexOf('between')).toBeLessThan(order.indexOf('pile-count'))
  expect(layer('pile-count')?.source).toBe('pins')
})

it('control: no focus, every pin can pile, and no focus source is drawn', async () => {
  await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(ids(last('pins'))).toEqual(['a', 'lit', 'b'])
  expect(last('pins-focus')).toBeUndefined()
})

it('with a focus the rest drop their glow and go to 5 pt at 85%; without one the glows stay', async () => {
  await render(<EventPiles pins={PINS} focusId="lit" onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(layer('pin-glow')).toBeUndefined()
  expect(layer('pin-dot')?.paint).toMatchObject({ 'circle-radius': MAP_THEME.pin.dimmed.radiusPx, 'circle-opacity': MAP_THEME.pin.dimmed.opacity })
  mockLayers.length = 0
  await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(layer('pin-glow')).toBeDefined()
})

it('a live event carries a white rim (a shape cue, not a brighter ember)', async () => {
  await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(JSON.stringify(layer('pin-dot')?.paint)).toContain(MAP_THEME.pin.liveRim)
  expect(ids(last('pins')).length).toBe(3)
  const live = (last('pins')?.data as { features: { properties: { id: string; live: number } }[] }).features.find((f) => f.properties.id === 'b')
  expect(live?.properties.live).toBe(1)
})

it('numbers: ink with an ember rim, white numerals in the map’s own font, sized 15 / 18 / 21', async () => {
  await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(layer('pile-bubble')?.filter).toEqual(['has', 'point_count'])
  expect(JSON.stringify(layer('pile-bubble')?.paint)).toContain('"step"')
  expect((layer('pile-count')?.layout as Record<string, unknown>)['text-font']).toEqual(MAP_THEME.pile.font)
  // Over the violet you-dot white is 2.5:1 (drive: a fix at the Church Street pile's centre); an ink halo keeps it ~19:1.
  expect(layer('pile-count')?.paint).toMatchObject({ 'text-halo-color': MAP_THEME.pile.halo, 'text-halo-width': MAP_THEME.pile.haloPx })
})

it('a number tapped eases to its expansion zoom; a dot tapped opens its event', async () => {
  const onExpand = jest.fn()
  const onOpen = jest.fn()
  await render(<EventPiles pins={PINS} focusId={null} onOpen={onOpen} onExpand={onExpand} />)
  const press = last('pins')?.onPress as (e: unknown) => void
  await act(async () => {
    press({ nativeEvent: { features: [{ properties: { cluster: true, cluster_id: 7 }, geometry: { type: 'Point', coordinates: [77.6, 12.97] } }] } })
  })
  expect(mockExpansion).toHaveBeenCalledWith(7)
  expect(onExpand).toHaveBeenCalledWith({ center: [77.6, 12.97], zoom: 15 })
  await act(async () => {
    press({ nativeEvent: { features: [{ properties: { id: 'a', kind: 'event' }, geometry: { type: 'Point', coordinates: [77.6, 12.97] } }] } })
  })
  expect(onOpen).toHaveBeenCalledWith('event', 'a')
})

it('the focus coming and going never changes a mounted layer’s id (the native side throws)', async () => {
  const view = await render(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  await view.rerender(<EventPiles pins={PINS} focusId="lit" onOpen={jest.fn()} onExpand={jest.fn()} />)
  await view.rerender(<EventPiles pins={PINS} focusId={null} onOpen={jest.fn()} onExpand={jest.fn()} />)
  expect(layer('pin-glow')).toBeDefined()
})
