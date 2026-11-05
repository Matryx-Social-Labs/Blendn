/**
 * Near me on the map (Flow 3b · N1, SCRUM-1022): your reach is drawn (a lit 20-minute walk, a hairline short-ride ring,
 * dark beyond) only while the chip is on, and then only what is inside it lights.
 */
import React from 'react'
import { act, render } from '@testing-library/react-native'
import { makeMutable } from 'react-native-reanimated'

const mockStops: Record<string, unknown>[] = []
const mockSources: Record<string, unknown> = {}
const mockCamera: { initial?: { center: [number, number] }; centre: [number, number] } = { centre: [0, 0] }
let mockLoaded: (() => void) | undefined
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Map: React.forwardRef(function MockMap(p: { children?: React.ReactNode; onRegionDidChange?: (e: unknown) => void; onDidFinishLoadingMap?: () => void }, ref: React.Ref<unknown>) {
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
    Camera: React.forwardRef(function MockCamera(p: { initialViewState: { center: [number, number] } }, ref: React.Ref<unknown>) {
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
    GeoJSONSource: ({ id, data, children }: { id: string; data: unknown; children?: React.ReactNode }) => {
      mockSources[id] = data
      return React.createElement(View, null, children)
    },
    Layer: () => null,
    NativeUserLocation: () => React.createElement(View, { testID: 'user-puck' }),
  }
})
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => {} }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
const mockGetEvents = jest.fn(async () => ({ success: true, data: { events: mockEvents } }))
let mockEvents: unknown[] = []
const mockGetVenues = jest.fn(async () => ({ success: true, data: { venues: [] } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getEvents: (...a: unknown[]) => mockGetEvents(...(a as [])), getVenues: (...a: unknown[]) => mockGetVenues(...(a as [])) } }))
jest.mock('../components/home/useMapLighting', () => ({
  useMapLighting: () => ({ lit: { states: [], glow: { type: 'FeatureCollection', features: [] }, bands: { type: 'FeatureCollection', features: [] }, chips: [] }, onFrame: jest.fn(), relight: jest.fn() }),
}))
jest.mock('../components/home/MapLitLayers', () => ({ Chips: () => null, CityBuildings: () => null, GroundGlow: () => null, LitBuildings: () => null, OwnBuildings: () => null }))
jest.mock('../components/home/NearPins', () => ({ NearPins: () => null }))

/* eslint-disable import/first */
import { HomeMap } from '../components/home/HomeMap'
/* eslint-enable import/first */

const FIX = { latitude: 12.9784, longitude: 77.6408 }
const SHEET = { half: 420, full: 120 }
const CITY_PICK = { n: 0, here: false }
const NO_PINS: never[] = []
const ASK = jest.fn()
const DRAWER_TOP = makeMutable(SHEET.half)
const map = (reach: typeof FIX | null) => (
  <HomeMap
    center={FIX}
    cityCentre={FIX}
    fallbackCentre={FIX}
    cityPick={CITY_PICK}
    requestLocation={ASK}
    locateVisible
    drawer={SHEET}
    drawerTop={DRAWER_TOP}
    segment="events"
    topChrome={90}
    mapHeight={700}
    drawerSnapTop={SHEET.half}
    focused
    glowVisible={false}
    nearPins={NO_PINS}
    fitNear={0}
    reach={reach}
  />
)
const event = (id: string, latitude: number) => ({
  id,
  title: id,
  start_time: '2026-11-04T15:00:00Z',
  end_time: null,
  timezone: 'Asia/Kolkata',
  latitude,
  longitude: FIX.longitude,
  venue_name: id,
})
const settle = async () => {
  await act(async () => void mockLoaded?.())
  await act(async () => void (await new Promise((r) => setTimeout(r, 700))))
}
const pinIds = () => ((mockSources.pins as { features: { properties: { id: string } }[] } | undefined)?.features ?? []).map((f) => f.properties.id)

beforeEach(() => {
  for (const k of Object.keys(mockSources)) delete mockSources[k]
  mockEvents = [event('near', FIX.latitude + 0.02), event('far', FIX.latitude + 0.2)]
})

it('off: no reach is drawn and every pin lights (the control)', async () => {
  await render(map(null))
  await settle()
  expect(mockSources['reach-mask']).toBeUndefined()
  expect(mockSources['reach-walk']).toBeUndefined()
  expect(pinIds().sort()).toEqual(['far', 'near'])
})

it('on: the dark, the ride ring and the walk are drawn, and only what is inside the ring lights', async () => {
  await render(map(FIX))
  await settle()
  expect(mockSources['reach-mask']).toBeTruthy()
  expect(mockSources['reach-ride']).toBeTruthy()
  expect(mockSources['reach-walk']).toBeTruthy()
  expect(pinIds()).toEqual(['near'])
})
