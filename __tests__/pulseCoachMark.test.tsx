/**
 * The Pulse's first-run guidance: a coach mark over the first card, once.
 *
 * It replaced "Tip: Long-press any event card for quick actions. / Got it", a
 * banner at the top of the feed that came back on every visit until dismissed.
 * The mark appears once the whole Pulse is up (the drawer at full, the list at
 * its top, the cards loaded), and Got it, a long-press on any card, or leaving
 * the tab each end it for good. The rules themselves are pinned in
 * `__tests__/coachMarks.test.tsx`; this is the screen keeping them.
 *
 * The screen renders for real; what it stands on (the drawer shell, the cards'
 * media, the network) is stubbed so the test can say what the shell reports.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

let mockUser: { id: string } | null = null
let mockFocused = true
let mockVisible = true
let mockFull = false
const mockTray: { visible: boolean; onClose: () => void }[] = []
const TEXT = 'Hold an event to save, share or preview it.'

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
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
  reverseGeocodeAsync: jest.fn(async () => []),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
// The shell reports what the drawer is doing; the test decides it.
jest.mock('../components/home/HomeShell', () => ({
  HomeShell: ({ renderEvents }: { renderEvents: (b: () => void, visible: boolean, full: boolean) => React.ReactNode }) =>
    renderEvents(() => {}, mockVisible, mockFull),
}))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 92, tabBarTop: () => 800 }))
jest.mock('../components/pulse/FeaturedCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    FEATURED_CARD_GAP: 16,
    featuredCardLayout: () => ({ width: 300, photoHeight: 200, height: 300, inset: 24 }),
    FeaturedCard: (p: { id: string; title: string; onPress: () => void; onLongPress: () => void }) => (
      <Pressable testID={`card-${p.id}`} onPress={p.onPress} onLongPress={p.onLongPress}>
        <Text>{p.title}</Text>
      </Pressable>
    ),
  }
})
jest.mock('../components/pulse/UpcomingCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    UPCOMING_THUMB: 72,
    UpcomingCard: (p: { title: string; onPress: () => void; onLongPress: () => void; onToggleFavorite: () => void }) => (
      <Pressable testID={`row-${p.title}`} onPress={p.onPress} onLongPress={p.onLongPress}>
        <Text>{p.title}</Text>
        <Pressable testID={`heart-${p.title}`} onPress={p.onToggleFavorite} />
      </Pressable>
    ),
  }
})
// The two sheets the header opens, each with a way to close it.
jest.mock('../components/pulse/PulseHeader', () => {
  const { Pressable, View } = require('react-native')
  return {
    PULSE_HEADER_HEIGHT: 104,
    PulseHeader: (p: { onPressCity: () => void; onPressFilter: () => void }) => (
      <View>
        <Pressable testID="open-city" onPress={p.onPressCity} />
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
jest.mock('../components/pulse/SectionHeader', () => ({ SectionHeader: () => null }))
jest.mock('../components/ui/DayHeading', () => ({ DayHeading: () => null }))
jest.mock('../components/cityArt/CityArtCard', () => ({ CityArtBanner: () => null, CityArtCard: () => null }))
jest.mock('../components/cityArt/drawable', () => ({ drawableCityArt: () => null }))
jest.mock('../components/NearbyEventCard', () => () => null)
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn(async () => {}) }))
jest.mock('../components/RealtimeStatusBanner', () => () => null)
jest.mock('../components/Skeleton', () => ({ SkeletonBlock: () => null, SkeletonLine: () => null }))
jest.mock('../components/motion/FadeInUp', () => ({ children }: { children: React.ReactNode }) => children)
jest.mock('../components/motion/RisingSheet', () => {
  const { Pressable } = require('react-native')
  return {
    RisingSheet: () => null,
    SheetFlatList: () => null,
    SheetModal: (p: { visible: boolean; onRequestClose: () => void }) =>
      p.visible ? <Pressable testID="close-sheet" onPress={p.onRequestClose} /> : null,
  }
})
jest.mock('../components/ui/Grabber', () => ({ Grabber: () => null }))
jest.mock('../components/ActionTray', () => ({
  __esModule: true,
  default: (p: { visible: boolean; onClose: () => void }) => {
    mockTray.push(p)
    return null
  },
}))
jest.mock('../lib/api', () => ({ getEvents: jest.fn() }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvent: jest.fn(async () => ({ success: false })),
    getActiveCheckins: jest.fn(async () => ({ success: true, data: { checkIns: [] } })),
    getBatchCheckinStatuses: jest.fn(async () => ({ success: true, data: {} })),
    getEventCities: jest.fn(async () => ({ success: true, data: { cities: [] } })),
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
import Events from '../app/(tabs)/events'
import { CoachMarkHost, spotlightMeasure } from '../components/ds/CoachMarkHost'
import { getEvents } from '../lib/api'
/* eslint-enable import/first */

const SOON = new Date(Date.now() + 2 * 86_400_000).toISOString()
const event = (id: string, cover: string | null) => ({
  id,
  title: `Event ${id}`,
  start_time: SOON,
  end_time: null,
  cover_image_url: cover,
  city: 'Bengaluru',
  venue_name: 'The Humming Tree',
  latitude: null,
  longitude: null,
})
const FEATURED = [event('e1', 'https://img/1.jpg'), event('e2', 'https://img/2.jpg')]

let accounts = 0
function signIn() {
  accounts += 1
  mockUser = { id: `p${accounts}` }
  return mockUser.id
}
const seen = (userId: string) => AsyncStorage.getItem(`events_preview_hint_seen_${userId}`)

async function settle() {
  for (let i = 0; i < 4; i += 1) await act(async () => {})
}
/** The app's root: the screen, then the coach-mark layer over it. */
const App = () => (
  <>
    <Events />
    <CoachMarkHost />
  </>
)
/** What the host measured: the target's instance. Every target is on screen at a fixed rect. */
let measuredNode: { props: { children: { props: { title?: string } } } } | null = null
async function mount() {
  const view = await render(<App />)
  await settle()
  return view
}
/** The shell moved the drawer, or the tab lost or took focus: it renders the Pulse again. */
async function shell(view: Awaited<ReturnType<typeof render>>, next: { full?: boolean; focused?: boolean }) {
  if (next.full !== undefined) mockFull = next.full
  if (next.focused !== undefined) mockFocused = next.focused
  await view.rerender(<App />)
  await settle()
}
const mark = () => screen.queryByText(TEXT)

beforeEach(async () => {
  measuredNode = null
  spotlightMeasure.inWindow = (node, done) => {
    measuredNode = node as never
    done({ x: 24, y: 200, width: 300, height: 300 })
  }
  mockFocused = true
  mockVisible = true
  mockFull = false
  mockTray.length = 0
  ;(getEvents as jest.Mock).mockResolvedValue({ data: FEATURED, error: null })
  await AsyncStorage.clear()
})

describe('the Pulse’s coach mark', () => {
  it('is not the old banner, and waits for the drawer to be all the way up', async () => {
    signIn()
    const view = await mount()
    expect(screen.queryByText(/Long-press any event card/)).toBeNull()
    expect(screen.getByText('Event e1')).toBeTruthy()
    expect(mark()).toBeNull()

    await shell(view, { full: true })
    expect(mark()).toBeTruthy()
  })

  it('is drawn by the root host, never inline, with the first featured card as the hole and the tip below it (R4.1)', async () => {
    signIn()
    mockFull = true
    await mount()
    expect(within(screen.getByTestId('coach-mark-host')).getByTestId('pulse-coach-mark')).toBeTruthy()
    expect(measuredNode?.props.children.props.title).toBe('Event e1')
    // Caret up, at the card above it; the tip starts under the hole (200 + 300 + the 8 pad + the 8 gap).
    expect(StyleSheet.flatten(screen.getByTestId('pulse-coach-mark-caret').props.style)).toMatchObject({ top: -6 })
    let tip = screen.getByTestId('pulse-coach-mark').parent
    while (tip && StyleSheet.flatten(tip.props.style)?.position !== 'absolute') tip = tip.parent
    expect(StyleSheet.flatten(tip!.props.style)).toMatchObject({ top: 516 })
    // Four dim rects, none over the card.
    expect(screen.getAllByTestId(/^coach-mark-dim-/, { includeHiddenElements: true })).toHaveLength(4)
  })

  it('Got it: gone, written as seen, and not back on a remount', async () => {
    const userId = signIn()
    mockFull = true
    const view = await mount()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Got it' })))
    expect(mark()).toBeNull()
    expect(await seen(userId)).toBe('1')
    await view.unmount()

    await mount()
    expect(mark()).toBeNull()
  })

  it('a long-press on a card: gone, the tray opens, and not back on a remount', async () => {
    signIn()
    mockFull = true
    const view = await mount()
    expect(mark()).toBeTruthy()
    await act(async () => fireEvent(screen.getByTestId('card-e2'), 'longPress'))
    expect(mark()).toBeNull()
    expect(mockTray.at(-1)?.visible).toBe(true)
    // Used, not just covered: the tray closing does not bring it back.
    await act(async () => mockTray.at(-1)!.onClose())
    expect(mark()).toBeNull()
    await view.unmount()

    await mount()
    expect(mark()).toBeNull()
  })

  it('a long-press before it ever showed means it never shows', async () => {
    const userId = signIn()
    const view = await mount()
    await act(async () => fireEvent(screen.getByTestId('card-e1'), 'longPress'))
    await shell(view, { full: true })
    expect(mark()).toBeNull()
    expect(await seen(userId)).toBe('1')
  })

  it('leaving the tab: gone, and coming back does not bring it back', async () => {
    signIn()
    mockFull = true
    const view = await mount()
    expect(mark()).toBeTruthy()
    await shell(view, { focused: false })
    expect(mark()).toBeNull()
    await shell(view, { focused: true })
    expect(mark()).toBeNull()
  })

  it('whoever dismissed the old banner is not taught again', async () => {
    const userId = signIn()
    await AsyncStorage.setItem(`events_preview_hint_seen_${userId}`, '1')
    mockFull = true
    await mount()
    expect(screen.getByText('Event e1')).toBeTruthy()
    expect(mark()).toBeNull()
  })

  it('scrolled past the header, it waits; back at the top, it shows', async () => {
    signIn()
    const view = await mount()
    // The feed: the one vertical scroll view (Featured's carousel scrolls sideways).
    const [list] = screen.root!.queryAll((n) => typeof n.props.onScroll === 'function' && !n.props.horizontal)
    await act(async () => fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 400 } } }))
    await shell(view, { full: true })
    expect(mark()).toBeNull()
    await act(async () => fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 0 } } }))
    expect(mark()).toBeTruthy()
  })

  it('with nothing featured, it is over the first Upcoming card', async () => {
    signIn()
    ;(getEvents as jest.Mock).mockResolvedValue({ data: [event('u1', null), event('u2', null)], error: null })
    mockFull = true
    await mount()
    expect(mark()).toBeTruthy()
    // The first row is the hole, not the section.
    expect(measuredNode?.props.children.props.title).toBe('Event u1')
  })

  it('a sheet or tray over it hides it; closed, it is back (still the one showing)', async () => {
    signIn()
    ;(getEvents as jest.Mock).mockResolvedValue({ data: [event('u1', null), event('u2', null)], error: null })
    mockFull = true
    await mount()
    expect(mark()).toBeTruthy()

    for (const open of ['open-city', 'open-filters']) {
      await act(async () => fireEvent.press(screen.getByTestId(open)))
      expect(mark()).toBeNull()
      await act(async () => fireEvent.press(screen.getByTestId('close-sheet')))
      expect(mark()).toBeTruthy()
    }

    // A failed save answers with a tray.
    await act(async () => fireEvent.press(screen.getByTestId('heart-Event u2')))
    await settle()
    expect(mockTray.at(-1)?.visible).toBe(true)
    expect(mark()).toBeNull()
    await act(async () => mockTray.at(-1)!.onClose())
    expect(mark()).toBeTruthy()
  })

  it('signed out, nothing', async () => {
    mockUser = null
    mockFull = true
    await mount()
    expect(mark()).toBeNull()
  })
})
