/**
 * SCRUM-1425: a room join the server could not check (`error { code: "SERVER_ERROR" }`, admin SCRUM-1402) is asked
 * again on a single-flight, full-jitter timer (2 s base, doubling, 30 s cap, 5 attempts), reset by `connect` and
 * cancelled by a disconnect or sign-out. `FORBIDDEN` is a refusal and is never asked again.
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
  emit = jest.fn(() => this)
  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true
    if (event === 'disconnect') this.connected = false
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
  apiClient: { forgetChatGroups: jest.fn(), forgetActiveCheckins: jest.fn(), forgetEventMatches: jest.fn() },
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

type SocketClient = typeof import('../lib/socketClient')
const SERVER_ERROR = { message: 'Could not join right now. Try again.', code: 'SERVER_ERROR' }

let client: SocketClient
let s: MockSocket

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setImmediate'] })
  // Full jitter at its top: each delay is the whole window, so the windows can be read off the clock.
  jest.spyOn(Math, 'random').mockReturnValue(0.999999)
  jest.isolateModules(() => {
    client = require('../lib/socketClient')
  })
  const pending = client.connect()
  await new Promise(setImmediate)
  s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  client.subscribeToChatMessage('room-1', jest.fn())
  client.subscribeToChatMessage('room-2', jest.fn())
  s.emit.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

const joins = () => s.emit.mock.calls.filter(([name]) => String(name).startsWith('join:'))

it('coalesces several SERVER_ERRORs into one round of joins after the jittered delay', () => {
  s.fire('error', SERVER_ERROR)
  s.fire('error', SERVER_ERROR)
  s.fire('error', SERVER_ERROR)
  jest.advanceTimersByTime(1990)
  expect(joins()).toHaveLength(0)
  jest.advanceTimersByTime(10)
  expect(joins()).toEqual([
    ['join:chat', 'room-1'],
    ['join:chat', 'room-2'],
  ])
  jest.advanceTimersByTime(60_000)
  expect(joins()).toHaveLength(2)
})

it('doubles the window on each further failure, caps it at 30 s and stops after five attempts', () => {
  const windows: number[] = []
  for (let i = 0; i < 6; i++) {
    s.emit.mockClear()
    s.fire('error', SERVER_ERROR)
    let waited = 0
    while (joins().length === 0 && waited < 60_000) {
      jest.advanceTimersByTime(100)
      waited += 100
    }
    windows.push(joins().length ? waited : -1)
  }
  expect(windows).toEqual([2000, 4000, 8000, 16000, 30000, -1])
})

it('starts again from 2 s after a connect', () => {
  for (let i = 0; i < 5; i++) {
    s.fire('error', SERVER_ERROR)
    jest.advanceTimersByTime(30_000)
  }
  s.fire('connect')
  s.emit.mockClear()
  s.fire('error', SERVER_ERROR)
  jest.advanceTimersByTime(2000)
  expect(joins()).toHaveLength(2)
})

it('drops a pending retry on a disconnect, and on sign-out', () => {
  s.fire('error', SERVER_ERROR)
  s.fire('disconnect', 'transport close')
  s.connected = true
  jest.advanceTimersByTime(60_000)
  expect(joins()).toHaveLength(0)

  s.fire('error', SERVER_ERROR)
  expect(jest.getTimerCount()).toBe(1)
  client.disconnect()
  expect(jest.getTimerCount()).toBe(0)
})

it('never asks again after a FORBIDDEN or any other code (control)', () => {
  s.fire('error', { message: 'Forbidden', code: 'FORBIDDEN' })
  s.fire('error', { message: 'Bad request', code: 'BAD_REQUEST' })
  s.fire('error', { message: 'no code' })
  jest.advanceTimersByTime(60_000)
  expect(s.emit).not.toHaveBeenCalled()
})
