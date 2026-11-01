/*
 * The location step's live map (Flow 2, PR 3): the landing's sequence once, over the still. MapLibre is native, so it is a
 * stand-in that records the props and the camera stops; the lighting pass is the home map's (its own tests), stubbed to a
 * fixed set of lit places so the one-by-one reveal can be counted.
 */
import { act, render, screen } from '@testing-library/react-native'
import React from 'react'

let mockMapProps: Record<string, unknown> = {}
let mockInitial: unknown = null
const mockStops: Record<string, unknown>[] = []
let mockBands: { properties: { id: string } }[] = []
jest.mock('@maplibre/maplibre-react-native', () => {
  const R = require('react')
  const { View } = require('react-native')
  return {
    Map: R.forwardRef((p: Record<string, unknown> & { children?: React.ReactNode }, _ref: unknown) => {
      mockMapProps = p
      return R.createElement(View, { testID: 'native-map' }, p.children)
    }),
    Camera: R.forwardRef((p: { initialViewState: unknown }, ref: React.Ref<unknown>) => {
      mockInitial = p.initialViewState
      R.useImperativeHandle(ref, () => ({ setStop: async (s: Record<string, unknown>) => void mockStops.push(s) }))
      return null
    }),
    NativeUserLocation: () => null,
  }
})
jest.mock('../components/home/MapLitLayers', () => ({
  CityBuildings: () => null,
  GroundGlow: () => null,
  LitBuildings: ({ data }: { data: { features: { properties: { id: string } }[] } }) => {
    mockBands = data.features
    return null
  },
}))
const band = (id: string) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { id, kind: 'event', color: '#f00', base: 0, height: 10 } })
const glow = (id: string) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { id, kind: 'event', color: '#f00', beacon: false } })
const mockLit = {
  bands: { type: 'FeatureCollection', features: [band('a'), band('a'), band('b'), band('c')] },
  glow: { type: 'FeatureCollection', features: [glow('a'), glow('b'), glow('c')] },
  chips: [],
  states: [],
}
jest.mock('../components/home/useMapLighting', () => ({ useMapLighting: () => ({ lit: mockLit, onFrame: jest.fn(), relight: jest.fn() }) }))
// The pin reads, tagged with how they were asked: a viewport (a camera point) or through the sharing gate (a person's position).
jest.mock('../components/home/HomeMap', () => ({ pinApiFor: (viewport: boolean) => ({ viewport }) }))
let mockSharing = true
jest.mock('../lib/shareLocation', () => ({ ...jest.requireActual('../lib/shareLocation'), locationSharingOn: () => mockSharing }))
const mockPins = jest.fn(async (..._a: unknown[]) => ({ kind: 'pins', pins: [], truncated: false }))
jest.mock('../lib/homeMap', () => ({ ...jest.requireActual('../lib/homeMap'), loadPins: (...a: unknown[]) => mockPins(...a) }))
const mockCities = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getEventCities: (...a: unknown[]) => mockCities(...a) } }))

import { LiveCityMap } from '../components/onboarding/LiveCityMap'
import { CAMERA_MS, FLAT_VIEW, LIGHT_STEP_MS, LIT_HOLD_MS, OPENING_VIEW } from '../lib/onboardingMap'

const CATALOGUE = {
  cities: [
    { city: 'Bengaluru', eventCount: 3, slug: 'bengaluru', centre: { latitude: 12.97, longitude: 77.59 }, isDefault: true },
    { city: 'Toronto', eventCount: 0, slug: 'toronto', centre: { latitude: 43.65, longitude: -79.38 } },
  ],
  countries: [{ code: 'CA', name: 'Canada', defaultCitySlug: 'toronto' }],
  defaultCitySlug: 'bengaluru',
  device: null,
}
const fire = async (name: string, nativeEvent: unknown = null) => act(async () => (mockMapProps[name] as (e: unknown) => void)({ nativeEvent }))
/** Each step is set by the render after the one before it: advanced one at a time. */
const lightAll = async () => {
  for (let i = 0; i < 6; i++) await act(async () => jest.advanceTimersByTime(LIGHT_STEP_MS))
}
const settleAt = (center: [number, number]) => fire('onRegionDidChange', { bounds: [0, 0, 1, 1], center, zoom: 16, pitch: 55 })

beforeEach(() => {
  jest.useFakeTimers()
  mockMapProps = {}
  mockInitial = null
  mockStops.length = 0
  mockBands = []
  mockCities.mockResolvedValue({ success: true, data: CATALOGUE })
  mockSharing = true
  mockPins.mockClear()
})
afterEach(() => jest.useRealTimers())

describe('LiveCityMap', () => {
  it("opens flat on the catalogue's city for the phone's region (US: the catalogue default), still to touch and hidden from a screen reader", async () => {
    await render(<LiveCityMap you={null} />)
    expect(mockCities).toHaveBeenCalledWith('US')
    expect(mockInitial).toEqual({ center: [77.59, 12.97], ...FLAT_VIEW })
    for (const gesture of ['dragPan', 'touchZoom', 'doubleTapZoom', 'doubleTapHoldZoom', 'touchRotate', 'touchPitch']) expect(mockMapProps[gesture]).toBe(false)
    expect(mockMapProps.androidView).toBe('texture')
    expect(mockMapProps.accessibilityElementsHidden).toBe(true)
  })

  it('is drawn at 0 until its whole first frame is there, then tilts into the opening view turned -17°, once', async () => {
    await render(<LiveCityMap you={null} />)
    expect(screen.getByTestId('location-live-map')).toHaveStyle({ opacity: 0 })
    expect(mockStops).toEqual([])
    await fire('onDidFinishRenderingMapFully')
    expect(screen.getByTestId('location-live-map')).toHaveStyle({ opacity: 1 })
    expect(mockStops).toEqual([expect.objectContaining({ center: [77.59, 12.97], pitch: OPENING_VIEW.pitch, bearing: -17, duration: CAMERA_MS })])
    // Android reports every full render: the sequence still plays once.
    await fire('onDidFinishRenderingMapFully')
    expect(mockStops).toHaveLength(1)
  })

  it('lights the places one by one, every band of a place at once, and stops there (no loop)', async () => {
    await render(<LiveCityMap you={null} />)
    expect(mockBands).toEqual([])
    await act(async () => jest.advanceTimersByTime(LIGHT_STEP_MS))
    expect(mockBands.map((f) => f.properties.id)).toEqual(['a', 'a'])
    await act(async () => jest.advanceTimersByTime(LIGHT_STEP_MS))
    expect(mockBands.map((f) => f.properties.id)).toEqual(['a', 'a', 'b'])
    await lightAll()
    expect(mockBands.map((f) => f.properties.id)).toEqual(['a', 'a', 'b', 'c'])
  })

  it('no catalogue (offline): no map at all, the still shows', async () => {
    mockCities.mockResolvedValue({ success: false })
    await render(<LiveCityMap you={null} />)
    expect(screen.queryByTestId('location-live-map')).toBeNull()
  })

  it('a map that fails to load, or has not drawn in time, is taken away: never a broken map', async () => {
    await render(<LiveCityMap you={null} />)
    await fire('onDidFailLoadingMap')
    expect(screen.queryByTestId('location-live-map')).toBeNull()

    await render(<LiveCityMap you={null} />)
    expect(screen.getByTestId('location-live-map')).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(6000))
    expect(screen.queryByTestId('location-live-map')).toBeNull()
  })

  it('given you after it has drawn: flies there, asks for what is near you, and says so once it is lit', async () => {
    const onShown = jest.fn()
    const you: [number, number] = [77.6, 12.98]
    const view = await render(<LiveCityMap you={null} onShown={onShown} />)
    await fire('onDidFinishRenderingMapFully')
    await settleAt([77.59, 12.97])
    await view.rerender(<LiveCityMap you={you} onShown={onShown} />)
    expect(mockStops[mockStops.length - 1]).toEqual(expect.objectContaining({ center: you, zoom: OPENING_VIEW.zoom, pitch: OPENING_VIEW.pitch, duration: expect.any(Number) }))
    expect(mockPins).toHaveBeenLastCalledWith('places', expect.objectContaining({ lat: 12.98, lon: 77.6 }), expect.anything(), expect.any(Number))
    await lightAll()
    await act(async () => jest.advanceTimersByTime(LIT_HOLD_MS))
    // Not landed yet: not shown.
    expect(onShown).not.toHaveBeenCalled()
    await settleAt(you)
    await act(async () => jest.advanceTimersByTime(LIT_HOLD_MS))
    expect(onShown).toHaveBeenCalled()
  })

  const askedAt = (lat: number) => mockPins.mock.calls.filter((c) => (c[1] as { lat: number }).lat === lat)

  it("asks for the catalogue city's places as a camera point, and your own places through the sharing gate (never as a viewport)", async () => {
    const view = await render(<LiveCityMap you={null} />)
    expect(askedAt(12.97).length).toBe(2)
    for (const c of askedAt(12.97)) expect(c[2]).toEqual({ viewport: true })
    await view.rerender(<LiveCityMap you={[77.6, 12.98]} />)
    expect(askedAt(12.98).length).toBe(2)
    for (const c of askedAt(12.98)) expect(c[2]).toEqual({ viewport: false })
  })

  it('with "Share location" off, nothing is asked from your position at all (control: on, it is)', async () => {
    mockSharing = false
    const view = await render(<LiveCityMap you={null} />)
    await view.rerender(<LiveCityMap you={[77.6, 12.98]} />)
    expect(askedAt(12.98)).toEqual([])
    // The catalogue's city is no one's position: still asked.
    expect(askedAt(12.97).length).toBe(2)
    mockSharing = true
    await view.rerender(<LiveCityMap you={[77.61, 12.99]} />)
    expect(askedAt(12.99).length).toBe(2)
  })

  it('a fix in another city: no flight (and no jump onto tiles not loaded yet), the step is told at once', async () => {
    const onShown = jest.fn()
    const view = await render(<LiveCityMap you={null} onShown={onShown} />)
    await fire('onDidFinishRenderingMapFully')
    await settleAt([77.59, 12.97])
    const stops = mockStops.length
    await view.rerender(<LiveCityMap you={[-79.38, 43.65]} onShown={onShown} />)
    expect(onShown).toHaveBeenCalled()
    expect(mockStops).toHaveLength(stops)
  })

  it('tells the step whether there is a live map to fly, once it has drawn; and credits the map data then', async () => {
    const onLive = jest.fn()
    await render(<LiveCityMap you={null} onLive={onLive} />)
    expect(onLive).toHaveBeenLastCalledWith(false)
    expect(screen.queryByText(/OpenStreetMap/)).toBeNull()
    await fire('onDidFinishRenderingMapFully')
    expect(onLive).toHaveBeenLastCalledWith(true)
    expect(screen.getByText(/OpenStreetMap/)).toBeTruthy()
  })

  it('draws no place names: the style it is given has no place labels (SCRUM-997)', async () => {
    await render(<LiveCityMap you={null} />)
    const layers = (mockMapProps.mapStyle as { layers: Record<string, unknown>[] }).layers
    expect(layers.some((l) => l['source-layer'] === 'place')).toBe(false)
    expect(layers.some((l) => l['source-layer'] === 'transportation_name')).toBe(true)
  })

  it('given you with no map to fly (not drawn): says so at once, the step does not wait on it', async () => {
    const onShown = jest.fn()
    mockCities.mockResolvedValue({ success: false })
    await render(<LiveCityMap you={[77.6, 12.98]} onShown={onShown} />)
    expect(onShown).toHaveBeenCalled()
  })
})
