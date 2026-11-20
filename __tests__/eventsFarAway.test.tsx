import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

/**
 * "Nothing near you yet" (pulse-map sheet 07 f3–4; the advisor's rules on SCRUM-1087), on the screen: a phone in
 * Saarbrücken, nothing within 25 km, the server naming Bengaluru. The screen renders for real; what it stands on is
 * stubbed, as in `eventsDeviceCity`.
 */
const mockUser: { id: string } | null = { id: 'u-far' }
const mockFocused = true
const mockVisible = true
const mockFull = false
let mockNear: object | undefined
const SOON = new Date(Date.now() + 2 * 86_400_000).toISOString()
const mockFeatured = ['e1', 'e2'].map((id, i) => ({ id, title: `Event ${id}`, start_time: SOON, end_time: null, cover_image_url: `https://img/${i}.jpg`, city: 'Bengaluru', venue_name: 'Olive Beach', latitude: 12.97, longitude: 77.6, is_featured: true, featured: { kind: 'editorial' as const, rank: i + 1 } }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useScrollToTop: () => {},
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => ({}),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  // Saarbrücken: outside every served city.
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 49.2402, longitude: 6.9969, accuracy: 10 }, timestamp: Date.now() })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 49.2402, longitude: 6.9969, accuracy: 10 }, timestamp: Date.now() })),
  reverseGeocodeAsync: jest.fn(async () => [{ city: 'Saarbrücken', isoCountryCode: 'DE' }]),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
let mockBrowse: { onLocate?: () => void } | null = null
jest.mock('../components/home/HomeShell', () => ({
  HomeShell: ({ renderEvents }: { renderEvents: (b: (browse: object) => void, visible: boolean, full: boolean) => React.ReactNode }) => (
    <>
      {renderEvents((browse) => {
        mockBrowse = browse
      }, mockVisible, mockFull)}
    </>
  ),
}))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 92, tabBarTop: () => 800 }))
let mockLapVisible: boolean | undefined
let mockSwipe: ((page: number) => void) | undefined
jest.mock('../components/pulse/LeadPager', () => ({
  LeadPager: (p: { visible?: boolean; onPage: (page: number) => void }) => {
    mockLapVisible = p.visible
    mockSwipe = p.onPage
    return null
  },
}))
jest.mock('../components/pulse/FriendsCard', () => ({ FriendsCard: () => null }))
jest.mock('../components/ds/EventCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    EventCard: (p: { title: string; onPress: () => void; onPressIn?: () => void; onLongPress?: (frame: object) => void }) => (
      <Pressable testID={`row-${p.title}`} onPress={p.onPress} onPressIn={p.onPressIn} onLongPress={() => p.onLongPress?.({ x: 0, y: 0, width: 300, height: 64 })}>
        <Text>{p.title}</Text>
      </Pressable>
    ),
  }
})
// The two sheets the header opens, each with a way to close it (the city's is opened from the shell, above).
// The filter sheet opens from the Filters chip now (Option C: the chips are the header).
jest.mock('../components/pulse/QuickChips', () => {
  const { Pressable } = require('react-native')
  return { QuickChips: (p: { onOpenFilters: () => void }) => <Pressable testID="open-filters" onPress={p.onOpenFilters} /> }
})
jest.mock('../components/pulse/FilterControl', () => {
  const { Pressable } = require('react-native')
  return {
    FilterSheet: (p: { visible: boolean; onClose: () => void }) =>
      p.visible ? <Pressable testID="close-sheet" onPress={p.onClose} /> : null,
  }
})
jest.mock('../components/ds/DayHeading', () => ({ DayHeading: () => null }))
jest.mock('../components/cityArt/CityArtCard', () => ({ CityArtBanner: () => null, CityArtCard: () => null }))
jest.mock('../components/cityArt/drawable', () => ({ drawableCityArt: () => null }))
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn(async () => {}) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../components/Skeleton', () => ({ Skeleton: () => null, SkeletonBlock: () => null, SkeletonLine: () => null }))
const mockShowToast = jest.fn()
type FarProps = { far?: { city: string; side: string; through: boolean } | null; away?: unknown; onFarSide?: (s: 'near' | 'city') => void; onBackToYou?: () => void; only?: string }
let mockPlace: FarProps | null = null
jest.mock('../components/pulse/PulseBanners', () => ({
  PulseBanners: (p: FarProps) => {
    if (p.only === 'place') mockPlace = p
    return null
  },
}))
jest.mock('../components/motion/FadeInUp', () => ({ children }: { children: React.ReactNode }) => children)
jest.mock('../components/pulse/CityPicker', () => ({ CityPicker: () => null }))
jest.mock('../components/pulse/PulsePeek', () => ({ PulsePeek: () => null }))
jest.mock('../lib/api', () => ({
  getEvents: jest.fn(async (q: { featured?: boolean }) => ({ data: q?.featured ? mockFeatured : [], error: null })),
}))
const mockCities = [
  { city: 'Bengaluru', slug: 'bengaluru', country: 'IN', eventCount: 9, centre: { latitude: 12.9716, longitude: 77.5946 }, isDefault: true },
  { city: 'Mysuru', slug: 'mysuru', country: 'IN', eventCount: 3, centre: { latitude: 12.2958, longitude: 76.6394 } },
]
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvents: jest.fn(async (q: { include?: string }) => ({ success: true, data: { events: [], pagination: { totalCount: 0 }, ...(q?.include === 'near' && mockNear ? { near: mockNear } : {}) } })),
    getEvent: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
    getBatchCheckinStatuses: jest.fn(async () => ({ success: true, data: {} })),
    getEventCities: jest.fn(async () => ({ success: true, data: { cities: mockCities, defaultCitySlug: 'bengaluru' } })),
    getCategories: jest.fn(async () => ({ success: false })),
    recordCityDemand: jest.fn(async () => ({ success: true })),
    toggleInterest: jest.fn(async () => ({ success: false })),
  },
}))
jest.mock('../lib/cityStorage', () => ({ readStoredCity: jest.fn(async () => null), storeCity: jest.fn(async () => {}) }))
jest.mock('../lib/roomSignal', () => ({ publishRoomSignal: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn() }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/usePresence', () => ({ usePresence: () => ({ finished: false }) }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => 'connected' }))
jest.mock('../lib/photoUtils', () => ({ getOptimizedImageUrl: (url: string) => url }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
  currentUserId: () => mockUser?.id ?? null,
}))

/* eslint-disable import/first */
import Events from '../app/(tabs)/events'
import { setLocationSharing } from '../lib/shareLocation'
/* eslint-enable import/first */

async function settle() {
  for (let i = 0; i < 8; i += 1) await act(async () => {})
}
const FAR = { reachKm: 25, empty: true, nearestCity: { slug: 'bengaluru', name: 'Bengaluru', country: 'IN', distanceKm: 7518.4, centre: { latitude: 12.9716, longitude: 77.5946 } } }

beforeEach(() => {
  jest.clearAllMocks()
  setLocationSharing(true)
  mockPlace = null
  mockNear = FAR
})

it('nothing within 25 km: the far line (In Bengaluru), no away notice, the lap waits, the distance said once', async () => {
  await render(<Events />)
  await settle()
  expect(mockPlace?.far).toEqual({ city: 'Bengaluru', side: 'city', through: false })
  expect(mockPlace?.away).toBeNull()
  expect(mockLapVisible).toBe(false)
  expect(screen.getAllByText('Bengaluru is about 7,500 km away')).toHaveLength(1)
})

it('"Near you": the honest empty, where Blend’n is on (nearest first), nothing borrowed', async () => {
  await render(<Events />)
  await settle()
  await act(async () => mockPlace?.onFarSide?.('near'))
  await settle()
  expect(screen.getByText('Nothing within 25 km yet')).toBeTruthy()
  expect(screen.getByText('Blend’n is on in Mysuru and Bengaluru. We’ll tell you the day it opens near you.')).toBeTruthy()
  expect(screen.queryByText('Bengaluru is about 7,500 km away')).toBeNull()
})

it('tapping through (the distance line, or a swipe of the lead) is browsing the city: the lap runs; back on you ends it', async () => {
  await render(<Events />)
  await settle()
  await fireEvent.press(screen.getByTestId('pulse-far-distance'))
  await settle()
  expect(mockPlace?.far).toEqual({ city: 'Bengaluru', side: 'city', through: true })
  expect(mockLapVisible).toBe(true)
  await act(async () => mockBrowse?.onLocate?.())
  await settle()
  expect(mockPlace?.far?.through).toBe(false)
  expect(mockLapVisible).toBe(false)
  await act(async () => mockSwipe?.(1))
  await settle()
  expect(mockPlace?.far?.through).toBe(true)
})

it('something near (the control): no far line, the lap runs', async () => {
  mockNear = { reachKm: 25, empty: false, nearestCity: null }
  await render(<Events />)
  await settle()
  expect(mockPlace?.far ?? null).toBeNull()
  expect(mockLapVisible).toBe(true)
})

/*
 * Location turned off in Settings while away: the fix goes (`fixAfterPermission`, the 7.3 km bug), and so must the
 * last-known position that orders the lap (SCRUM-1077). It stayed, so a denied phone kept sending a position with the
 * Featured read and the server measured every card from it.
 */
it('denied on the way back: no position goes with the Featured read, the lap seed’s included', async () => {
  const { AppState } = require('react-native') as typeof import('react-native')
  const Location = require('expo-location') as { getForegroundPermissionsAsync: jest.Mock }
  const { getEvents } = require('../lib/api') as { getEvents: jest.Mock }
  const onChange: ((s: string) => void)[] = []
  const sub = jest.spyOn(AppState, 'addEventListener').mockImplementation(((kind: string, fn: (s: string) => void) => {
    if (kind === 'change') onChange.push(fn)
    return { remove: () => {} }
  }) as never)
  await render(<Events />)
  await settle()
  const featuredAt = () => getEvents.mock.calls.filter(([q]) => q?.featured).map(([q]) => [q.lat ?? null, q.lon ?? null])
  expect(featuredAt().at(-1)).not.toEqual([null, null])
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })
  await act(async () => onChange.forEach((fn) => fn('active')))
  await settle()
  expect(featuredAt().at(-1)).toEqual([null, null])
  Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })
  sub.mockRestore()
})
