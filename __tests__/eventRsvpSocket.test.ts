/**
 * SCRUM-1115: `event:rsvpUpdate` (admin #1005) reaches the event's subscribers with the going count, and only that
 * event's; a reconnect joins the event room again for it, as for every other event subscription.
 */
type Handler = (...args: unknown[]) => void

class MockSocket {
  connected = false
  handlers = new Map<string, Handler[]>()
  io = { on: jest.fn(), removeAllListeners: jest.fn(), engine: { transport: { name: 'websocket' } } }
  disconnect = jest.fn()
  removeAllListeners = jest.fn(() => this)
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn])
    return this
  }
  emit() {
    return this
  }
  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true
    for (const fn of this.handlers.get(event) ?? []) fn(...args)
  }
}

const mockSockets: MockSocket[] = []
jest.mock('socket.io-client', () => ({
  io: () => {
    const s = new MockSocket()
    mockSockets.push(s)
    return s
  },
}))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    forgetChatGroups: jest.fn(),
    forgetActiveCheckins: jest.fn(),
    forgetEventMatches: jest.fn(),
  },
  TokenStorage: { getAccessToken: () => Promise.resolve('token') },
}))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../lib/checkIn', () => ({ checkInChanged: jest.fn() }))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

/* eslint-disable import/first */
import { connect, subscribeToEventInterest, subscribeToEventRsvp } from '../lib/socketClient'
/* eslint-enable import/first */

it('hands the count to that event’s subscribers only, until they leave, and rejoins the room on reconnect', async () => {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  const emit = jest.spyOn(s, 'emit')
  s.fire('connect')
  await pending
  const e1 = jest.fn()
  const e2 = jest.fn()
  const off = subscribeToEventRsvp('e1', e1)
  subscribeToEventRsvp('e2', e2)
  s.fire('event:rsvpUpdate', { eventId: 'e1', rsvpCount: 43 })
  expect(e1).toHaveBeenCalledWith({ eventId: 'e1', rsvpCount: 43 })
  expect(e2).not.toHaveBeenCalled()
  emit.mockClear()
  s.fire('connect')
  expect(emit).toHaveBeenCalledWith('join:event', 'e1')
  off()
  expect(emit).toHaveBeenCalledWith('leave:event', 'e1')
  s.fire('event:rsvpUpdate', { eventId: 'e1', rsvpCount: 44 })
  expect(e1).toHaveBeenCalledTimes(1)
})

it('stays in the event room while the count is still listened to (control: the last one out leaves)', async () => {
  const s = mockSockets[mockSockets.length - 1]
  const emit = jest.spyOn(s, 'emit')
  const offRsvp = subscribeToEventRsvp('e3', jest.fn())
  const offInterest = subscribeToEventInterest('e3', jest.fn())
  emit.mockClear()
  offInterest()
  expect(emit).not.toHaveBeenCalledWith('leave:event', 'e3')
  offRsvp()
  expect(emit).toHaveBeenCalledWith('leave:event', 'e3')
})
