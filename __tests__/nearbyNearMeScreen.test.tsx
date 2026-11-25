/**
 * Near me on the Pulse, end to end on the screen (Flow 3b · N1, SCRUM-1022): with a fix in the city the chip draws the
 * reach on the map; an empty Near me list says what is beyond and how far (one `limit=1` read by distance), and See all
 * of the city takes the radius off. The screen renders for real; what it stands on is stubbed, as in `eventsDeviceCity`.
 */
import { act, render, screen, fireEvent } from '@testing-library/react-native'
import React from 'react'

const mockUser: { id: string } | null = { id: 'u-a' }
const mockFocused = true
const mockVisible = true
const mockFull = false
const mockTray: { visible: boolean; onClose: () => void }[] = []
const mockShell = { query: '', setQuery: () => {}, searchOpen: false, lead: 256, openPlaces: jest.fn(), setMapBanners: () => {} }

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
  // Indiranagar: in the city the Pulse is showing.
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 12.9784, longitude: 77.6408, accuracy: 10 }, timestamp: Date.now() })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 12.9784, longitude: 77.6408, accuracy: 10 }, timestamp: Date.now() })),
  reverseGeocodeAsync: jest.fn(async () => [{ city: 'Bengaluru' }]),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
// The shell reports what the drawer is doing; the test decides it.
// The city lives in the shell's title tabs now: its chip calls what the screen reported as `openCityPicker`.
let mockBrowse: { openCityPicker: () => void; reach?: unknown } | null = null
jest.mock('../components/home/HomeShell', () => ({
  HomeShell: ({ renderEvents }: { renderEvents: (b: (browse: { openCityPicker: () => void; reach?: unknown }) => void, visible: boolean, full: boolean, shell: object) => React.ReactNode }) => {
    const { Pressable } = require('react-native')
    return (
      <>
        {renderEvents((browse) => {
          mockBrowse = browse
        }, mockVisible, mockFull, mockShell)}
        <Pressable testID="open-city" onPress={() => mockBrowse?.openCityPicker()} />
      </>
    )
  },
}))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 92, tabBarTop: () => 800 }))
jest.mock('../components/pulse/LeadPager', () => {
  const { Pressable, Text, View } = require('react-native')
  return {
    LeadPager: (p: { cards: { id: string; title: string }[]; onOpen: (i: number) => void; onLongPress?: (i: number, frame: object) => void }) => (
      <View>
        {p.cards.map((c, i) => (
          <Pressable key={c.id} testID={`card-${c.id}`} onPress={() => p.onOpen(i)} onLongPress={() => p.onLongPress?.(i, { x: 0, y: 0, width: 300, height: 256 })}>
            <Text>{c.title}</Text>
          </Pressable>
        ))}
      </View>
    ),
  }
})
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
  // Near me as the chip sets it: the filters with the short ride on.
  return {
    QuickChips: (p: { nearOn: boolean; filters: object; onChange: (f: object) => void }) =>
      p.nearOn ? <Pressable testID="near-me" onPress={() => p.onChange({ ...p.filters, radiusKm: 8 })} /> : null,
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
// The read past the reach: Toronto-style, six this week, the closest 14 km away.
const mockBeyond = jest.fn(async (..._a: unknown[]) => ({
  success: true,
  data: { events: [{ id: 'far', distance: 14.2, venue_name: 'Liberty Village' }], pagination: { totalCount: 6 } },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvent: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
    getBatchCheckinStatuses: jest.fn(async () => ({ success: true, data: {} })),
    getEventCities: jest.fn(async () => ({ success: true, data: { cities: [{ city: 'Bengaluru', count: 9 }] } })),
    getEvents: (...a: unknown[]) => mockBeyond(...a),
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
/* eslint-enable import/first */

async function settle() {
  for (let i = 0; i < 10; i += 1) await act(async () => {})
}

beforeEach(() => jest.clearAllMocks())

it('Near me off: no reach on the map (the control)', async () => {
  await render(<Events />)
  await settle()
  expect(mockBrowse?.reach ?? null).toBeNull()
  expect(screen.queryByTestId('pulse-nothing-near')).toBeNull()
})

it('Near me on, nothing in reach: the map gets the reach, the card says what is beyond, See all of the city takes the radius off', async () => {
  await render(<Events />)
  await settle()
  await fireEvent.press(screen.getByTestId('near-me'))
  await settle()
  expect(mockBrowse?.reach).toEqual({ latitude: 12.9784, longitude: 77.6408 })
  // One read, by distance, of the city this week.
  const ask = mockBeyond.mock.calls.map((c) => c[0] as Record<string, unknown>).find((q) => q.sortBy === 'distance' && q.limit === 1)
  expect(ask).toMatchObject({ city: 'Bengaluru', sortOrder: 'asc' })
  expect(ask?.radius).toBeUndefined()
  expect(screen.getByText('Bengaluru has 6 events this week. The closest is 14 km away, at Liberty Village.')).toBeTruthy()
  await fireEvent.press(screen.getByText('See all of Bengaluru'))
  await settle()
  expect(screen.queryByTestId('pulse-nothing-near')).toBeNull()
  expect(mockBrowse?.reach ?? null).toBeNull()
})
