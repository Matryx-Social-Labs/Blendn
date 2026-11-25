/**
 * Opening a Room costs fewer round trips in series.
 *
 * Each series step is ~200-250 ms from Canada. Two were removed:
 * the block list was awaited between /checkins/active and /matches on every
 * 30 s sync, and on a re-open the dock's messages waited for the chat lookup
 * to say which group the event's room is, though the id was already known.
 *
 * Real `apiClient` (fetch faked), real `socketClient` (socket faked), real
 * `useRoom` -- the harness of room-here-count-after-checkout.test.tsx.
 */
import { renderHook, waitFor } from '@testing-library/react-native'

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
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockSecure.set(k, v)
  },
  deleteItemAsync: async (k: string) => {
    mockSecure.delete(k)
  },
}))
jest.mock('../lib/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))
jest.mock('../lib/sentry', () => ({ Sentry: { captureMessage: jest.fn(), captureException: jest.fn() } }))
jest.mock('expo-router', () => ({
  // On focus once, like a screen that is open.
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' }, initialized: true }) }))
// The block list is slow on purpose: the roster must not wait for it in series.
let mockBlockedGate: Promise<void> = Promise.resolve()
const mockBlockedCalls: string[] = []
jest.mock('../lib/safetyUtils', () => ({
  getBlockedUsers: async () => {
    mockBlockedCalls.push('blocked:start')
    await mockBlockedGate
    mockBlockedCalls.push('blocked:end')
    return []
  },
}))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))

// Before the requires: `apiClient` reads it at load, and imports are hoisted.
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { connect } = require('../lib/socketClient') as typeof import('../lib/socketClient')
const { useRoom } = require('../lib/useRoom') as typeof import('../lib/useRoom')
/* eslint-enable @typescript-eslint/no-require-imports */


// One event per test: the chat group id is remembered for the session, by event.
let EVENT = 'e-roundtrips'
const log: string[] = []

function answer(path: string): unknown {
  if (path.startsWith('/api/mobile/checkins/active')) {
    return { checkIns: [{ eventId: EVENT, checkInTime: '2026-10-12T14:00:00.000Z', event: { id: EVENT, title: 'Hackathon' } }] }
  }
  if (path.startsWith(`/api/mobile/events/${EVENT}/room-preview`)) return { hereCount: 1, tasteMatchCount: null }
  if (path.startsWith(`/api/mobile/events/${EVENT}/matches`)) return { matches: [] }
  if (path.startsWith(`/api/mobile/events/${EVENT}/chat`)) return { chatGroupId: `g-${EVENT}` }
  return {}
}

async function connected(): Promise<MockSocket> {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  return s
}

beforeEach(async () => {
  apiClient.forgetActiveCheckins()
  apiClient.clearResponseCache()
  log.length = 0
  mockBlockedCalls.length = 0
  mockBlockedGate = Promise.resolve()
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const name = path.split('/').slice(-1)[0]
    log.push(`${name}:start`)
    log.push(`${name}:end`)
    return new Response(JSON.stringify({ success: true, data: answer(path) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
})

afterAll(() => new Promise((r) => setTimeout(r, 300)))

it('asks for the roster while the block list is still loading', async () => {
  EVENT = 'e-blocklist'
  let release: () => void = () => {}
  mockBlockedGate = new Promise<void>((r) => (release = r))
  const connectedSocket = connected()
  const hook = await renderHook(() => useRoom())
  await connectedSocket

  await waitFor(() => expect(log).toContain('matches:start'))
  // The block list has not answered, and the roster is already on the wire.
  expect(mockBlockedCalls).toEqual(['blocked:start'])
  release()
  await waitFor(() => expect(hook.result.current.settled).toBe(true))
  hook.unmount()
})

