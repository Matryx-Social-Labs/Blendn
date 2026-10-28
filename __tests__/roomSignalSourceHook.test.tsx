/*
 * The hook that mounts the centre button's source (BAR-04, M11): a 60 s tick that only runs in the foreground, the foreground
 * itself, and nothing at all after unmount or without a user. The pure source is in roomSignalSource.test.ts.
 */
import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

jest.mock('../lib/api', () => ({ getEvents: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getUserFavorites: jest.fn(), getMyRsvps: jest.fn() } }))
jest.mock('../lib/useTonight', () => ({ quietLocation: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: jest.fn(() => () => {}) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))

/* eslint-disable import/first */
import { getEvents } from '../lib/api'
import { apiClient } from '../lib/apiClient'
import { clearRoomSignal, getRoomSignal } from '../lib/roomSignal'
import { SOURCE_TICK_MS, rejudgeRoomSignal, useRoomSignalSource } from '../lib/useRoomSignalSource'
import { quietLocation } from '../lib/useTonight'
/* eslint-enable import/first */

const events = getEvents as jest.Mock
const VENUE = { latitude: 12.97, longitude: 77.59 }
let appListener: (s: string) => void = () => {}
let removed = 0
let appState = 'active'

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-10-27T18:00:00Z') })
  jest.clearAllMocks()
  clearRoomSignal()
  removed = 0
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    appListener = fn
    return { remove: () => void (removed += 1) }
  }) as never)
  appState = 'active'
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState })
  ;(quietLocation as jest.Mock).mockImplementation(async () => ({
    coords: { ...VENUE, latitude: VENUE.latitude + 0.0018, accuracy: 10, timestamp: Date.now(), approximate: false },
    location: 'on',
  }))
  // One event, 200 m off, whose doors open two minutes from now.
  events.mockImplementation(async () => ({
    data: [{ id: 'e1', start_time: new Date(Date.now() + 120_000).toISOString(), end_time: new Date(Date.now() + 3 * 3600_000).toISOString(), ...VENUE, check_in_radius: 260, distance: 0.2, venue_name: 'Toit' }],
    error: null,
  }))
  ;(apiClient.getUserFavorites as jest.Mock).mockResolvedValue({ success: true, data: { events: [] } })
  ;(apiClient.getMyRsvps as jest.Mock).mockResolvedValue({ success: true, data: { events: [] } })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => {})
}

it('reads once on mount; a tick after the doors open flips the signal with no second fetch', async () => {
  await renderHook(() => useRoomSignalSource('u1'))
  await flush()
  expect(events).toHaveBeenCalledTimes(1)
  expect(getRoomSignal().insideEventId).toBeNull()
  await act(async () => {
    jest.advanceTimersByTime(SOURCE_TICK_MS * 2)
  })
  await flush()
  expect(getRoomSignal().insideEventId).toBe('e1')
  expect(events).toHaveBeenCalledTimes(1)
})

it('the foreground re-judges at once', async () => {
  await renderHook(() => useRoomSignalSource('u1'))
  await flush()
  jest.setSystemTime(Date.now() + 3 * 60_000)
  await act(async () => appListener('active'))
  await flush()
  expect(getRoomSignal().insideEventId).toBe('e1')
})

it('a tick in the background judges nothing', async () => {
  await renderHook(() => useRoomSignalSource('u1'))
  await flush()
  appState = 'background'
  ;(quietLocation as jest.Mock).mockClear()
  await act(async () => {
    jest.advanceTimersByTime(SOURCE_TICK_MS * 3)
  })
  expect(quietLocation).not.toHaveBeenCalled()
})

it('rejudgeRoomSignal reads again, forced', async () => {
  await renderHook(() => useRoomSignalSource('u1'))
  await flush()
  await act(async () => rejudgeRoomSignal())
  await flush()
  expect(events).toHaveBeenCalledTimes(2)
  expect(events.mock.calls[1][1]).toEqual({ force: true })
})

it('an RSVP or a save (the status writers announce it) reads again, forced; after unmount it does not', async () => {
  const { emitEventStatusChanged } = require('../lib/eventStatusSignal') as typeof import('../lib/eventStatusSignal')
  const view = await renderHook(() => useRoomSignalSource('u1'))
  await flush()
  await act(async () => emitEventStatusChanged())
  await flush()
  expect(events).toHaveBeenCalledTimes(2)
  expect(events.mock.calls[1][1]).toEqual({ force: true })
  await view.unmount()
  await act(async () => emitEventStatusChanged())
  await flush()
  expect(events).toHaveBeenCalledTimes(2)
})

it('unmounting stops the timer and the listener, and nothing is published after', async () => {
  const view = await renderHook(() => useRoomSignalSource('u1'))
  await flush()
  await view.unmount()
  expect(removed).toBe(1)
  jest.setSystemTime(Date.now() + 5 * 60_000)
  await act(async () => {
    jest.advanceTimersByTime(SOURCE_TICK_MS * 3)
  })
  expect(getRoomSignal().insideEventId).toBeNull()
})

it('does nothing without a signed-in user', async () => {
  await renderHook(() => useRoomSignalSource(null))
  await flush()
  expect(events).not.toHaveBeenCalled()
})
