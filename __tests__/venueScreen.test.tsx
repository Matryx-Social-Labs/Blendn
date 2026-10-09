import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react-native'
import { AppState, Linking } from 'react-native'

const NOW = Date.parse('2026-10-09T20:00:00.000Z')
const mockOpenURL = jest.fn(() => Promise.resolve())
const mockEnded: Array<(d: { eventId: string; reason: string }) => void> = []
let mockAppStateCb: ((s: string) => void) | null = null

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => {
  const R = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
    useLocalSearchParams: () => ({ id: 'v1' }),
    useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]),
    useIsFocused: () => true,
  }
})
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }))
jest.mock('../components/ui/PlaceholderBanner', () => ({ PlaceholderBanner: () => null }))
jest.mock('../components/motion/ScalePress', () => ({ __esModule: true, default: require('react-native').Pressable }))
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/ActionTray', () => ({ __esModule: true, default: () => null }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getVenue: jest.fn(), goLive: jest.fn() } }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ checkOutOf: jest.fn(), checkInChanged: jest.fn(), subscribeCheckInChanged: () => () => {} }))
jest.mock('../lib/socketClient', () => ({ subscribeToLiveEnded: (cb: never) => { mockEnded.push(cb); return () => {} } }))
jest.mock('../lib/useGoLive', () => ({ useGoLive: () => ({ goLive: jest.fn(), busy: false }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import VenueScreen from '../app/venue/[id]'
import { apiClient } from '../lib/apiClient'
import { openBlendn } from '../lib/blendnOverlay'
/* eslint-enable import/first */

const venue = (over: Record<string, unknown> = {}, claim: unknown = null, claimed = false) => ({
  success: true,
  data: {
    venue: { id: 'v1', name: 'The Humming Tree', address: null, city: 'Bengaluru', latitude: 1, longitude: 2, venueTypeLabel: 'Bar', claimed },
    live: { open: true, closedReason: null, eventId: null, liveNow: 'quiet', youAreLive: true, expiresAt: new Date(NOW + 20 * 60_000).toISOString(), stay: false, venueDayId: 'day-1', chatGroupId: 'g1', ...over },
    claim,
    tonight: null,
  },
})

async function mount() {
  await render(<VenueScreen />)
  await act(async () => { await Promise.resolve() })
}
beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
  mockEnded.length = 0
  mockAppStateCb = null
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, cb: (s: string) => void) => { mockAppStateCb = cb; return { remove: () => {} } }) as never)
  jest.spyOn(Linking, 'openURL').mockImplementation(((...a: unknown[]) => mockOpenURL(...(a as []))) as never)
})
afterEach(() => jest.useRealTimers())

describe('the place screen', () => {
  it('counts down on screen, a second at a time', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue())
    await mount()
    expect(screen.getByText('LIVE · 20:00 left')).toBeTruthy()
    for (let i = 0; i < 5; i++) await act(async () => { jest.advanceTimersByTime(1_000) })
    expect(screen.getByText('LIVE · 19:55 left')).toBeTruthy()
  })

  it('re-reads the place when the app comes back to the foreground, and when the Go Live there ends', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue())
    await mount()
    const calls = (apiClient.getVenue as jest.Mock).mock.calls.length
    await act(async () => { mockAppStateCb?.('active') })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(calls + 1)
    await act(async () => { mockEnded[mockEnded.length - 1]({ eventId: 'day-1', reason: 'expired' }) })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(calls + 2)
    await act(async () => { mockEnded[mockEnded.length - 1]({ eventId: 'some-other-day', reason: 'expired' }) })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length).toBe(calls + 2)
  })

  it('"See who\'s here" leaves the place first, so the Blend\'n room opens on top (H3)', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue())
    await mount()
    await act(async () => { fireEvent.press(screen.getByLabelText("See who's here")) })
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/events')
    expect(openBlendn).toHaveBeenCalled()
    expect((router.dismissTo as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((openBlendn as jest.Mock).mock.invocationCallOrder[0])
  })

  it('opens the room with the place, so the room can go back to it ("Go live again")', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue())
    await mount()
    await act(async () => { fireEvent.press(screen.getByLabelText('Open the room')) })
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/chat/[id]', params: expect.objectContaining({ id: 'g1', venueId: 'v1', roomName: 'The Humming Tree' }) })
    )
  })

  it('says a "stay" window for a screen reader, without a countdown', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue({ stay: true }))
    await mount()
    expect(screen.getByLabelText('Live here, staying')).toBeTruthy()
  })

  it('at zero with the server still saying live, asks again every few seconds (M10)', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue({ expiresAt: new Date(NOW + 2_000).toISOString() }))
    await mount()
    const before = (apiClient.getVenue as jest.Mock).mock.calls.length
    for (let i = 0; i < 4; i++) await act(async () => { jest.advanceTimersByTime(1_000) })
    for (let i = 0; i < 3; i++) await act(async () => { jest.advanceTimersByTime(3_000) })
    expect((apiClient.getVenue as jest.Mock).mock.calls.length - before).toBeGreaterThanOrEqual(2)
  })

  it('opens the claim page exactly as the server gave it, only while unclaimed', async () => {
    const url = 'https://staging-dashboard.blendn.app/claim/venue/v1'
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue({ youAreLive: false, expiresAt: null }, { url }, false))
    await mount()
    await act(async () => { fireEvent.press(screen.getByTestId('claim-venue-link')) })
    expect(mockOpenURL).toHaveBeenCalledWith(url)
  })

  it('offers no claim link for a claimed place, whatever the payload carries; refuses a foreign host', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue({}, { url: 'https://staging-dashboard.blendn.app/claim/venue/v1' }, true))
    await mount()
    expect(screen.queryByTestId('claim-venue-link')).toBeNull()
  })

  it('refuses a claim url off blendn.app', async () => {
    ;(apiClient.getVenue as jest.Mock).mockResolvedValue(venue({}, { url: 'https://evil.example/claim/venue/v1' }, false))
    await mount()
    expect(screen.queryByTestId('claim-venue-link')).toBeNull()
  })
})
