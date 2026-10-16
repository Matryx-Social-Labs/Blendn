import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react-native'

/*
 * The clock is pinned (`jest.useFakeTimers({ now: NOW })` fakes Date too), so
 * the fixtures' 20:00Z turn never meets the wall clock. What did flake was
 * time on the CPU: the tests that walk the clock a second at a time take
 * ~0.5 s alone and 3–4 s on a loaded machine (a full parallel jest run), next
 * to jest's 5 s default — and one that timed out kept acting into the tests
 * after it. They get room.
 */
const NOW = Date.parse('2026-10-11T20:00:10.000Z')
const CLOCK_WALK_TIMEOUT_MS = 30_000

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-router', () => {
  const R = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => ({ id: 'o1' }),
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
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { queuedRequest: jest.fn() } }))
const mockTrays: Array<{ visible: boolean; buttons: { label: string; onPress: () => void }[] }> = []
jest.mock('../components/ActionTray', () => ({
  __esModule: true,
  default: (props: { visible: boolean; buttons: { label: string; onPress: () => void }[] }) => {
    mockTrays.push(props)
    return null
  },
}))

/* eslint-disable import/first */
import OfferScreen from '../app/offer/[id]'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

/**
 * The offer screen (step 12): the pass is live and is the server's code; it
 * asks again before the code turns and shows "Redeemed" when the server says
 * so; "Maybe later" sends nothing (RG-I02).
 */
const request = apiClient.queuedRequest as jest.Mock
const offer = (state: string, pass: unknown) => ({
  success: true,
  data: {
    offer: {
      id: 'o1',
      venue: { id: 'v1', name: 'The Humming Tree' },
      text: 'First drink on the house',
      sentAt: '2026-10-11T12:00:00.000Z',
      endsAt: '2026-10-18T12:00:00.000Z',
      state,
      pass,
    },
  },
})
let reads: unknown[] = []

beforeEach(async () => {
  jest.useFakeTimers({ now: NOW })
  mockTrays.length = 0
  await AsyncStorage.clear()
  reads = [offer('live', { code: 'K7Q4M2', rotatesAt: '2026-10-11T20:00:30.000Z' })]
  request.mockReset()
  request.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/regular') && init?.method === 'PUT') return Promise.resolve({ success: true, data: { known: false, offersMuted: true, ownerName: 'Indiranagar Hospitality' } })
    if (url.endsWith('/regular')) return Promise.resolve({ success: true, data: { known: false, offersMuted: false, ownerName: 'Indiranagar Hospitality' } })
    if (url.endsWith('/report')) return Promise.resolve({ success: true, data: { reported: true } })
    if (init?.method) return Promise.resolve({ success: false })
    return Promise.resolve(reads.length > 1 ? reads.shift() : reads[0])
  })
})
afterEach(() => jest.useRealTimers())

/** The clock a second at a time, each answer landing (and its effects running) before the next, as on a phone. */
async function seconds(n: number) {
  for (let i = 0; i < n; i++) await act(async () => { await jest.advanceTimersByTimeAsync(1_000) })
}

async function mount() {
  await render(<OfferScreen />)
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

it('shows the server’s code on a live pass, and turns to "Redeemed" when the server says so', async () => {
  await mount()
  expect(screen.getByText('K7Q 4M2')).toBeTruthy()
  expect(screen.getByLabelText(/Door pass for The Humming Tree\. Code K 7 Q 4 M 2/)).toBeTruthy()
  reads = [offer('redeemed', null)]
  // The code turns at :30; the screen asks a second before.
  await act(async () => { jest.advanceTimersByTime(10_000) })
  expect(screen.getByText('Redeemed. Enjoy it.')).toBeTruthy()
  expect(screen.queryByText('K7Q 4M2')).toBeNull()
})

it('"Maybe later" sends nothing; "Yes" sends known: true', async () => {
  await mount()
  await act(async () => { fireEvent.press(screen.getByText('Maybe later')) })
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  expect(screen.queryByText('Yes, let them know')).toBeNull()
})

it('a yes is one explicit PUT', async () => {
  await mount()
  await act(async () => { fireEvent.press(screen.getByText('Yes, let them know')) })
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([
    ['/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"known":true}' }, true, 2],
  ])
})

it('hides a code past its turn when no fresh one came (L2)', async () => {
  await mount()
  expect(screen.getByText('K7Q 4M2')).toBeTruthy()
  // The refresh fails: the server cannot be reached.
  request.mockImplementation(() => Promise.resolve({ success: false, error: 'offline' }))
  await act(async () => { jest.advanceTimersByTime(22_000) })
  expect(screen.queryByText('K7Q 4M2')).toBeNull()
  expect(screen.getByText('Getting a fresh code…')).toBeTruthy()
})

/*
 * Found driving it on the simulator (2026-10-11): the ask a second before the
 * turn is answered with the code that is still current — same code, same
 * rotatesAt — and nothing asked again, so the pass sat on "Getting a fresh
 * code…" for as long as the screen was open.
 */
it('keeps asking until the code has turned, when the ask before the turn returns the same code', async () => {
  const fresh = offer('live', { code: 'P3W8R5', rotatesAt: '2026-10-11T20:01:00.000Z' })
  const current = offer('live', { code: 'K7Q4M2', rotatesAt: '2026-10-11T20:00:30.000Z' })
  // The open, then the ask a second before the turn (still the current step), then the turned code.
  reads = [current, current, fresh]
  await mount()
  await seconds(25)
  expect(screen.getByText('P3W 8R5')).toBeTruthy()
  expect(screen.queryByText('Getting a fresh code…')).toBeNull()
}, CLOCK_WALK_TIMEOUT_MS)

it('a refresh that failed is tried again, and the pass comes back when the server does', async () => {
  await mount()
  request.mockImplementation(() => Promise.resolve({ success: false, error: 'offline' }))
  await seconds(22)
  expect(screen.getByText('Getting a fresh code…')).toBeTruthy()
  request.mockImplementation(() => Promise.resolve(offer('live', { code: 'P3W8R5', rotatesAt: '2026-10-11T20:01:00.000Z' })))
  await seconds(3)
  expect(screen.getByText('P3W 8R5')).toBeTruthy()
}, CLOCK_WALK_TIMEOUT_MS)

it('"Maybe later" is remembered for the place (L9)', async () => {
  await mount()
  await act(async () => { fireEvent.press(screen.getByText('Maybe later')) })
  expect(await AsyncStorage.getItem('blendn.offers.maybeLater.v1')).toBe('1')
})

it('a place someone already said "Maybe later" to does not ask again (L9)', async () => {
  await AsyncStorage.setItem('blendn.offers.maybeLater.v1', '1')
  await mount()
  expect(screen.getByText('K7Q 4M2')).toBeTruthy()
  expect(screen.queryByText('Yes, let them know')).toBeNull()
  await AsyncStorage.removeItem('blendn.offers.maybeLater.v1')
})

it('names who would see a yes (M2)', async () => {
  await mount()
  expect(screen.getByText(/Indiranagar Hospitality, who runs The Humming Tree on Blendn, will see your first name/)).toBeTruthy()
})

it('"Stop offers" beside the pass mutes the place; "Report this offer" files a report (M5, M6)', async () => {
  await mount()
  await act(async () => { fireEvent.press(screen.getByText('Stop offers from The Humming Tree')) })
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([
    ['/api/mobile/venues/v1/regular', { method: 'PUT', body: '{"offersMuted":true}' }, true, 2],
  ])
  expect(screen.queryByText('Stop offers from The Humming Tree')).toBeNull()
  await act(async () => { fireEvent.press(screen.getByText('Report this offer')) })
  const tray = mockTrays[mockTrays.length - 1]
  expect(tray.visible).toBe(true)
  await act(async () => { tray.buttons.find((b) => b.label === 'Misleading')!.onPress() })
  expect(request).toHaveBeenCalledWith('/api/mobile/offers/o1/report', { method: 'POST', body: '{"reason":"misleading"}' }, true, 2)
})

