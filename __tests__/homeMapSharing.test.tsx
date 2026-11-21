/**
 * With "Share location for nearby events" off, the home map is not centred on the person (SCRUM-908).
 *
 * A viewport query is the camera's centre and bounds. While the camera follows the GPS fix those are the person's
 * position under another name, so the map must not follow a fix at all when the switch is off: it opens on the city, and
 * a viewport query means where they looked.
 */
import React from 'react'
import { act, render, screen } from '@testing-library/react-native'
import { makeMutable } from 'react-native-reanimated'

const mockStops: Array<{ center?: [number, number]; padding?: unknown; [k: string]: unknown }> = []
const mockCamera: { initial?: { center: [number, number]; padding?: unknown }; centre: [number, number] } = { centre: [0, 0] }
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
        // A flat linear projection around the fix, so a pan can be checked by direction.
        project: async ([lon, lat]: [number, number]) => [200 + (lon - 77.6408) * 1e5, 300 - (lat - 12.9784) * 1e5],
        unproject: async ([x, y]: [number, number]) => [77.6408 + (x - 200) / 1e5, 12.9784 - (y - 300) / 1e5],
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
    Images: () => null,
    NativeUserLocation: () => React.createElement(View, { testID: 'user-puck' }),
    Marker: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
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
jest.mock('../components/home/MapLitLayers', () => ({ annotationTitle: () => ({}), Chips: () => null, CityBuildings: () => null, GroundGlow: () => null, LitBuildings: () => null, OwnBuildings: () => null, ReachLabels: () => null }))
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
const map = (center: (typeof FIX & { timestamp?: number }) | null, reach: typeof FIX | null = null, drawerSnapTop = SHEET.half) => (
  <HomeMap
    center={center}
    cityCentre={CITY}
    fallbackCentre={CITY}
    cityPick={CITY_PICK}
    requestLocation={ASK}
    locateVisible
    drawerTop={DRAWER_TOP}
    drawer={SHEET}
    segment="events"
    topChrome={90}
    mapHeight={700}
    drawerSnapTop={drawerSnapTop}
    focused
    glowVisible={false}
    nearPins={NO_PINS}
    fitNear={0}
    reach={reach}
  />
)
// Within ~200 m of the fix: a query (rounded, bounds-derived) or a camera stop that is on the person.
const onFix = (lat: number, lon: number) => Math.abs(lat - FIX.latitude) < 0.002 && Math.abs(lon - FIX.longitude) < 0.002
const stopOnFix = (s: { center?: [number, number] }) => !!s.center && onFix(s.center[1], s.center[0])
const readOnFix = (call: unknown[]) => {
  const q = call[0] as { lat?: number; lon?: number; bbox?: [number, number, number, number] }
  // A box on the fix is the fix under another name: its centre is checked like a point.
  if (q.bbox) return onFix((q.bbox[1] + q.bbox[3]) / 2, (q.bbox[0] + q.bbox[2]) / 2)
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
      // The open frame's nearest read went at mount, while sharing was on (and through the client's own sharing gate).
      expect(mockGetEvents.mock.calls.filter((c) => readOnFix(c) && ((c as unknown[])[0] as { sortBy?: string }).sortBy !== 'distance')).toHaveLength(0)
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

describe('Near me and the switch (security review, 2026-11-05): after an opt-out nothing returns to the fix', () => {
  // A wait past the viewport read's debounce, so a read the camera would make is made.
  const settleReads = async () => {
    await act(async () => void mockLoaded?.())
    await act(async () => void (await new Promise((r) => setTimeout(r, 700))))
  }
  // Near me on, then a pan away from it (the map is now "touched": the switch's own move to the city does not run).
  const nearMeThenPan = async () => {
    const view = await render(map(FIX))
    await settleReads()
    await view.rerender(map(FIX, FIX))
    await settleReads()
    const [lon, lat] = [CITY.longitude, CITY.latitude]
    await act(async () => mockRegion?.({ nativeEvent: { bounds: [lon - 0.2, lat - 0.2, lon + 0.2, lat + 0.2], center: [lon, lat], zoom: 11, pitch: 0, userInteraction: true } }))
    mockStops.length = 0
    mockGetEvents.mockClear()
    return view
  }

  it('control: with sharing on, Near me going off takes the camera back to the fix', async () => {
    const view = await nearMeThenPan()
    await view.rerender(map(FIX, null))
    await settleReads()
    expect(mockStops.filter(stopOnFix).length).toBeGreaterThan(0)
  })

  it('sharing off, then Near me off: the camera goes to the city, never the fix, and nothing is read around it', async () => {
    const view = await nearMeThenPan()
    await act(async () => setLocationSharing(false))
    await settleReads()
    await view.rerender(map(FIX, null))
    await settleReads()
    expect(mockStops.filter(stopOnFix)).toHaveLength(0)
    expect(mockGetEvents.mock.calls.filter(readOnFix)).toHaveLength(0)
  })

  it('sharing off while the screen still says Near me: the map ignores the reach (no frame on the fix, no ring)', async () => {
    const view = await nearMeThenPan()
    await act(async () => setLocationSharing(false))
    await settleReads()
    // A drawer snap after the switch must not re-issue the reach frame either.
    await view.rerender(map(FIX, FIX))
    await settleReads()
    expect(mockStops.filter(stopOnFix)).toHaveLength(0)
    expect(mockStops.filter((st) => st.pitch === 0 && typeof st.zoom === 'number' && (st.zoom as number) < 14)).toHaveLength(0)
    expect(mockGetEvents.mock.calls.filter(readOnFix)).toHaveLength(0)
  })
})

/*
 * Option 3 opens framed on you and the six events nearest you (pulse-map 05). The drive found it framed only what the
 * first street-zoom view had read, which near you is usually nothing: it stayed on you at z16 with no event in sight.
 * The six nearest are one read of their own, sorted by distance from the fix (sharing-gated: it is your position).
 */
describe('the open frame: you and the six nearest', () => {
  const near = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `n${i}`, title: `N${i}`, latitude: FIX.latitude + 0.0012 * i, longitude: FIX.longitude + 0.0009 * i, startTime: '2099-01-01T10:00:00Z', endTime: '2099-01-01T12:00:00Z' }))
  const nearestRead = (call: unknown[]) => (call[0] as { sortBy?: string }).sortBy === 'distance'
  beforeEach(() => {
    mockGetEvents.mockImplementation((async (q: { sortBy?: string }) => ({ success: true, data: { events: q.sortBy === 'distance' ? near : [] } })) as never)
  })
  afterEach(() => mockGetEvents.mockImplementation(async () => ({ success: true, data: { events: [] } })))

  it('asks for the six nearest around the fix, and frames them with you (z14.6–16), though the first view held none', async () => {
    await render(map(FIX))
    await settle()
    const read = mockGetEvents.mock.calls.find(nearestRead) as unknown as [{ lat: number; lon: number; limit: number; radius?: number }] | undefined
    expect(read?.[0]).toMatchObject({ limit: 6 })
    expect(onFix(read![0].lat, read![0].lon)).toBe(true)
    expect(read![0].radius).toBeUndefined()
    const frame = mockStops.find((s) => typeof s.zoom === 'number' && (s.zoom as number) < 16 && (s.zoom as number) >= 14.6) as { center: [number, number] } | undefined
    expect(frame).toBeTruthy()
    // Pulled towards the six, not left on you.
    expect(frame!.center[1]).toBeGreaterThan(FIX.latitude + 0.001)
  })

  it('once per visit: a second fix does not read or frame again', async () => {
    const view = await render(map(FIX))
    await settle()
    const reads = mockGetEvents.mock.calls.filter(nearestRead).length
    await view.rerender(map({ latitude: FIX.latitude + 0.0001, longitude: FIX.longitude }))
    await settle()
    expect(mockGetEvents.mock.calls.filter(nearestRead)).toHaveLength(reads)
  })

  it('sharing off (the control): no nearest read at all', async () => {
    setLocationSharing(false)
    await render(map(FIX))
    await settle()
    expect(mockGetEvents.mock.calls.filter(nearestRead)).toHaveLength(0)
  })
})

/*
 * SCRUM-1090 (owner, 2026-11-20): with the drawer full, "the last seen here on the map is behind the blendn top left".
 * At full the map you can see is nothing (the drawer's top is the top bar's foot), yet the camera re-centred into it: the
 * fix and its callout landed on the top bar's edge, and pulled back down the map slid back. Full covers the map; the map
 * stays as it was, and nothing of ours is drawn on it.
 */
describe('the drawer full covers the map (SCRUM-1090)', () => {
  const TOP = 90 // topChrome above: where `full` rests
  const STALE = { ...FIX, timestamp: Date.now() - 25 * 60_000 }

  it('rising to full moves no camera, and coming back to half moves none either', async () => {
    const view = await render(map(FIX))
    await settle()
    mockStops.length = 0
    await view.rerender(map(FIX, null, TOP))
    await settle()
    expect(mockStops).toEqual([])
    await view.rerender(map(FIX, null, SHEET.half))
    await settle()
    expect(mockStops).toEqual([])
  })

  it('control: half to a lower snap still keeps what was centred centred', async () => {
    const view = await render(map(FIX))
    await settle()
    mockStops.length = 0
    await view.rerender(map(FIX, null, 600))
    await settle()
    expect(mockStops.length).toBeGreaterThan(0)
  })

  /*
   * Owner, 2026-11-20: "the map snaps or flickers when the drawer is pulled down". MapLibre iOS eases a move whose padding
   * changes, then lands the rest in one frame (drive: a ~70 pt cut on every half → peek, on dev too). The re-centre on a
   * settled snap is a pan in the padding the camera already has, so no move ever changes it there.
   */
  it('a settled snap pans: every stop keeps the padding the camera already had, and the map moves down with the drawer', async () => {
    const view = await render(map(FIX))
    await settle()
    const had = [...mockStops].reverse().find((s) => s.padding)?.padding ?? mockCamera.initial?.padding
    mockStops.length = 0
    await view.rerender(map(FIX, null, 600))
    await settle()
    expect(mockStops.length).toBeGreaterThan(0)
    for (const s of mockStops) expect(s.padding).toEqual(had)
    // The visible middle moved down: the camera's centre goes north of the fix, so the fix rides down into it.
    expect(mockStops.at(-1)?.center?.[1]).toBeGreaterThan(FIX.latitude)
  })

  it('the stale callout is not drawn at full, where it could only sit under the top bar', async () => {
    const view = await render(map(STALE, null, TOP))
    expect(view.queryByTestId('map-stale', { includeHiddenElements: true })).toBeNull()
  })

  it('control: at half it is', async () => {
    const view = await render(map(STALE))
    expect(view.getByTestId('map-stale', { includeHiddenElements: true })).toBeTruthy()
  })
})

/*
 * Task 01's full-drawer rule for "+N more" (sheet 16 A, LOOKBACK 2026-11-20): the full drawer covers the map, so the
 * capsule is not there to read or press under the ink; it is back once the drawer rests at half again.
 */
it('"+N more" is not drawn while the drawer is full; at half it is (the control)', async () => {
  mockGetEvents.mockResolvedValue({ success: true, data: { events: [], pagination: { totalCount: 130 } } } as never)
  const view = await render(map(FIX))
  await settle()
  expect(screen.getByTestId('map-more')).toBeTruthy()
  await view.rerender(map(FIX, null, 90)) // full rests at the top chrome
  await settle()
  expect(screen.queryByTestId('map-more')).toBeNull()
  await view.rerender(map(FIX))
  await settle()
  expect(screen.getByTestId('map-more')).toBeTruthy()
})
