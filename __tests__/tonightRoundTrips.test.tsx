/**
 * Tonight asks for the events and the RSVPs together.
 *
 * `getEvents` used to start only after `getMyRsvps` had answered, though the
 * RSVPs only decide which rows sort as "yours": one round trip (~200-250 ms from
 * Canada) in series for a sort key.
 */
import { renderHook, waitFor } from '@testing-library/react-native'

const mockGetEvents = jest.fn()
const mockGetMyRsvps = jest.fn()
jest.mock('../lib/api', () => ({ getEvents: (...a: unknown[]) => mockGetEvents(...a) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getMyRsvps: () => mockGetMyRsvps(),
    getRoomPreview: async () => ({ success: false }),
  },
}))
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ status: 'denied' }),
  getLastKnownPositionAsync: async () => null,
}))
jest.mock('../lib/cityStorage', () => ({ readStoredCity: async () => ({ city: 'Bengaluru', source: 'chosen' }) }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
// The centre button's signal, as the Pulse published it: `todayEventIds` are the events it says are yours today.
let mockSignal = { insideEventId: null, insideVenue: null, insideCount: 0, todayEventIds: [] as string[] }
jest.mock('../lib/roomSignal', () => ({
  getRoomSignal: () => mockSignal,
  subscribeRoomSignal: () => () => {},
}))
jest.mock('../lib/useLiveSync', () => ({ useLiveSync: () => 'connected' }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useTonight } = require('../lib/useTonight') as typeof import('../lib/useTonight')

const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
const event = (id: string, minutes: number) => ({
  id,
  title: `Event ${id}`,
  venue_name: 'Venue',
  cover_image_url: null,
  start_time: soon(minutes),
  end_time: soon(minutes + 120),
  here_count: 0,
  max_capacity: 0,
  is_favorited: false,
  going_count: 0,
})

it('starts the events request before the RSVPs have answered, and still uses them to sort', async () => {
  let answerRsvps: (v: unknown) => void = () => {}
  mockGetMyRsvps.mockReturnValue(new Promise((r) => (answerRsvps = r)))
  mockGetEvents.mockResolvedValue({ data: [event('a', 20), event('b', 30)] })

  const hook = await renderHook(() => useTonight())

  // The RSVPs are still out; the events are already on the wire.
  await waitFor(() => expect(mockGetEvents).toHaveBeenCalled())
  expect(hook.result.current.status).toBe('loading')

  answerRsvps({ data: { events: [{ id: 'b', rsvpStatus: 'going' }] } })
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  expect(hook.result.current.events.map((e) => e.id)).toEqual(['b', 'a'])
  hook.unmount()
})

it('a failed RSVP read only loses the sort', async () => {
  mockGetMyRsvps.mockRejectedValue(new Error('offline'))
  mockGetEvents.mockResolvedValue({ data: [event('a', 20)] })

  const hook = await renderHook(() => useTonight())

  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  expect(hook.result.current.events.map((e) => e.id)).toEqual(['a'])
  hook.unmount()
})

it('opens on the event the centre button points at, though it starts past the six-hour horizon (SCRUM-971)', async () => {
  // Yours, today in its own zone, 23.5 h away: the disc says "Open tonight's event"; the deck must have it, in front.
  mockSignal = { ...mockSignal, todayEventIds: ['late'] }
  mockGetMyRsvps.mockResolvedValue({ data: { events: [] } })
  mockGetEvents.mockResolvedValue({ data: [event('a', 20), event('late', 23.5 * 60)] })

  const hook = await renderHook(() => useTonight())
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  expect(hook.result.current.events.map((e) => e.id)).toEqual(['late', 'a'])
  mockSignal = { ...mockSignal, todayEventIds: [] }
  hook.unmount()
})
