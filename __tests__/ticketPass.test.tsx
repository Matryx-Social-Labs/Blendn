/**
 * The ticket (T-A, contract §6): one page per ticket, a large QR of `qrPayload`, the door code in two groups, "Works offline",
 * drawn from the phone's copy first and refreshed from the server; with no connection the copy is still the pass, said so.
 */
import { act, render, screen } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ orderId: 'o1' }) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({ apiClient: { getMyTickets: jest.fn() } }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
// The QR is drawn by the library; here it names what it encodes.
jest.mock('react-native-qrcode-svg', () => {
  const { View } = jest.requireActual('react-native')
  return { __esModule: true, default: ({ value }: { value: string }) => <View testID={`qr-${value}`} /> }
})

/* eslint-disable import/first */
import AsyncStorage from '@react-native-async-storage/async-storage'
import TicketScreen from '../app/ticket/[orderId]'
import { apiClient } from '../lib/apiClient'
import { readTicketCache, rememberTicketEvent, saveTickets } from '../lib/ticketCache'
import type { Ticket } from '../lib/ticketing'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const ticket = (id: string, orderId = 'o1', over: Partial<Ticket> = {}): Ticket => ({
  ticketId: id,
  orderId,
  eventId: 'e1',
  typeName: 'Early bird',
  doorCode: 'K7Q2XM',
  qrPayload: `${id}.mac`,
  redeemedAt: null,
  ...over,
})
const open = async () => {
  await render(<TicketScreen />)
  await act(async () => {})
}

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
})

it('one page per ticket of the order: its QR, its code in two groups, read character by character', async () => {
  api.getMyTickets.mockResolvedValue({ success: true, data: [ticket('k1'), ticket('k2', 'o1', { doorCode: 'ABC123' }), ticket('k3', 'o2')] } as never)
  await rememberTicketEvent('me', 'e1', { title: 'Rooftop Sundowner', startTime: '2026-11-08T12:30:00Z', timezone: 'Asia/Kolkata', venueName: 'High Ultra Lounge' })
  await open()
  expect(screen.getByTestId('qr-k1.mac')).toBeTruthy()
  expect(screen.getByTestId('qr-k2.mac')).toBeTruthy()
  expect(screen.queryByTestId('qr-k3.mac')).toBeNull()
  expect(screen.getByText('K7Q 2XM', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('ABC 123', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByLabelText('Your ticket, 1 of 2. Rooftop Sundowner. Early bird. Door code K 7 Q, 2 X M')).toBeTruthy()
  expect(screen.getAllByLabelText('Ticket QR code for the door')).toHaveLength(2)
  expect(screen.getByText('Works offline')).toBeTruthy()
  // And the answer is now on the phone for next time.
  expect((await readTicketCache('me')).tickets).toHaveLength(3)
})

it('the event the ticket carries (§8.4) names the pass, with no event page ever visited', async () => {
  const event = { id: 'e1', title: 'Junction Tech Mixer', startsAt: '2026-11-13T00:00:00Z', endsAt: '2026-11-13T04:00:00Z', timezone: 'America/Toronto', venueName: 'The Drake Underground', coverUrl: null }
  await rememberTicketEvent('me', 'e1', { title: 'An older name', startTime: '2026-11-13T00:00:00Z' })
  api.getMyTickets.mockResolvedValue({ success: true, data: [{ ...ticket('k1'), event }] } as never)
  await open()
  expect(screen.getByText('Junction Tech Mixer', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.queryByText('An older name', { includeHiddenElements: true })).toBeNull()
  expect(screen.getByText('The Drake Underground')).toBeTruthy()
})

it('no connection: the copy on the phone is the pass, and says it is offline', async () => {
  await saveTickets('me', [ticket('k1')])
  api.getMyTickets.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  await open()
  expect(screen.getByTestId('qr-k1.mac')).toBeTruthy()
  expect(screen.getByText('Offline · still valid')).toBeTruthy()
})

it('nothing on the phone and no connection: says so, never a blank pass', async () => {
  api.getMyTickets.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  await open()
  expect(screen.getByText('Couldn’t load your ticket')).toBeTruthy()
})

it('a used ticket says when, and still shows its code', async () => {
  api.getMyTickets.mockResolvedValue({ success: true, data: [ticket('k1', 'o1', { redeemedAt: '2026-11-08T15:44:00Z' })] } as never)
  await open()
  expect(screen.getByText(/^Used /, { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByText('K7Q 2XM', { includeHiddenElements: true })).toBeTruthy()
})
