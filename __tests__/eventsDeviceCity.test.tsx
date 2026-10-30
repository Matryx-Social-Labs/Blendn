/**
 * The Pulse works out which city the phone is in from its fix (a reverse geocode), to offer a switch, to improve an
 * app-chosen city, and to tell the server which city people are away in (`recordCityDemand`). With "Share location for
 * nearby events" off none of that happens: the fix is not turned into a place (SCRUM-908).
 *
 * The screen renders for real; what it stands on is stubbed, as in `pulseCoachMark`.
 */
import { act, render } from '@testing-library/react-native'
import React from 'react'

const mockUser: { id: string } | null = { id: 'u-a' }
const mockFocused = true
const mockVisible = true
const mockFull = false
const mockTray: { visible: boolean; onClose: () => void }[] = []

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useScrollToTop: () => {},
  useIsFocused: () => mockFocused,
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  // Mumbai: a long way from the city the app has chosen.
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 10 }, timestamp: Date.now() })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 19.076, longitude: 72.8777, accuracy: 10 }, timestamp: Date.now() })),
  reverseGeocodeAsync: jest.fn(async () => [{ city: 'Mumbai' }]),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
// The shell reports what the drawer is doing; the test decides it.
// The city lives in the shell's title tabs now: its chip calls what the screen reported as `openCityPicker`.
let mockBrowse: { openCityPicker: () => void } | null = null
jest.mock('../components/home/HomeShell', () => ({
  HomeShell: ({ renderEvents }: { renderEvents: (b: (browse: { openCityPicker: () => void }) => void, visible: boolean, full: boolean) => React.ReactNode }) => {
    const { Pressable } = require('react-native')
    return (
      <>
        {renderEvents((browse) => {
          mockBrowse = browse
        }, mockVisible, mockFull)}
        <Pressable testID="open-city" onPress={() => mockBrowse?.openCityPicker()} />
      </>
    )
  },
}))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 92, tabBarTop: () => 800 }))
jest.mock('../components/pulse/FeaturedCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    FEATURED_CARD_GAP: 16,
    featuredCardLayout: () => ({ width: 300, photoHeight: 200, height: 300, inset: 24 }),
    FeaturedCard: (p: { id: string; title: string; onPress: () => void; onLongPress: (frame: object) => void }) => (
      <Pressable testID={`card-${p.id}`} onPress={p.onPress} onLongPress={() => p.onLongPress({ x: 0, y: 0, width: 300, height: 300 })}>
        <Text>{p.title}</Text>
      </Pressable>
    ),
  }
})
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
jest.mock('../components/pulse/PulseHeader', () => {
  const { Pressable, View } = require('react-native')
  return {
    PULSE_HEADER_HEIGHT: 48,
    PulseSearch: (p: { onPressFilter: () => void }) => (
      <View>
        <Pressable testID="open-filters" onPress={p.onPressFilter} />
      </View>
    ),
  }
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
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../components/pulse/PulseBanners', () => ({ PulseBanners: () => null }))
jest.mock('../components/motion/FadeInUp', () => ({ children }: { children: React.ReactNode }) => children)
// The city picker's sheet, with a way to close it (the Sheet needs a modal host).
jest.mock('../components/pulse/CityPicker', () => {
  const { Pressable } = require('react-native')
  return { CityPicker: (p: { visible: boolean; onClose: () => void }) => (p.visible ? <Pressable testID="close-sheet" onPress={p.onClose} /> : null) }
})
// The peek the long-press opens: what it was told, and a way to close it.
jest.mock('../components/pulse/PulsePeek', () => ({
  PulsePeek: (p: { peek: unknown; onClose: () => void }) => {
    mockTray.push({ visible: !!p.peek, onClose: p.onClose })
    return null
  },
}))
jest.mock('../lib/api', () => ({ getEvents: jest.fn(async () => ({ data: [], error: null })) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvent: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
    getBatchCheckinStatuses: jest.fn(async () => ({ success: true, data: {} })),
    getEventCities: jest.fn(async () => ({ success: true, data: { cities: [{ city: 'Bengaluru', count: 9 }, { city: 'Mumbai', count: 4 }] } })),
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
jest.mock('../lib/useMinimumVisible', () => ({ useMinimumVisible: (v: boolean) => v }))
jest.mock('../lib/photoUtils', () => ({ getOptimizedImageUrl: (url: string) => url }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
  currentUserId: () => mockUser?.id ?? null,
}))

/* eslint-disable import/first */
import * as Location from 'expo-location'
import Events from '../app/(tabs)/events'
import { apiClient } from '../lib/apiClient'
import { setLocationSharing } from '../lib/shareLocation'
/* eslint-enable import/first */

async function settle() {
  for (let i = 0; i < 8; i += 1) await act(async () => {})
}
const reverse = Location.reverseGeocodeAsync as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  setLocationSharing(true)
})
afterEach(() => setLocationSharing(true))

it('with sharing on, the fix is named as a city (the control)', async () => {
  await render(<Events />)
  await settle()
  expect(reverse).toHaveBeenCalled()
})

it('with sharing off, the fix is never turned into a place: no geocode, no city demand', async () => {
  setLocationSharing(false)
  await render(<Events />)
  await settle()
  expect(reverse).not.toHaveBeenCalled()
  expect(apiClient.recordCityDemand).not.toHaveBeenCalled()
})
