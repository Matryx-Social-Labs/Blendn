/**
 * Going with tickets (T-A, the Going card): the Next up card says "2 tickets" and its first action is My ticket, from the
 * phone's copy of `/me/tickets`, so it is there with no signal. Without tickets the card is unchanged.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => cb(), []),
  useScrollToTop: () => {},
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }), SafeAreaView: 'View' }))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 80 }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getUserFavorites: jest.fn(),
    getMyRsvps: jest.fn(),
    getMyAttendance: jest.fn(),
    getMyEventRating: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    getMyTickets: jest.fn(),
  },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn(), openPass: jest.fn(), useLiveEventId: () => null }))
jest.mock('../lib/paywall', () => ({ openTonight: jest.fn() }))

/* eslint-disable import/first */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import Going from '../app/(tabs)/going'
import { apiClient } from '../lib/apiClient'
import { saveTickets } from '../lib/ticketCache'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const page = { page: 1, limit: 30, totalCount: 1, hasMore: false }
const empty = { events: [], pagination: { ...page, totalCount: 0 } }
const night = {
  id: 'e1',
  title: 'Rooftop Sundowner',
  venueName: 'High Ultra Lounge',
  startTime: new Date(Date.now() + 86_400_000 * 3).toISOString(),
  endTime: new Date(Date.now() + 86_400_000 * 3 + 7_200_000).toISOString(),
  status: 'published',
  rsvpStatus: 'going',
}
const ticket = (id: string) => ({ ticketId: id, orderId: 'o1', eventId: 'e1', typeName: 'Early bird', doorCode: 'K7Q2XM', qrPayload: `${id}.m`, redeemedAt: null })

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  api.getUserFavorites.mockResolvedValue({ success: true, data: empty } as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { ...empty, lockedCount: 0 } } as never)
  api.getMyRsvps.mockResolvedValue({ success: true, data: { events: [night], pagination: page } } as never)
})
const open = async () => {
  await render(<Going />)
  await act(async () => {})
}

it('two tickets: the pill, and My ticket first, opening the pass of the order', async () => {
  api.getMyTickets.mockResolvedValue({ success: true, data: [ticket('k1'), ticket('k2')] } as never)
  await open()
  expect(await screen.findByText('2 tickets')).toBeTruthy()
  expect(screen.getByRole('button', { name: /^Rooftop Sundowner,.*2 tickets/ })).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'My ticket' }))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/ticket/[orderId]', params: { orderId: 'o1' } })
})

it('offline, the phone’s copy still puts My ticket on the card', async () => {
  await saveTickets('me', [ticket('k1')])
  api.getMyTickets.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  await open()
  expect(await screen.findByText('1 ticket')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'My ticket' })).toBeTruthy()
})

it('no tickets: the card is unchanged', async () => {
  api.getMyTickets.mockResolvedValue({ success: true, data: [] } as never)
  await open()
  await screen.findByText('Rooftop Sundowner')
  expect(screen.queryByRole('button', { name: 'My ticket' })).toBeNull()
  expect(screen.getByTestId('going-directions')).toBeTruthy()
})
