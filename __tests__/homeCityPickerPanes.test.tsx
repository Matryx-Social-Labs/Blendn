/**
 * The city picker opens from either pane of the home drawer (SCRUM-1064).
 *
 * The shell hides the pane that is not showing with `display: 'none'`. The picker used to be drawn inside the Events
 * pane, so opening it from Places (the City chip, Places' "Change city") opened it inside a hidden view: nothing
 * appeared, the open state stayed true, and the sheet popped up the moment the person went back to Events.
 *
 * The real shell and the real Pulse render here; the map, the drawer's gestures, Places' list and the picker's sheet
 * are stubbed to what this needs: Places' "Change city" calls what the shell was given, and the picker is a view with a
 * close and a choose.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet, type ReactTestInstance } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useScrollToTop: () => {},
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
  reverseGeocodeAsync: jest.fn(async () => []),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 92, tabBarTop: () => 800 }))

// The shell's own parts: no map, no gestures. The drawer draws its header and its panes; the tabs are two buttons.
jest.mock('../components/home/HomeMap', () => ({ HomeMap: () => null }))
jest.mock('../components/home/MapBanners', () => ({ MapBanners: () => null }))
jest.mock('../components/pulse/PulseTopBar', () => ({ PulseTopBar: () => null, TOP_BAR_HEIGHT: 64 }))
jest.mock('../components/pulse/NotificationBell', () => ({ NotificationBell: () => null }))
jest.mock('../components/home/HomeDrawer', () => {
  const { View } = require('react-native')
  return {
    ...jest.requireActual('../components/home/HomeDrawer'),
    HomeDrawer: (p: { header: React.ReactNode; children: React.ReactNode }) => (
      <View>
        {p.header}
        {p.children}
      </View>
    ),
  }
})
jest.mock('../components/ds/TitleTabs', () => {
  const { Pressable, View } = require('react-native')
  return {
    TitleTabs: (p: { items: readonly string[]; onChange: (i: number) => void; trailing?: React.ReactNode }) => (
      <View>
        {p.items.map((label, i) => (
          <Pressable key={label} testID={`tab-${label}`} onPress={() => p.onChange(i)} />
        ))}
        {p.trailing}
      </View>
    ),
  }
})
jest.mock('../components/home/CityChip', () => {
  const { Pressable } = require('react-native')
  return { CityChip: (p: { onPress: () => void }) => <Pressable testID="city-chip" onPress={p.onPress} /> }
})
// Places: its empty city's "Change city", and the city it is browsing.
jest.mock('../components/home/PlacesList', () => {
  const { Pressable, Text, View } = require('react-native')
  return {
    PlacesList: (p: { browse: { city: string | null; openCityPicker: () => void } }) => (
      <View>
        <Pressable testID="places-change-city" onPress={p.browse.openCityPicker} />
        <Text testID="places-city">{p.browse.city ?? ''}</Text>
      </View>
    ),
  }
})
// The picker's sheet: a view with a close and a choose (the real Sheet needs a modal host).
jest.mock('../components/pulse/CityPicker', () => {
  const { Pressable, View } = require('react-native')
  return {
    CityPicker: (p: { visible: boolean; onClose: () => void; onChoose: (c: { city: string; slug: string | null }, here: boolean) => void }) =>
      p.visible ? (
        <View testID="city-picker">
          <Pressable testID="picker-close" onPress={p.onClose} />
          <Pressable testID="picker-choose-mumbai" onPress={() => p.onChoose({ city: 'Mumbai', slug: 'mumbai' }, false)} />
        </View>
      ) : null,
  }
})

// What the Pulse stands on, as in `eventsDeviceCity`.
jest.mock('../components/pulse/LeadPager', () => ({ LeadPager: () => null }))
jest.mock('../components/pulse/FriendsCard', () => ({ FriendsCard: () => null }))
jest.mock('../components/ds/EventCard', () => ({ EventCard: () => null }))
jest.mock('../components/pulse/QuickChips', () => ({ QuickChips: () => null }))
jest.mock('../components/pulse/FilterControl', () => ({ FilterSheet: () => null }))
jest.mock('../components/ds/DayHeading', () => ({ DayHeading: () => null }))
jest.mock('../components/cityArt/CityArtCard', () => ({ CityArtBanner: () => null, CityArtCard: () => null }))
jest.mock('../components/cityArt/drawable', () => ({ drawableCityArt: () => null }))
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn(async () => {}) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../components/Skeleton', () => ({ Skeleton: () => null, SkeletonBlock: () => null, SkeletonLine: () => null }))
// Stable, as the real hook's is: a new function each render re-runs every effect that depends on it.
const mockToast = { showToast: jest.fn() }
jest.mock('../components/Toast', () => ({ useToast: () => mockToast }))
jest.mock('../components/pulse/PulseBanners', () => ({ PulseBanners: () => null }))
jest.mock('../components/pulse/PulsePeek', () => ({ PulsePeek: () => null }))
jest.mock('../components/motion/FadeInUp', () => ({ children }: { children: React.ReactNode }) => children)
jest.mock('../lib/api', () => ({ getEvents: jest.fn(async () => ({ data: [], error: null })) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvent: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
    getBatchCheckinStatuses: jest.fn(async () => ({ success: true, data: {} })),
    getEventCities: jest.fn(async () => ({
      success: true,
      data: {
        cities: [
          { city: 'Bengaluru', slug: 'bengaluru', country: 'IN', eventCount: 9, isDefault: true },
          { city: 'Mumbai', slug: 'mumbai', country: 'IN', eventCount: 4 },
        ],
        countries: [{ code: 'IN', name: 'India', defaultCitySlug: 'bengaluru' }],
        defaultCitySlug: 'bengaluru',
        device: null,
      },
    })),
    getCategories: jest.fn(async () => ({ success: false })),
    recordCityDemand: jest.fn(async () => ({ success: true })),
    toggleInterest: jest.fn(async () => ({ success: false })),
  },
}))
jest.mock('../lib/cityStorage', () => ({
  readStoredCity: jest.fn(async () => ({ city: 'Bengaluru', slug: 'bengaluru', source: 'chosen' })),
  storeCity: jest.fn(async () => {}),
}))
jest.mock('../lib/roomSignal', () => ({ publishRoomSignal: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn() }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/usePresence', () => ({ usePresence: () => ({ finished: false }) }))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => 'connected' }))
jest.mock('../lib/photoUtils', () => ({ getOptimizedImageUrl: (url: string) => url }))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() },
}))
const mockUser = { id: 'u-a' }
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
  currentUserId: () => 'u-a',
}))

/* eslint-disable import/first */
import Events from '../app/(tabs)/events'
import { getEvents } from '../lib/api'
import { storeCity } from '../lib/cityStorage'
/* eslint-enable import/first */

async function settle() {
  for (let i = 0; i < 8; i += 1) await act(async () => {})
}

/** On screen: no ancestor hidden with `display: 'none'` (how the shell hides the pane that is not showing). */
function shown(node: ReactTestInstance): boolean {
  for (let n: ReactTestInstance | null = node; n; n = n.parent) {
    if ((StyleSheet.flatten(n.props.style) as { display?: string } | undefined)?.display === 'none') return false
  }
  return true
}
const picker = () => screen.queryByTestId('city-picker', { includeHiddenElements: true })
const tap = async (testID: string) => {
  await fireEvent.press(screen.getByTestId(testID, { includeHiddenElements: true }))
  await settle()
}

beforeEach(() => jest.clearAllMocks())

it('from Events, the City chip opens the picker on screen and its close shuts it (the control)', async () => {
  await render(<Events />)
  await settle()
  expect(picker()).toBeNull()
  await tap('city-chip')
  expect(picker()).not.toBeNull()
  expect(shown(picker()!)).toBe(true)
  await tap('picker-close')
  expect(picker()).toBeNull()
})

it.each(['city-chip', 'places-change-city'])('from Places, %s opens the picker on screen while Places is showing', async (opener) => {
  await render(<Events />)
  await settle()
  await tap('tab-Places')
  expect(shown(screen.getByTestId('places-city', { includeHiddenElements: true }))).toBe(true)
  await tap(opener)
  expect(picker()).not.toBeNull()
  expect(shown(picker()!)).toBe(true)
})

it('closed from Places, switching back to Events never reopens it', async () => {
  await render(<Events />)
  await settle()
  await tap('tab-Places')
  await tap('places-change-city')
  expect(shown(picker()!)).toBe(true)
  await tap('picker-close')
  expect(picker()).toBeNull()
  await tap('tab-Events')
  expect(picker()).toBeNull()
  await tap('tab-Places')
  expect(picker()).toBeNull()
})

it('a city chosen from Places is stored and browsed by both panes', async () => {
  await render(<Events />)
  await settle()
  await tap('tab-Places')
  await tap('places-change-city')
  expect(shown(picker()!)).toBe(true)
  const fetchesBefore = jest.mocked(getEvents).mock.calls.length
  await tap('picker-choose-mumbai')
  expect(picker()).toBeNull()
  expect(jest.mocked(storeCity).mock.calls.map(([c]) => c.city)).toContain('Mumbai')
  // Places browses it (the shell's `browse.city`) ...
  expect(screen.getByTestId('places-city', { includeHiddenElements: true })).toHaveTextContent('Mumbai')
  // ... and so does the Pulse: its next read asks for Mumbai.
  const asked = jest.mocked(getEvents).mock.calls.slice(fetchesBefore).map((c) => JSON.stringify(c))
  expect(asked.some((c) => c.includes('Mumbai'))).toBe(true)
  await tap('tab-Events')
  expect(picker()).toBeNull()
})

it('from the Events empty state, "Change city" opens the picker on screen (the empty states share the one picker)', async () => {
  await render(<Events />)
  await settle()
  await fireEvent.press(await screen.findByText('Change city'))
  await settle()
  expect(picker()).not.toBeNull()
  expect(shown(picker()!)).toBe(true)
  await tap('picker-close')
  await tap('tab-Places')
  expect(picker()).toBeNull()
})
