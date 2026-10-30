/**
 * With "Share location for nearby events" off, the home map is not centred on the person (SCRUM-908).
 *
 * A viewport query is the camera's centre and bounds. While the camera follows the GPS fix those are the person's
 * position under another name, so the map must not follow a fix at all when the switch is off: it opens on the city, and
 * a viewport query means where they looked.
 */
import React from 'react'
import { act, render } from '@testing-library/react-native'
import { makeMutable } from 'react-native-reanimated'

const mockStops: Array<Record<string, unknown>> = []
const mockCamera: { initial?: { center: [number, number] }; centre: [number, number] } = { centre: [0, 0] }
let mockRegion: ((e: unknown) => void) | undefined
let mockLoaded: (() => void) | undefined
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Map: React.forwardRef((p: { children?: React.ReactNode; onRegionDidChange?: (e: unknown) => void; onDidFinishLoadingMap?: () => void }, ref: React.Ref<unknown>) => {
      mockRegion = p.onRegionDidChange
      mockLoaded = p.onDidFinishLoadingMap
      // A map whose view is wherever the camera was last put, with the box a phone shows around it.
      React.useImperativeHandle(ref, () => ({
        queryRenderedFeatures: async () => [],
        getBounds: async () => [0, 0, 0, 0],
        project: async () => [0, 0],
        getViewState: async () => {
          const [lon, lat] = mockCamera.centre
          return { bounds: [lon - 0.02, lat - 0.04, lon + 0.02, lat + 0.04], center: mockCamera.centre, zoom: 15, pitch: 45 }
        },
      }))
      return React.createElement(View, null, p.children)
    }),
    Camera: React.forwardRef((p: { initialViewState: { center: [number, number] } }, ref: React.Ref<unknown>) => {
      mockCamera.initial = p.initialViewState
      if (!mockCamera.centre[0]) mockCamera.centre = p.initialViewState.center
      React.useImperativeHandle(ref, () => ({
        setStop: async (s: { center?: [number, number] }) => {
          mockStops.push(s)
          if (s.center) mockCamera.centre = s.center
        },
      }))
      return null
    }),
    GeoJSONSource: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    Layer: () => null,
    NativeUserLocation: () => React.createElement(View, { testID: 'user-puck' }),
  }
})
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => {} }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
const mockGetEvents = jest.fn(async () => ({ success: true, data: { events: [] } }))
const mockGetVenues = jest.fn(async () => ({ success: true, data: { venues: [] } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getEvents: (...a: unknown[]) => mockGetEvents(...(a as [])), getVenues: (...a: unknown[]) => mockGetVenues(...(a as [])) } }))
jest.mock('../components/home/useMapLighting', () => ({
  useMapLighting: () => ({ lit: { states: [], glow: { type: 'FeatureCollection', features: [] }, bands: { type: 'FeatureCollection', features: [] }, chips: [] }, onFrame: jest.fn(), relight: jest.fn() }),
}))
jest.mock('../components/home/MapLitLayers', () => ({ Chips: () => null, CityBuildings: () => null, GroundGlow: () => null, LitBuildings: () => null, OwnBuildings: () => null }))
jest.mock('../components/home/NearPins', () => ({ NearPins: () => null }))

/* eslint-disable import/first */
import { HomeMap } from '../components/home/HomeMap'
import { setLocationSharing } from '../lib/shareLocation'
/* eslint-enable import/first */

// Where the phone is (Indiranagar) and the city the app chose (Cubbon Park).
const FIX = { latitude: 12.9784, longitude: 77.6408 }
const CITY = { latitude: 12.9763, longitude: 77.5929 }
const SHEET = { half: 420, full: 120 }

// One identity for every prop that is not the fix: the memo'd map draws again only for what the test changes.
const CITY_PICK = { n: 0, here: false }
const NO_PINS: never[] = []
const ASK = jest.fn()
const DRAWER_TOP = makeMutable(SHEET.half)
const map = (center: typeof FIX | null) => (
  <HomeMap
    center={center}
    cityCentre={CITY}
    cityPick={CITY_PICK}
    requestLocation={ASK}
    locateVisible
    drawerTop={DRAWER_TOP}
    drawer={SHEET}
    segment="events"
    topChrome={90}
    mapHeight={700}
    drawerSnapTop={SHEET.half}
    focused
    glowVisible={false}
    nearPins={NO_PINS}
    fitNear={0}
  />
)
// Within ~200 m of the fix: a query (rounded, bounds-derived) or a camera stop that is on the person.
const onFix = (lat: number, lon: number) => Math.abs(lat - FIX.latitude) < 0.002 && Math.abs(lon - FIX.longitude) < 0.002
const stopOnFix = (s: { center?: [number, number] }) => !!s.center && onFix(s.center[1], s.center[0])
const readOnFix = (call: unknown[]) => {
  const q = call[0] as { lat?: number; lon?: number }
  return typeof q.lat === 'number' && typeof q.lon === 'number' && onFix(q.lat, q.lon)
}
const settle = async () => {
  await act(async () => void mockLoaded?.())
  await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStops.length = 0
  mockCamera.centre = [0, 0]
  setLocationSharing(true)
})
afterEach(() => setLocationSharing(true))

it('with sharing on, the map opens on the fix and the pins are read around it (the control)', async () => {
  const view = await render(map(FIX))
  expect(view.getByLabelText('Show my location', { includeHiddenElements: true })).toBeTruthy()
  expect(mockCamera.initial?.center).toEqual([FIX.longitude, FIX.latitude])
  await settle()
  expect(mockGetEvents.mock.calls.some(readOnFix)).toBe(true)
})

describe('with sharing off and a GPS fix', () => {
  it('opens on the default city, not the fix, and draws no puck', async () => {
    setLocationSharing(false)
    const view = await render(map(FIX))
    expect(mockCamera.initial?.center).not.toEqual([FIX.longitude, FIX.latitude])
    expect(view.queryByTestId('user-puck')).toBeNull()
  })

  it('does not draw the "my location" button, not even faded', async () => {
    setLocationSharing(false)
    const view = await render(map(FIX))
    expect(view.queryByLabelText('Show my location', { includeHiddenElements: true })).toBeNull()
  })

  it('a fix that arrives later never moves the camera', async () => {
    setLocationSharing(false)
    const view = await render(map(null))
    await settle()
    mockStops.length = 0
    await view.rerender(map(FIX))
    await settle()
    expect(mockStops.filter(stopOnFix)).toHaveLength(0)
    expect(mockGetEvents.mock.calls.filter(readOnFix)).toHaveLength(0)
  })

  it('switching off while following the fix takes the camera to the city', async () => {
    const view = await render(map(FIX))
    await settle()
    mockStops.length = 0
    mockGetEvents.mockClear()
    // The switch alone: the props are the same, so only the subscription can draw the map again.
    await act(async () => setLocationSharing(false))
    await settle()
    expect(mockStops.some((s) => JSON.stringify(s.center) === JSON.stringify([CITY.longitude, CITY.latitude]))).toBe(true)
    expect(mockStops.filter(stopOnFix)).toHaveLength(0)
  })

  it('a read pending on a view centred on the fix is dropped when the switch goes off', async () => {
    jest.useFakeTimers()
    try {
      // No read has been answered yet, so nothing but the debounce stands between the fix-centred view and the server.
      await render(map(FIX))
      // The camera has just settled on the fix: its read is waiting out the debounce.
      const [lon, lat] = [FIX.longitude, FIX.latitude]
      await act(async () => mockRegion?.({ nativeEvent: { bounds: [lon - 0.02, lat - 0.04, lon + 0.02, lat + 0.04], center: [lon, lat], zoom: 15, pitch: 45, userInteraction: false } }))
      await act(async () => setLocationSharing(false))
      await act(async () => void (await jest.advanceTimersByTimeAsync(5_000)))
      expect(mockGetEvents.mock.calls.filter(readOnFix)).toHaveLength(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('no read carries the fix', async () => {
    setLocationSharing(false)
    await render(map(FIX))
    await settle()
    expect(mockGetEvents).toHaveBeenCalled()
    expect(mockGetEvents.mock.calls.filter(readOnFix)).toHaveLength(0)
    expect(mockGetVenues.mock.calls.filter(readOnFix)).toHaveLength(0)
  })
})
