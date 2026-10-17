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
import { AppState, Linking } from 'react-native'

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const mockOpenURL = jest.fn(() => Promise.resolve())
const mockShowToast = jest.fn()
const mockGoLive = jest.fn()
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
jest.mock('../lib/apiClient', () => ({ apiClient: { getVenue: jest.fn(), goLive: jest.fn(), queuedRequest: jest.fn().mockResolvedValue({ success: false }) } }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn(), checkInChanged: jest.fn(), subscribeCheckInChanged: () => () => {} }))
jest.mock('../lib/socketClient', () => ({ subscribeToLiveEnded: (cb: never) => { mockEnded.push(cb); return () => {} } }))
const mockGoLiveOpts: { current: { showTray: (...a: unknown[]) => void; closeTray: () => void; onLive: (r: unknown) => void } | null } = { current: null }
jest.mock('../lib/useGoLive', () => ({
  useGoLive: (opts: never) => {
    mockGoLiveOpts.current = opts
    return { goLive: mockGoLive, busy: false }
  },
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
jest.mock('../lib/plus', () => ({ usePlusStatus: () => ({ status: null, refresh: jest.fn() }) }))
jest.mock('../lib/paywall', () => ({ openPaywall: jest.fn(async () => true) }))
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
import { H } from '../lib/haptics'
import { openInMaps } from '../lib/openInMaps'
import { openPaywall } from '../lib/paywall'
import { clockTime } from '../lib/roomMoments'
/* eslint-enable import/first */

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
beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
  mockEnded.length = 0
  mockAppStateCb = null
  mockLiveSession = null
  mockGoLive.mockReset().mockResolvedValue(true)
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
  })

  it('no such place is its own state', async () => {
    await mount({ success: false, error: 'Venue not found', errorCode: 'NOT_FOUND' })
    expect(screen.getByText('This place isn’t on Blend’n yet')).toBeTruthy()
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

describe('the place, not live', () => {
  it('the hero names the place, its type, area and distance; the bucket is a pill; the dock offers Go live', async () => {
    await mount()
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
    await mount(venue({ venue: { hours: { opensAt: min(-300), closesAt: min(300) }, dayResetHour: 6, capacity: 300 } }))
    expect(screen.getByLabelText(`OPEN, Till ${clockTime(NOW + 300 * 60_000)}`)).toBeTruthy()
    expect(screen.getByLabelText('RESET, 06:00')).toBeTruthy()
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
          amenities: [{ id: 'a', name: 'Rooftop' }],
          upcoming: [{ id: 'e2', title: 'Bass Thursday', startTime: min(60 * 24), goingCount: 31 }],
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

describe('the dock', () => {
  it('Go live opens the dial at 20 minutes; Stay is free today', async () => {
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-go-live'))
    })
    expect(screen.getByRole('header', { name: 'Go live at The Humming Tree' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios[0].props.accessibilityState).toMatchObject({ checked: true })
    expect(mockGoLive).not.toHaveBeenCalled()
  })

  it('choosing 45 minutes and holding goes live for 45; a yes closes the dial and says until when', async () => {
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-go-live'))
    })
    await act(async () => {
      fireEvent.press(screen.getAllByRole('radio')[1])
    })
    await act(async () => {
      fireEvent(screen.getByLabelText('Hold to go live'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } })
    })
    expect(mockGoLive).toHaveBeenCalledWith({ minutes: 45 })
    await act(async () => {
      mockGoLiveOpts.current?.onLive({ expiresAt: min(45), venueDayId: 'day-1' })
    })
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/^You're live until /), 'success')
  })

  it('a refusal comes up in a sheet once the dial has left, in the server’s words, Open Maps the strong action', async () => {
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-go-live'))
    })
    const onPress = jest.fn()
    await act(async () => {
      mockGoLiveOpts.current?.showTray('Not quite there yet', 'You’re about 1.2 km from The Humming Tree.', [
        { label: 'Done', kind: 'tertiary', onPress: jest.fn() },
        { label: 'Open Maps', kind: 'strong', onPress },
      ])
    })
    await act(async () => { jest.advanceTimersByTime(900) })
    expect(screen.getByRole('header', { name: 'Not quite there yet' })).toBeTruthy()
    expect(screen.getByText('You’re about 1.2 km from The Humming Tree.')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open Maps' }))
    })
    expect(onPress).toHaveBeenCalled()
  })

  it('with no dial open, a refusal (a one-tap Go live again that was turned away) shows at once', async () => {
    await mount()
    await act(async () => {
      mockGoLiveOpts.current?.showTray('Couldn’t go live', 'Check your connection and try again.')
    })
    expect(screen.getByRole('header', { name: 'Couldn’t go live' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('Stay is Blend’n+’s where the server gates it: the dial shows it locked, and a tap opens the paywall once the dial has left', async () => {
    const plus = require('../lib/plus')
    jest.spyOn(plus, 'usePlusStatus').mockReturnValue({ status: { active: false, gated: true }, refresh: jest.fn() })
    await mount()
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-go-live'))
    })
    await act(async () => {
      fireEvent.press(screen.getAllByRole('radio')[3])
    })
    await act(async () => { jest.advanceTimersByTime(900) })
    expect(openPaywall).toHaveBeenCalledWith('go_live_expiry', { userInitiated: true })
    expect(mockGoLive).not.toHaveBeenCalled()
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
    expect(mockGoLive).toHaveBeenCalledWith({ minutes: 45 })
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

  it('no check-in area: the server’s sentence on a disabled button, and nothing to press', async () => {
    await mount(venue({ live: { open: false, closedReason: 'no_check_in_area' } }))
    const closed = screen.getByRole('button', { name: 'You can’t go live here yet.' })
    expect(closed.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.queryByTestId('venue-go-live')).toBeNull()
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
    expect(mockGoLive).toHaveBeenCalledWith({ minutes: 45 })
  })

  it('Leave confirms: the sheet opens on "End your live time?", and End checks out; Keep going does not', async () => {
    ;(checkOutOf as jest.Mock).mockResolvedValue({ success: true })
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    expect(screen.getByRole('header', { name: 'End your live time at The Humming Tree?' })).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Keep going' }))
    })
    expect(checkOutOf).not.toHaveBeenCalled()
    // Keep going turns it back to the session; End there asks again.
    expect(screen.getByRole('header', { name: 'Live at The Humming Tree' })).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End' }))
    })
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End' }))
    })
    expect(checkOutOf).toHaveBeenCalledWith('day-1')
  })

  it('a failed End is an error toast with H.error, and the place is read again', async () => {
    ;(checkOutOf as jest.Mock).mockResolvedValue({ success: false, error: '' })
    await mount(venue({ live: liveOver() }))
    await act(async () => {
      fireEvent.press(screen.getByTestId('venue-leave'))
    })
    const reads = (apiClient.getVenue as jest.Mock).mock.calls.length
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'End' }))
    })
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't stop. Try again.", 'error')
    expect(H.error).toHaveBeenCalled()
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
  const prefs = (known: boolean, offersMuted = false) => ({ success: true, data: { known, offersMuted, ownerName: 'Indiranagar Hospitality' } })
  const claimed = venue({ venue: { claimed: true } })

  it('the offer is an itemised notice, never pre-ticked; Let know sends only that choice and becomes one row', async () => {
    request.mockImplementation((_u: string, init?: RequestInit) => Promise.resolve(init?.method === 'PUT' ? prefs(true) : prefs(false)))
    await mount(claimed)
    expect(screen.getByRole('header', { name: 'Let The Humming Tree know you’re a regular' })).toBeTruthy()
    expect(screen.getByText('Indiranagar Hospitality, who runs The Humming Tree on Blendn, will see')).toBeTruthy()
    expect(screen.getByText('your first name and how many nights you’ve been in the last 30 days')).toBeTruthy()
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
    expect(mockShowToast).toHaveBeenCalledWith('Nope', 'error')
    expect(screen.getByTestId('venue-offers-muted').props.accessibilityState).toMatchObject({ checked: false })
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
  it('shares the place as text; there is no save without a venue-save endpoint', async () => {
    const { Share } = require('react-native')
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
    await mount()
    await fireEvent.press(screen.getByLabelText('Share'))
    expect(share).toHaveBeenCalledWith({ title: 'The Humming Tree', message: 'The Humming Tree\n298, 100 Feet Road' })
    expect(screen.queryByLabelText('Save')).toBeNull()
    expect(within(screen.getByTestId('venue-hero')).queryByLabelText('Back')).toBeNull()
  })
})
