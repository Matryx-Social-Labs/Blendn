/*
 * The place page (guidelines/places/fullpages.js `venue`, places.js `venue`,
 * Flow 11, Flow 13 · 13.4) against a mocked API: every state it draws.
 * Loading, failed, refused, the place with and without tonight's event, an
 * event that has the place, live (the pill, the ring, the dock, the session
 * sheet), Go live and Go live again, the regulars' three states, the claim,
 * and the fields the server may not send yet.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import React from 'react'
import { AppState, Dimensions, Linking, StyleSheet } from 'react-native'

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const mockOpenURL = jest.fn(() => Promise.resolve())
const mockShowToast = jest.fn()
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
let mockAppStateCb: ((s: string) => void) | null = null
let mockLiveSession: unknown = null

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => {
  const R = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
    useLocalSearchParams: () => ({ id: 'v1', km: '0.35' }),
    useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]),
    useIsFocused: () => true,
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated')
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) }
})
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null }))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }))
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getVenue: jest.fn(), getVenueUpcoming: jest.fn(), goLive: jest.fn(), queuedRequest: jest.fn().mockResolvedValue({ success: false }) } }))
const mockLive = { id: null as string | null, title: null as string | null }
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn(), useLiveEventId: () => mockLive.id, useLiveTitle: () => mockLive.title }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn(), checkInChanged: jest.fn(), subscribeCheckInChanged: () => () => {} }))
jest.mock('../lib/socketClient', () => ({ subscribeToLiveEnded: (cb: never) => { mockEnded.push(cb); return () => {} } }))
// The real useGoLive runs: only the phone's position, the network and the paywall are stood in for.
jest.mock('../lib/locationFix', () => ({ getCurrentLocation: jest.fn(async () => ({ latitude: 12.97, longitude: 77.64, accuracy: 10 })) }))
jest.mock('../lib/sheetDismissed', () => ({ ...jest.requireActual('../lib/sheetDismissed'), afterSheetDismissed: () => Promise.resolve() }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/plus', () => ({ usePlusStatus: () => ({ status: null, refresh: jest.fn() }) }))
jest.mock('../lib/paywall', () => ({ openTonight: jest.fn(async () => true) }))
const mockOpenShare = jest.fn((_target?: unknown) => Promise.resolve(true))
jest.mock('../lib/shareTray', () => ({ openShare: (t: unknown) => mockOpenShare(t) }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn(() => Promise.resolve()) }))
jest.mock('../lib/goLive', () => ({
  ...jest.requireActual('../lib/goLive'),
  readLiveSession: jest.fn(async () => mockLiveSession),
}))

/* eslint-disable import/first */
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import VenueScreen from '../app/venue/[id]'
import type { VenueDetail } from '../lib/apiClient'
import { apiClient } from '../lib/apiClient'
import { openBlendn } from '../lib/blendnOverlay'
import { checkOutOf } from '../lib/checkIn'
import { NO_AREA_REASON } from '../lib/goLive'
import { markOffline, markOnline } from '../lib/networkStatus'
import { H } from '../lib/haptics'
import { openInMaps } from '../lib/openInMaps'
import { openTonight } from '../lib/paywall'
import { clockTime } from '../lib/roomMoments'
/* eslint-enable import/first */

const wall = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`
const min = (n: number) => new Date(NOW + n * 60_000).toISOString()

type Over = { venue?: Partial<VenueDetail['venue']>; live?: Partial<VenueDetail['live']>; tonight?: VenueDetail['tonight']; claim?: unknown }
const venue = (over: Over = {}) => ({
  success: true,
  data: {
    venue: {
      id: 'v1',
      name: 'The Humming Tree',
      address: '298, 100 Feet Road',
      city: 'Bengaluru',
      latitude: 12.97,
      longitude: 77.64,
      venueType: 'live_music_venue',
      venueTypeLabel: 'Live music venue',
      claimed: false,
      ...over.venue,
    },
    live: { open: true, closedReason: null, eventId: null, liveNow: '5-9', youAreLive: false, expiresAt: null, stay: false, venueDayId: null, chatGroupId: null, ...over.live },
    claim: over.claim ?? null,
    tonight: over.tonight ?? null,
  },
})
const liveOver = (over: Partial<VenueDetail['live']> = {}) => ({ youAreLive: true, expiresAt: min(20), venueDayId: 'day-1', chatGroupId: 'g1', ...over })
const night = (startMin: number, over: Partial<NonNullable<VenueDetail['tonight']>> = {}) => ({
  id: 'e1',
  title: 'Vinyl Night',
  startTime: min(startMin),
  endTime: min(startMin + 240),
  coverImageUrl: null,
  ...over,
})

async function mount(res: unknown = venue()) {
  ;(apiClient.getVenue as jest.Mock).mockResolvedValue(res)
  await render(<VenueScreen />)
  await act(async () => {
    await Promise.resolve()
  })
}

const request = apiClient.queuedRequest as jest.Mock
const goLiveApi = apiClient.goLive as jest.Mock
beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
  mockEnded.length = 0
  mockAppStateCb = null
  mockLiveSession = null
  goLiveApi.mockReset().mockResolvedValue({
    success: true,
    data: { venueDayId: 'day-1', chatGroupId: 'g1', expiresAt: min(45), stay: false, stayUntil: null, checkIn: { id: 'c', status: 'checked_in', checkInTime: min(0) }, revealSuggestion: false, intentNeeded: false },
  })
  request.mockReset().mockResolvedValue({ success: false })
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, cb: (s: string) => void) => {
    mockAppStateCb = cb
    return { remove: () => {} }
  }) as never)
  jest.spyOn(Linking, 'openURL').mockImplementation(((...a: unknown[]) => mockOpenURL(...(a as []))) as never)
  for (const k of Object.keys(H)) jest.spyOn(H, k as keyof typeof H).mockImplementation(() => {})
})
afterEach(() => jest.useRealTimers())

describe('before it is drawn', () => {
  it('loading is the page at its real geometry, static, with Back', async () => {
    ;(apiClient.getVenue as jest.Mock).mockReturnValue(new Promise(() => {}))
    await render(<VenueScreen />)
    expect(screen.getByTestId('venue-skeleton')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Back'))
    expect(router.back).toHaveBeenCalled()
  })

  it('failing says so and Try again asks again', async () => {
    await mount({ success: false, error: 'offline' })
    expect(screen.getByText('This place didn’t load.')).toBeTruthy()
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy()
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue())
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    })
    await waitFor(() => expect(screen.getByTestId('venue-hero')).toBeTruthy())
  })

  it('a refusal no retry fixes is the server’s own sentence, with no Try again', async () => {
    await mount({ success: false, error: 'Finish setting up before you go live.', errorCode: 'FORBIDDEN' })
    expect(screen.getByText('Not yet')).toBeTruthy()
    expect(screen.getByText('Finish setting up before you go live.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Finish setting up' }))
    })
    expect(router.push).toHaveBeenLastCalledWith('/edit-profile')
  })

  it('no such place is its own state', async () => {
    await mount({ success: false, error: 'Venue not found', errorCode: 'NOT_FOUND' })
    expect(screen.getByText('This place isn’t on Blend’n any more')).toBeTruthy()
    expect(screen.getByText('Your nights here stay in your history.')).toBeTruthy()
  })

  it('an older read that answers last does not undo a newer one (H2)', async () => {
    let releaseOld: (v: unknown) => void = () => {}
    ;(apiClient.getVenue as jest.Mock)
      .mockReturnValueOnce(new Promise((r) => { releaseOld = r }))
      .mockResolvedValue(venue())
    await render(<VenueScreen />)
    await act(async () => { mockAppStateCb?.('active') })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByTestId('venue-live-pill')).toBeNull()
    await act(async () => { releaseOld(venue({ live: liveOver() })) })
    expect(screen.queryByTestId('venue-live-pill')).toBeNull()
  })
})

describe('offline (OUT-06)', () => {
  it('says it is offline over the place it still shows, and nothing while online', async () => {
    await mount()
    expect(screen.queryByTestId('venue-offline')).toBeNull()
    await act(async () => markOffline())
    expect(screen.getByTestId('venue-offline')).toBeTruthy()
    expect(screen.getByText('Offline. Showing what you had.')).toBeTruthy()
    expect(screen.getByRole('header', { name: /The Humming Tree/ })).toBeTruthy()
    await act(async () => markOnline())
    expect(screen.queryByTestId('venue-offline')).toBeNull()
  })
})

describe('the place, not live', () => {
  it('the hero names the place, its type, area and distance; the bucket is a pill; the dock offers Go live', async () => {
    // At an ordinary text size: at the accessibility sizes the address leaves the hero (GO-05). Jest's window is at 2.
    const window = Dimensions.get('window')
    Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...window, fontScale: 1 } })
    await mount()
    Dimensions.set({ window, screen: window })
    expect(screen.getByRole('header', { name: 'The Humming Tree, Live music venue · 298, 100 Feet Road, 350 m' })).toBeTruthy()
    expect(screen.getByText('5–9 live')).toBeTruthy()
    expect(screen.queryByTestId('venue-you-live')).toBeNull()
    expect(screen.getByRole('button', { name: 'Go live' })).toBeTruthy()
  })

  it('draws the tiles the server sent, and only those', async () => {
    await mount()
    expect(screen.getByLabelText('LIVE, 5–9 so far')).toBeTruthy()
    expect(screen.queryByLabelText(/^OPEN/)).toBeNull()
    expect(screen.queryByLabelText(/^SIZE/)).toBeNull()
    await mount(venue({ venue: { hours: [{ day: new Date(NOW - 6 * 3_600_000).getDay(), open: wall(NOW - 2 * 3_600_000), close: wall(NOW + 4 * 3_600_000) }], dayResetHour: 6, capacity: 300 } }))
    expect(screen.getByLabelText(`OPEN, Till ${clockTime(NOW + 4 * 3_600_000)}`)).toBeTruthy()
    expect(screen.queryByLabelText(/^RESET/)).toBeNull()
    expect(screen.getByLabelText('SIZE, 300 people')).toBeTruthy()
  })

  it('a viewer the server tells nothing sees no live pill and no live tile', async () => {
    await mount(venue({ live: { liveNow: null } }))
    expect(screen.queryByTestId('venue-bucket')).toBeNull()
    expect(screen.queryByLabelText(/^LIVE,/)).toBeNull()
  })

  it('with no event tonight, one sentence about going live; Who’s here is locked until you are', async () => {
    await mount()
    expect(screen.getByText('No event tonight. When you’re here, go live and see who else is.')).toBeTruthy()
    expect(screen.getByText('Go live here to see who else is. Everyone is a creature until they choose otherwise.')).toBeTruthy()
    expect(screen.queryByTestId('venue-see-who')).toBeNull()
  })

  it('with an event later tonight, its card opens it, and the Board row opens that event’s board', async () => {
    await mount(venue({ tonight: night(120) }))
    await fireEvent.press(screen.getByTestId('venue-tonight'))
    expect(router.push).toHaveBeenLastCalledWith('/event/e1')
    await fireEvent.press(screen.getByTestId('venue-board'))
    expect(router.push).toHaveBeenLastCalledWith('/board/e1')
  })

  it('once the doors are open there is no Board row; a venue with no event has none either', async () => {
    await mount(venue({ tonight: night(-30) }))
    expect(screen.queryByTestId('venue-board')).toBeNull()
  })

  it('shows About, Good to know and Coming up when the server sends them, and none of them when it does not', async () => {
    await mount()
    expect(screen.queryByText('About')).toBeNull()
    expect(screen.queryByText('Good to know')).toBeNull()
    expect(screen.queryByText('Coming up here')).toBeNull()
    await mount(
      venue({
        venue: {
          description: 'Bengaluru’s first microbrewery.',
          amenities: ['Rooftop'],
          upcoming: [{ id: 'e2', title: 'Bass Thursday', slug: null, coverImageUrl: null, startTime: min(60 * 24), endTime: min(60 * 27) }],
        },
      })
    )
    expect(screen.getByText('Bengaluru’s first microbrewery.')).toBeTruthy()
    expect(screen.getByLabelText('GOOD TO KNOW, Rooftop')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('venue-upcoming-e2'))
    expect(router.push).toHaveBeenLastCalledWith('/event/e2')
  })

  it('Where: directions open Maps, the address copies', async () => {
    await mount()
    await fireEvent.press(screen.getByTestId('venue-directions'))
    expect(openInMaps).toHaveBeenCalledWith(expect.objectContaining({ address: '298, 100 Feet Road', venue_name: 'The Humming Tree' }))
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy address'))
    })
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('298, 100 Feet Road')
    expect(mockShowToast).toHaveBeenCalledWith('Address copied', 'info')
  })
})

describe('the bar under the status bar', () => {
  const scrollTo = (y: number) => fireEvent.scroll(screen.getByTestId('venue-scroll'), { nativeEvent: { contentOffset: { y }, contentSize: { height: 2000, width: 390 }, layoutMeasurement: { height: 800, width: 390 } } })

  it('is nothing over the hero and the bar’s glass once the rows reach it, never an ink band', async () => {
    await mount()
    expect(screen.queryByTestId('venue-status-shield')).toBeNull()
    await scrollTo(2000)
    const shield = screen.getByTestId('venue-status-shield')
    expect(StyleSheet.flatten(shield.props.style).backgroundColor).toBeUndefined()
    expect(within(shield).getByTestId('venue-status-material')).toBeTruthy()
    await scrollTo(0)
    expect(screen.queryByTestId('venue-status-shield')).toBeNull()
  })
})

describe('Coming up here', () => {
  it('sets the date on one line, as wide as it needs and no narrower than the column', async () => {
    await mount(venue({ venue: { upcoming: [{ id: 'u1', title: 'Night 1', startTime: min(60 * 24) }] } }))
    const row = screen.getByTestId('venue-upcoming-u1')
    const day = within(row).getAllByText(/\d/)[0]
    expect(day.props.numberOfLines).toBe(1)
    const style = StyleSheet.flatten(day.props.style)
    expect(style.width).toBeUndefined()
    expect(style).toMatchObject({ minWidth: 84, flexShrink: 0 })
  })

  it('a row says when and that it opens (GO-13, C36): the start time and a chevron; the title may take two lines', async () => {
    const start = min(60 * 24)
    await mount(venue({ venue: { upcoming: [{ id: 'u1', title: 'A very long night of music and talk', startTime: start }] } }))
    const row = screen.getByTestId('venue-upcoming-u1')
    expect(within(row).getByText(clockTime(Date.parse(start)))).toBeTruthy()
    expect(within(row).getByTestId('venue-upcoming-chevron', { includeHiddenElements: true })).toBeTruthy()
    expect(within(row).getByText('A very long night of music and talk').props.numberOfLines).toBe(2)
    expect(row.props.accessibilityLabel).toContain(clockTime(Date.parse(start)))
  })
})

describe('the Where card’s map', () => {
  it('pads top and bottom by the pill’s reach, so the map’s credit clears "Open in Maps" and the pin stays centred', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../components/venue/VenueMap.tsx'), 'utf8') as string
    expect(src).toContain('mapPadding={MAP_PADDING}')
    expect(src).toMatch(/MAP_PADDING = \{ top: CREDIT_CLEAR, bottom: CREDIT_CLEAR/)
  })
})

describe('the page, the design’s details', () => {
  const nights = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ id: `u${from + i}`, title: `Night ${from + i}`, startTime: min(60 * 24 * (from + i)) }))

  it('Coming up here shows three of the first few, counts them all in the heading, and opens the rest from See all', async () => {
    ;(apiClient.getVenueUpcoming as jest.Mock).mockResolvedValue({
      success: true,
      data: { events: nights(2, 6), pagination: { limit: 20, hasMore: false, nextCursor: null, totalCount: 7 } },
    })
    await mount(venue({ venue: { upcoming: nights(5), upcomingTotal: 7, upcomingNextCursor: 'c1' } }))
    expect(screen.queryByTestId('venue-upcoming-u4')).toBeNull()
    expect(screen.getByRole('header', { name: 'Coming up here, 7' })).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'See all' }))
    })
    await act(async () => { await Promise.resolve() })
    // The sheet has the page's five and fetches the rest from where the page stopped.
    expect(apiClient.getVenueUpcoming).toHaveBeenCalledWith('v1', 'c1', 20)
    expect(screen.getByTestId('venue-upcoming-all-u4')).toBeTruthy()
    expect(screen.getByTestId('venue-upcoming-all-u7')).toBeTruthy()
    expect(screen.queryByTestId('venue-upcoming-more')).toBeNull()
  })

  it('See all when there are more than three, with or without a total', async () => {
    await mount(venue({ venue: { upcoming: nights(4) } }))
    expect(screen.getByRole('button', { name: 'See all' })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Coming up here, 4' })).toBeTruthy()
  })

  it('three or fewer have no See all', async () => {
    await mount(venue({ venue: { upcoming: nights(1), upcomingTotal: 1, upcomingNextCursor: null } }))
    expect(screen.queryByRole('button', { name: 'See all' })).toBeNull()
  })

  it('the Where card’s distance is Geist Mono, after the city', async () => {
    await mount()
    const distances = screen.getAllByText('350 m', { includeHiddenElements: true })
    expect(distances.length).toBeGreaterThanOrEqual(2)
    for (const d of distances) expect(JSON.stringify(d.props.style)).toMatch(/Geist/i)
  })

  it('the Where card names the city once: not again under an address that already has it (r7 L4)', async () => {
    await mount(venue({ venue: { address: 'Level 1, 1 MG Road Mall, MG Road, Bengaluru 560001' } }))
    expect(screen.queryAllByText(/^Bengaluru/, { includeHiddenElements: true })).toHaveLength(0)
    await mount()
    expect(screen.getAllByText(/Bengaluru/, { includeHiddenElements: true }).length).toBeGreaterThan(0)
  })

  it('the dock’s pill in the last five minutes reads Ending, then Extend', async () => {
    await mount(venue({ live: liveOver({ expiresAt: new Date(NOW + 4 * 60_000 + 59_000).toISOString() }) }))
    const chips = screen.getAllByText(/^(Ending|Extend)$/, { includeHiddenElements: true }).map((t) => t.props.children)
    expect(chips).toEqual(['Ending', 'Extend'])
  })
})

describe('the dock', () => {
  it('Go live opens the dial at 20 minutes; Stay is free today', async () => {
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-go-live'))
    })
    expect(screen.getByRole('header', { name: 'Go live at The Humming Tree' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios[0].props.accessibilityState).toMatchObject({ checked: true })
    expect(goLiveApi).not.toHaveBeenCalled()
  })

  // SCRUM-635: going live here while checked in at an event left it without a word.
  it('checked in somewhere else, the dial names the room going live here leaves', async () => {
    mockLive.id = 'evt-elsewhere'
    mockLive.title = 'Vinyl Night'
    try {
      await mount()
      await act(async () => {
        fireEvent.press(screen.getByTestId('venue-go-live'))
      })
      expect(screen.getByText('Leaves Vinyl Night. You can end it anytime.')).toBeTruthy()
    } finally {
      mockLive.id = null
      mockLive.title = null
    }
  })

  const settle = () => act(async () => { jest.advanceTimersByTime(1000) })
  const hold = async () => {
    await act(async () => {
      fireEvent(screen.getByLabelText('Hold to go live'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
    })
  }
  const openDial = async (radio = 0) => {
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-go-live'))
    })
    if (radio) {
      await act(async () => {
        fireEvent.press(screen.getAllByRole('radio')[radio])
      })
    }
  }

  it('choosing 45 minutes and holding asks the server for 45 from where the phone is; a yes closes the dial and says until when, in 24-hour time', async () => {
    await mount()
    await openDial(1)
    await hold()
    expect(goLiveApi).toHaveBeenCalledWith('v1', expect.objectContaining({ minutes: 45, latitude: 12.97, longitude: 77.64 }))
    await settle()
    expect(screen.queryByRole('header', { name: 'Go live at The Humming Tree' })).toBeNull()
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/^You’re live until \d\d:\d\d$/), 'success')
  })

  it('a stay names no end in its toast: it rolls', async () => {
    goLiveApi.mockResolvedValue({ success: true, data: { venueDayId: 'day-1', chatGroupId: 'g1', expiresAt: min(20), stay: true, stayUntil: null } })
    await mount()
    await openDial(3)
    await hold()
    expect(goLiveApi).toHaveBeenCalledWith('v1', expect.objectContaining({ stay: true }))
    expect(mockShowToast).toHaveBeenCalledWith('You’re live for as long as you’re here', 'success')
  })

  describe('a refusal is the Go Live sheet’s own, in place of the dial, in the server’s words, with no haptic', () => {
    it('too far: “Not here yet” with the server’s sentence; Open Maps opens Maps', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'OUT_OF_RANGE', error: 'You’re not at The Humming Tree yet.' })
      await mount()
      await openDial()
      await hold()
      expect(screen.getByRole('header', { name: 'Not here yet' })).toBeTruthy()
      expect(screen.getByText('You’re not at The Humming Tree yet. Go live once you’re inside.')).toBeTruthy()
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      // The hold's own cues are the hold's; the answer is silent (R4 11-1).
      for (const k of ['error', 'success', 'threshold', 'destructive'] as const) expect(H[k]).not.toHaveBeenCalled()
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Open Maps' }))
      })
      expect(openInMaps).toHaveBeenCalledWith(expect.objectContaining({ venue_name: 'The Humming Tree' }))
    })

    it('a weak fix: Try again asks for the same window once more', async () => {
      goLiveApi.mockResolvedValueOnce({ success: false, errorCode: 'GPS_TOO_VAGUE', error: 'GPS signal is too weak (accuracy: 400m).' })
      await mount()
      await openDial(2)
      await hold()
      expect(screen.getByRole('header', { name: 'GPS signal too weak' })).toBeTruthy()
      expect(screen.getByText('GPS signal is too weak (accuracy: 400m).')).toBeTruthy()
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      })
      expect(goLiveApi).toHaveBeenCalledTimes(2)
      expect(goLiveApi).toHaveBeenLastCalledWith('v1', expect.objectContaining({ minutes: 60 }))
    })

    it('no answer at all (a timeout) is “Couldn’t go live”, and the places that read the window are told it may have landed', async () => {
      goLiveApi.mockResolvedValueOnce({ success: false, error: 'Request timed out' })
      await mount()
      await openDial()
      await hold()
      expect(screen.getByRole('header', { name: 'Couldn’t go live' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    })

    it('too many tries says how long to wait; its way on is a verb, never OK', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many requests', retryAfter: 90 })
      await mount()
      await openDial()
      await hold()
      expect(screen.getByRole('header', { name: 'Too many tries' })).toBeTruthy()
      expect(screen.getByText('Try again in 2 minutes.')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'OK' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    })

    it('an event has the place: the sheet hands off to its check-in', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'EVENT_LIVE_HERE', error: 'An event is on.', eventId: 'e1' })
      await mount(venue({ tonight: night(30) }))
      await openDial()
      await hold()
      expect(screen.getByRole('header', { name: 'Vinyl Night is on here' })).toBeTruthy()
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Check in to Vinyl Night' }))
      })
      expect(router.push).toHaveBeenLastCalledWith('/event/e1')
    })

    it('not an adult yet / not onboarded: Finish setting up', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'AGE_RESTRICTED', error: 'Adults only.' })
      await mount()
      await openDial()
      await hold()
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Finish setting up' }))
      })
      expect(router.push).toHaveBeenLastCalledWith('/edit-profile')
    })

    it('no check-in area: the design’s sentence, and nothing to do but Close', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'NO_CHECK_IN_AREA', error: 'This place has no check-in area yet.' })
      await mount()
      await openDial()
      await hold()
      expect(screen.getByText(/You can’t go live here yet\./)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'OK' })).toBeNull()
    })

    it('a one-tap Go live again that is turned away opens the sheet on the refusal', async () => {
      mockLiveSession = { userId: 'u1', venueDayId: 'd', venueId: 'v1', venueName: 'The Humming Tree', prompted: true, choice: { minutes: 45 }, dayEndsAt: min(600) }
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'OUT_OF_RANGE', error: 'You’re not at The Humming Tree yet.' })
      await mount()
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Go live again · 45 minutes' }))
      })
      expect(screen.getByRole('header', { name: 'Not here yet' })).toBeTruthy()
      // Pick another time starts from the dial, not from the refusal.
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Close' }))
      })
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Pick another time' }))
      })
      expect(screen.queryAllByRole('radio').length).toBe(4)
    })

    it('“Staying live is part of Blend’n+” when the paywall may not open: Pick a time goes back to the dial, See Blend’n+ opens the Tonight sheet', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'PLUS_REQUIRED', error: 'Staying live is part of Blendn+.' })
      ;(openTonight as jest.Mock).mockResolvedValue(false)
      await mount()
      await openDial(3)
      await hold()
      await act(async () => { jest.advanceTimersByTime(900) })
      expect(screen.getByRole('header', { name: 'Staying live is part of Blend’n+' })).toBeTruthy()
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Pick a time' }))
      })
      expect(screen.getAllByRole('radio')).toHaveLength(4)
      expect(screen.getAllByRole('radio')[0].props.accessibilityState).toMatchObject({ checked: true })
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'PLUS_REQUIRED', error: 'x' })
      await openDialAgainStay()
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'See Blend’n+' }))
      })
      await act(async () => { jest.advanceTimersByTime(900) })
      expect(openTonight).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: 'stay', venue: 'The Humming Tree' }), { userInitiated: true })
    })

    const openDialAgainStay = async () => {
      await act(async () => {
        fireEvent.press(screen.getAllByRole('radio')[3])
      })
      await hold()
      await act(async () => { jest.advanceTimersByTime(900) })
    }

    it('the generic tray is not used for any of them', async () => {
      goLiveApi.mockResolvedValue({ success: false, errorCode: 'OUT_OF_RANGE', error: 'x' })
      await mount()
      await openDial()
      await hold()
      expect(screen.queryByTestId('venue-tray')).toBeNull()
    })
  })

  it('Stay is Blend’n+’s where the server gates it: the dial shows it locked, and a tap opens the Tonight sheet once the dial has left', async () => {
    const plus = require('../lib/plus')
    jest.spyOn(plus, 'usePlusStatus').mockReturnValue({ status: { active: false, gated: true }, refresh: jest.fn() })
    ;(openTonight as jest.Mock).mockResolvedValue(true)
    await mount()
    await openDial(3)
    await act(async () => { jest.advanceTimersByTime(900) })
    expect(openTonight).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'stay', venue: 'The Humming Tree', onFree: expect.any(Function), onUnlocked: expect.any(Function) }), { userInitiated: true })
    expect(goLiveApi).not.toHaveBeenCalled()
  })

  // SCRUM-635 drive: the one-tap Go live again took somebody checked in at an event out of it without a word.
  it('checked in somewhere else, Go live again opens the dial and its warning instead of going live in one tap', async () => {
    mockLiveSession = { userId: 'u1', venueDayId: 'd', venueId: 'v1', venueName: 'The Humming Tree', prompted: true, choice: { minutes: 45 }, dayEndsAt: min(600) }
    mockLive.id = 'evt-elsewhere'
    mockLive.title = 'Vinyl Night'
    try {
      await mount()
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Go live again · 45 minutes' }))
      })
      expect(goLiveApi).not.toHaveBeenCalled()
      expect(screen.getByText('Leaves Vinyl Night. You can end it anytime.')).toBeTruthy()
    } finally {
      mockLive.id = null
      mockLive.title = null
    }
  })

  it('after a window ends, Go live again repeats it in one tap, with Pick another time under it (PL-M05)', async () => {
    mockLiveSession = { userId: 'u1', venueDayId: 'd', venueId: 'v1', venueName: 'The Humming Tree', prompted: true, choice: { minutes: 45 }, dayEndsAt: min(600) }
    await mount()
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Go live again · 45 minutes' }))
    })
    expect(goLiveApi).toHaveBeenCalledWith('v1', expect.objectContaining({ minutes: 45 }))
    expect(screen.queryByRole('header', { name: 'Go live at The Humming Tree' })).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Pick another time' }))
    })
    const radios = screen.getAllByRole('radio')
    expect(radios[1].props.accessibilityState).toMatchObject({ checked: true })
  })

  it('an event has the place: the venue defers, its card is the way in, and there is no Go live', async () => {
    await mount(venue({ live: { open: false, closedReason: 'event_live_here', eventId: 'e1' }, tonight: night(-10) }))
    expect(screen.queryByTestId('venue-go-live')).toBeNull()
    expect(screen.getByText('ON HERE TONIGHT')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Check in to Vinyl Night instead' }))
    expect(router.push).toHaveBeenLastCalledWith('/event/e1')
    // The page defers: the event is not drawn twice.
    expect(screen.queryByText('Tonight here')).toBeNull()
  })

  it('no check-in area (GO-06, audit C8): a sentence and its reason, never a disabled slab or a dead gradient', async () => {
    await mount(venue({ live: { open: false, closedReason: 'no_check_in_area' } }))
    expect(screen.getByText('You can’t go live here yet.')).toBeTruthy()
    expect(screen.getByText(NO_AREA_REASON)).toBeTruthy()
    expect(screen.getByLabelText(`You can’t go live here yet. ${NO_AREA_REASON}`)).toBeTruthy()
    expect(screen.queryByTestId('venue-go-live')).toBeNull()
    expect(within(screen.getByTestId('venue-dock')).queryAllByRole('button')).toHaveLength(0)
  })
})

describe('live', () => {
  it('the hero says you are live and the clock steps once a minute; the pill carries it in the dock', async () => {
    await mount(venue({ live: liveOver() }))
    expect(screen.getByLabelText('You’re live, 20 min')).toBeTruthy()
    expect(screen.getByLabelText('Live at The Humming Tree, 20 minutes left')).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(screen.getByLabelText('You’re live, 19 min')).toBeTruthy()
    expect(screen.getByLabelText('Live at The Humming Tree, 19 minutes left')).toBeTruthy()
  })

  it('a stay window says staying, with no countdown', async () => {
    await mount(venue({ live: liveOver({ stay: true }) }))
    expect(screen.getByLabelText('You’re live, staying')).toBeTruthy()
  })

  it('the last five minutes: seconds, and an Extend chip beside Ending', async () => {
    await mount(venue({ live: liveOver({ expiresAt: new Date(NOW + 4 * 60_000 + 59_000).toISOString() }) }))
    expect(screen.getByLabelText('Live at The Humming Tree, 4:59 left, ending soon')).toBeTruthy()
    expect(screen.getByText('Extend', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Ending', { includeHiddenElements: true })).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(1_000) })
    expect(screen.getByLabelText('Live at The Humming Tree, 4:58 left, ending soon')).toBeTruthy()
  })

  it('the pill opens the session sheet; in the last five minutes it offers Extend, named with the new end', async () => {
    await mount(venue({ live: liveOver({ expiresAt: new Date(NOW + 4 * 60_000 + 59_000).toISOString() }) }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-live-pill'))
    })
    expect(H.primary).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('header', { name: 'Live at The Humming Tree' })).toBeTruthy()
    const extend = screen.getByRole('button', { name: /^Extend · Live until \d\d:\d\d$/ })
    await act(async () => {
      fireEvent.press(extend)
    })
    expect(goLiveApi).toHaveBeenCalledWith('v1', expect.objectContaining({ minutes: 45 }))
  })

  it('the pill’s sheet: End confirms in the same sheet and Keep going goes back to the session', async () => {
    ;(checkOutOf as jest.Mock).mockResolvedValue({ success: true })
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-live-pill'))
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End' }))
    })
    expect(screen.getByRole('header', { name: 'End your live time at The Humming Tree?' })).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Keep going' }))
    })
    expect(checkOutOf).not.toHaveBeenCalled()
    expect(screen.getByRole('header', { name: 'Live at The Humming Tree' })).toBeTruthy()
  })

  it('Leave is R12’s “Stop being live at ‹place›?”: Stay, or a swipe, closes the sheet; Stop checks out', async () => {
    ;(checkOutOf as jest.Mock).mockResolvedValue({ success: true })
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    expect(screen.getByRole('header', { name: 'Stop being live at The Humming Tree?' })).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stay' }))
    })
    await act(async () => { jest.advanceTimersByTime(1000) })
    expect(screen.queryByRole('header', { name: /Stop being live|Live at The Humming Tree/ })).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }))
    })
    await act(async () => { jest.advanceTimersByTime(1000) })
    expect(screen.queryByRole('header', { name: /Stop being live|Live at The Humming Tree/ })).toBeNull()
    expect(checkOutOf).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    })
    expect(checkOutOf).toHaveBeenCalledWith('day-1')
  })

  it('Stopping… is the button’s word while the check-out is on the wire', async () => {
    let release: (v: unknown) => void = () => {}
    ;(checkOutOf as jest.Mock).mockReturnValue(new Promise((r) => { release = r }))
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    })
    expect(screen.getByRole('button', { name: 'Stopping…' })).toBeTruthy()
    await act(async () => { release({ success: true }) })
  })

  it('live with no clock (no expiry, not a stay) still shows the pill, and Leave still opens the confirm', async () => {
    await mount(venue({ live: liveOver({ expiresAt: null }) }))
    expect(screen.getByLabelText('Live at The Humming Tree')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    expect(screen.getByRole('header', { name: 'Stop being live at The Humming Tree?' })).toBeTruthy()
  })

  it('a failed End is an error toast, and the place is read again', async () => {
    ;(checkOutOf as jest.Mock).mockResolvedValue({ success: false, error: '' })
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    const reads = (apiClient.getVenue as jest.Mock).mock.calls.length
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stop' }))
    })
    expect(mockShowToast).toHaveBeenCalledWith("Couldn’t stop. Try again.", 'error', { haptic: 'error' })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(reads + 1)
  })

  it('opens the room with the place, so the room can go back to it ("Go live again")', async () => {
    await mount(venue({ live: liveOver() }))
    await fireEvent.press(screen.getByRole('button', { name: 'Open the room' }))
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/chat/[id]', params: expect.objectContaining({ id: 'g1', venueId: 'v1', roomName: 'The Humming Tree' }) })
    )
  })

  it('"See who’s here" leaves the place first, so the Blend’n room opens on top (H3)', async () => {
    await mount(venue({ live: liveOver() }))
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'See who’s here' })) })
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/events')
    expect(openBlendn).toHaveBeenCalled()
    expect((router.dismissTo as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((openBlendn as jest.Mock).mock.invocationCallOrder[0])
  })

  it('live replaces the tiles with the card whose ring reads the time left', async () => {
    await mount(venue({ live: liveOver() }))
    expect(screen.getByTestId('venue-live-card')).toBeTruthy()
    expect(screen.getByText('You’re live at The Humming Tree')).toBeTruthy()
    expect(screen.queryByTestId('venue-tiles')).toBeNull()
  })

  it('re-reads the place when the app comes back, and when the Go Live there ends', async () => {
    await mount(venue({ live: liveOver() }))
    const calls = (apiClient.getVenue as jest.Mock).mock.calls.length
    await act(async () => { mockAppStateCb?.('active') })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(calls + 1)
    await act(async () => { mockEnded[mockEnded.length - 1]({ eventId: 'day-1', reason: 'expired' }) })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(calls + 2)
    await act(async () => { mockEnded[mockEnded.length - 1]({ eventId: 'some-other-day', reason: 'expired' }) })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(calls + 2)
  })

  it('at zero with the server still saying live, asks again every few seconds (M10)', async () => {
    await mount(venue({ live: liveOver({ expiresAt: new Date(NOW + 2_000).toISOString() }) }))
    const before = (apiClient.getVenue as jest.Mock).mock.calls.length
    for (let i = 0; i < 4; i++) await act(async () => { jest.advanceTimersByTime(1_000) })
    for (let i = 0; i < 3; i++) await act(async () => { jest.advanceTimersByTime(3_000) })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length - before).toBeGreaterThanOrEqual(2)
  })

  it('the window ending closes the session sheet, and Go live is back', async () => {
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-live-pill'))
    })
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue())
    await act(async () => { mockAppStateCb?.('active') })
    await waitFor(() => expect(screen.queryByRole('header', { name: 'Live at The Humming Tree' })).toBeNull())
    expect(screen.getByTestId('venue-go-live')).toBeTruthy()
  })
})

describe('regulars (Flow 13 · 13.4)', () => {
  const prefs = (known: boolean, offersMuted = false, regulars: unknown = { active: true }) => ({ success: true, data: { known, offersMuted, ownerName: 'Indiranagar Hospitality', regulars } })
  const claimed = venue({ venue: { claimed: true } })

  it('the offer is an itemised notice, never pre-ticked; Let know sends only that choice and becomes one row', async () => {
    request.mockImplementation((_u: string, init?: RequestInit) => Promise.resolve(init?.method === 'PUT' ? prefs(true) : prefs(false)))
    await mount(claimed)
    expect(screen.getByRole('header', { name: 'Let The Humming Tree know you’re a regular' })).toBeTruthy()
    expect(screen.getByText('Indiranagar Hospitality, who runs The Humming Tree on Blendn, will see')).toBeTruthy()
    expect(screen.getByText('that a regular was here, and how many nights in the last 30 days')).toBeTruthy()
    expect(screen.getByText('who you are, your chats, who you met, or anywhere else you go')).toBeTruthy()
    expect(screen.queryByText(/first name/i)).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Let The Humming Tree know I’m a regular' }))
    })
    expect(request).toHaveBeenLastCalledWith('/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":true}' }, true, 2)
    expect(screen.getByText('The Humming Tree knows you’re a regular')).toBeTruthy()
  })

  it('Turn off is one tap with no sheet; the Done line stays for this visit', async () => {
    request.mockImplementation((_u: string, init?: RequestInit) => Promise.resolve(init?.method === 'PUT' ? prefs(false) : prefs(true)))
    await mount(claimed)
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-regular-off'))
    })
    expect(request).toHaveBeenLastCalledWith('/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":false}' }, true, 2)
    expect(screen.getByTestId('venue-regular-done')).toBeTruthy()
    expect(screen.queryByRole('header', { name: /know you’re a regular/ })).toBeNull()
  })

  it('Not now sends nothing and hides the offer for this visit', async () => {
    request.mockResolvedValue(prefs(false))
    await mount(claimed)
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-regular-later'))
    })
    expect(request.mock.calls.every(([, init]) => !init)).toBe(true)
    expect(screen.queryByTestId('venue-regular-yes')).toBeNull()
  })

  it('"No offers from" shows what the server saved; a refusal is an error toast', async () => {
    request.mockImplementation((_u: string, init?: RequestInit) => Promise.resolve(init?.method === 'PUT' ? { success: false, error: 'Nope' } : prefs(false)))
    await mount(claimed)
    const row = screen.getByTestId('venue-offers-muted')
    expect(row.props.accessibilityState).toMatchObject({ checked: false })
    await act(async () => {
      fireEvent.press(row)
    })
    expect(request).toHaveBeenLastCalledWith('/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"offersMuted":true}' }, true, 2)
    expect(mockShowToast).toHaveBeenCalledWith('Nope', 'error', { haptic: 'error' })
    expect(screen.getByTestId('venue-offers-muted').props.accessibilityState).toMatchObject({ checked: false })
  })

  it('deferred: no flag, a false flag or a missing regulars object means no regulars UI at all; true shows it', async () => {
    for (const regulars of [null, {}, { active: false }, { active: 'yes' }]) {
      request.mockResolvedValue(prefs(true, false, regulars))
      await mount(claimed)
      expect(screen.queryByTestId('venue-regulars')).toBeNull()
      expect(screen.queryByTestId('venue-regular-on')).toBeNull()
      expect(screen.queryByTestId('venue-offers-muted')).toBeNull()
      expect(screen.queryByRole('header', { name: /know you’re a regular/ })).toBeNull()
    }
    request.mockResolvedValue(prefs(false, false, { active: true }))
    await mount(claimed)
    expect(screen.getByTestId('venue-regulars')).toBeTruthy()
  })

  it('an unclaimed place has nobody to tell: no regulars at all', async () => {
    request.mockResolvedValue(prefs(false))
    await mount(venue())
    expect(screen.queryByTestId('venue-regulars')).toBeNull()
  })
})

describe('claiming', () => {
  const url = 'https://staging-dashboard.blendn.app/claim/venue/v1'

  it('the last line, only while unclaimed; a sheet says it leaves the app and promises nothing, then opens the page as the server gave it', async () => {
    await mount(venue({ claim: { url } }))
    await fireEvent.press(screen.getByTestId('claim-venue-link'))
    expect(screen.getByRole('header', { name: 'Own this place?' })).toBeTruthy()
    expect(screen.getByText(/filing one grants nothing yet/)).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open blendn.app' }))
    })
    expect(mockOpenURL).toHaveBeenCalledWith(url)
  })

  it('offers no claim line for a claimed place, whatever the payload carries; refuses a foreign host', async () => {
    await mount(venue({ venue: { claimed: true }, claim: { url } }))
    expect(screen.queryByTestId('claim-venue-link')).toBeNull()
    await mount(venue({ claim: { url: 'https://evil.example/claim/venue/v1' } }))
    expect(screen.queryByTestId('claim-venue-link')).toBeNull()
  })
})

describe('the hero', () => {
  it('opens the share tray with the venue card and the front-page link (SCRUM-738); there is no save without a venue-save endpoint', async () => {
    await mount()
    await fireEvent.press(screen.getByLabelText('Share'))
    expect(mockOpenShare).toHaveBeenCalledWith({
      kind: 'venue',
      name: 'The Humming Tree',
      typeLabel: expect.any(String),
      area: expect.any(String),
      url: 'https://www.blendn.app',
    })
    expect(screen.queryByLabelText('Save')).toBeNull()
    expect(within(screen.getByTestId('venue-hero')).queryByLabelText('Back')).toBeNull()
  })
})
