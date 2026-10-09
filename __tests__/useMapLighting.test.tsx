import { act, renderHook } from '@testing-library/react-native'

import { useMapLighting, type MapView } from '../components/home/useMapLighting'
import { pinsFor, type Pin } from '../lib/homeMap'
import { MAP_THEME } from '../lib/mapTheme'

/**
 * The lighting pass on the home map (step 2c review H1, H4): how often it
 * reads the map, what it remembers, and which pass wins when two overlap.
 */

const SIZE = { width: 400, height: 800 }
const BOUNDS: [number, number, number, number] = [77.58, 12.96, 77.6, 12.98]
const view = (): { current: MapView } => ({ current: { bounds: BOUNDS, centre: [77.59, 12.97], zoom: 16, pitch: 55 } })

/** A square building around a point, 0.0004° a side. */
const buildingAt = (lng: number, lat: number, h = 12) => ({
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [lng - 0.0002, lat - 0.0002],
        [lng + 0.0002, lat - 0.0002],
        [lng + 0.0002, lat + 0.0002],
        [lng - 0.0002, lat + 0.0002],
        [lng - 0.0002, lat - 0.0002],
      ],
    ],
  },
  properties: { render_height: h },
})

/** A map whose projection is linear over BOUNDS onto SIZE, and whose buildings are `drawn()`. */
function fakeMap(drawn: () => Promise<unknown[]>) {
  const [w, s, e, n] = BOUNDS
  return {
    project: jest.fn(async ([lng, lat]: [number, number]) => [((lng - w) / (e - w)) * SIZE.width, ((n - lat) / (n - s)) * SIZE.height]),
    queryRenderedFeatures: jest.fn(drawn),
  }
}

const venues = (n: number, from = 0): Pin[] =>
  pinsFor('places', {
    events: [],
    venues: Array.from({ length: n }, (_, i) => ({ id: `v${from + i}`, name: `V${from + i}`, latitude: 12.966 + (i % 5) * 0.002, longitude: 77.586 + Math.floor(i / 5) * 0.002, liveNow: 'quiet' as const })),
  })

async function pass(result: { current: ReturnType<typeof useMapLighting> }) {
  await act(async () => {
    result.current.relight()
    result.current.onFrame()
  })
}

it('reads the map once per pass however many pins are new, and not again for pins it has seen (H1)', async () => {
  const pins = venues(3)
  const m = fakeMap(async () => pins.map((p) => buildingAt(p.longitude, p.latitude)))
  const v = view()
  const { result } = await renderHook(() => useMapLighting({ map: { current: m as never }, view: v, pins, segment: 'places', size: SIZE }))
  await pass(result)
  expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(1)
  // Every pin's building lit: walls and a crown for each.
  expect(result.current.lit.bands.features).toHaveLength(3 * (MAP_THEME.lit.wallBands + 1))
  // The view moves (a pan): the same pins need no second read.
  v.current = { ...v.current, centre: [77.5905, 12.97] }
  await pass(result)
  expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(1)
  expect(result.current.lit.bands.features).toHaveLength(3 * (MAP_THEME.lit.wallBands + 1))
})

it('looks up at most the cap, nearest the centre (H1)', async () => {
  const pins = venues(25)
  const m = fakeMap(async () => [])
  const { result } = await renderHook(() => useMapLighting({ map: { current: m as never }, view: view(), pins, segment: 'places', size: SIZE }))
  await pass(result)
  expect(m.project).toHaveBeenCalledTimes(MAP_THEME.lit.max)
  expect(result.current.lit.glow.features).toHaveLength(MAP_THEME.lit.max)
})

it('marks a pin whose buildings could not be read with a beacon, and asks again next pass (H4)', async () => {
  const pins = venues(1)
  let fail = true
  const m = fakeMap(async () => {
    if (fail) throw new Error('native busy')
    return [buildingAt(pins[0].longitude, pins[0].latitude)]
  })
  const { result } = await renderHook(() => useMapLighting({ map: { current: m as never }, view: view(), pins, segment: 'places', size: SIZE }))
  await pass(result)
  expect(result.current.lit.bands.features).toHaveLength(MAP_THEME.beacon.bands)
  fail = false
  await pass(result)
  expect(m.queryRenderedFeatures).toHaveBeenCalledTimes(2)
  expect(result.current.lit.bands.features).toHaveLength(MAP_THEME.lit.wallBands + 1)
})

it('drops a pass that a later one overtook (H4)', async () => {
  const pins = venues(1)
  const gates: ((v: unknown[]) => void)[] = []
  const m = fakeMap(() => new Promise<unknown[]>((resolve) => gates.push(resolve)))
  const v = view()
  const { result } = await renderHook(() => useMapLighting({ map: { current: m as never }, view: v, pins, segment: 'places', size: SIZE }))
  await pass(result) // first pass: waiting on its read
  v.current = { ...v.current, zoom: 16.5 }
  await pass(result) // second pass: also waiting
  expect(gates).toHaveLength(2)
  await act(async () => gates[1]([])) // the later pass finds no building: a beacon
  await act(async () => gates[0]([buildingAt(pins[0].longitude, pins[0].latitude)])) // the earlier one answers late
  expect(result.current.lit.bands.features).toHaveLength(MAP_THEME.beacon.bands)
})

it('publishes nothing new when nothing changed, so native is not handed the same GeoJSON (M9)', async () => {
  const pins = venues(2)
  const m = fakeMap(async () => pins.map((p) => buildingAt(p.longitude, p.latitude)))
  const v = view()
  const { result } = await renderHook(() => useMapLighting({ map: { current: m as never }, view: v, pins, segment: 'places', size: SIZE }))
  await pass(result)
  const first = result.current.lit
  v.current = { ...v.current, centre: [77.5901, 12.97] }
  await pass(result)
  expect(result.current.lit).toBe(first)
})

it('lights nothing below the buildings zoom', async () => {
  const pins = venues(2)
  const m = fakeMap(async () => [])
  const v = view()
  v.current = { ...v.current, zoom: 13 }
  const { result } = await renderHook(() => useMapLighting({ map: { current: m as never }, view: v, pins, segment: 'places', size: SIZE }))
  await pass(result)
  expect(m.project).not.toHaveBeenCalled()
  expect(result.current.lit.bands.features).toHaveLength(0)
})
