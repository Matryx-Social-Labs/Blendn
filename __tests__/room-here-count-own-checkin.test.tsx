/**
 * "N here now" counts your own check-in and a late arrival without reopening
 * the Room (SCRUM-936).
 *
 * Three ways the number stayed one short, all between the real `apiClient`
 * (fetch faked), the real `socketClient` (socket faked) and the real hooks:
 *
 * 1. Your check-in did not drop the room's preview, so a Room opened straight
 *    after it was seeded from the 15 s SWR entry read before you were in
 *    (stale entries are served for five minutes).
 * 2. (Pinned, not changed: it already held.) A seed read answered after a
 *    socket arrival must not put the older number back. The arrival marks the
 *    room dirty, and the sync it starts supersedes the held seed.
 * 3. The chat header counted from the Banter list's row, read when the list
 *    was, and subscribed only from mounting: an arrival in between was never
 *    heard of.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native'

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
jest.mock('../lib/safetyUtils', () => ({ getBlockedUsers: async () => [] }))

// Before the requires: `apiClient` reads it at load, and imports are hoisted.
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { connect } = require('../lib/socketClient') as typeof import('../lib/socketClient')
const { useRoom } = require('../lib/useRoom') as typeof import('../lib/useRoom')
const { useHereCount } = require('../lib/roomRow') as typeof import('../lib/roomRow')
const { checkInChanged } = require('../lib/checkIn') as typeof import('../lib/checkIn')
/* eslint-enable @typescript-eslint/no-require-imports */


/** The server: which room you are in, and how many are inside it. One room per test, so no test reads another's cache. */
const server = { event: '', inside: 0, hold: null as Promise<void> | null }

function answer(path: string): unknown {
  if (path.startsWith('/api/mobile/checkins/active')) {
    return {
      checkIns: [{ eventId: server.event, checkInTime: '2026-10-30T14:00:00.000Z', event: { id: server.event, title: 'Stand-up' } }],
    }
  }
  if (path.startsWith(`/api/mobile/events/${server.event}/matches`)) return { matches: [] }
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

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 200)))

beforeEach(async () => {
  apiClient.forgetActiveCheckins()
  mockSecure.clear()
  server.hold = null
  await TokenStorage.setAccessToken('tok')
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '')
    let data = answer(path)
    if (path.startsWith(`/api/mobile/events/${server.event}/room-preview`)) {
      // Evaluated now, delivered when the hold lifts: the read that is older than what happened meanwhile.
      const hereCount = server.inside
      if (server.hold) await server.hold
      data = { hereCount, tasteMatchCount: null }
    }
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
})

afterAll(() => new Promise((r) => setTimeout(r, 300)))

function hold(): () => void {
  let release = () => {}
  server.hold = new Promise<void>((r) => {
    release = r
  })
  return release
}

function arrive(socket: MockSocket, who: string) {
  server.inside += 1
  const data = { eventId: server.event, userId: who, userName: 'Late', checkInTime: new Date().toISOString(), hereCount: server.inside }
  socket.fire('event:checkin', { eventId: server.event, hereCount: server.inside })
  socket.fire('event:room:checkin', data)
}

it('a Room opened straight after your check-in counts you, not the preview read before it', async () => {
  server.event = 'e936-own'
  server.inside = 5
  await connected()
  // The event page or Tonight read the preview while you were outside.
  await apiClient.getRoomPreview(server.event)
  // You check in: the server now says 6.
  server.inside = 6
  checkInChanged(server.event)

  const hook = await renderHook(() => useRoom())

  await waitFor(() => expect(hook.result.current.hereCount).toBe(6))
  hook.unmount()
})

it('an arrival landing before the seed read is answered is not overwritten by the older number (the superseding sync)', async () => {
  server.event = 'e936-race'
  server.inside = 6
  const socket = await connected()
  const release = hold()

  const hook = await renderHook(() => useRoom())
  await waitFor(() => expect(hook.result.current.event?.id).toBe('e936-race'))
  await act(async () => arrive(socket, 'rh_late'))
  expect(hook.result.current.hereCount).toBe(7)
  await act(async () => release())
  await settle()

  expect(hook.result.current.hereCount).toBe(7)
  hook.unmount()
})

it('the chat header counts from the room preview, not from the list read before the last arrival', async () => {
  server.event = 'e936-header'
  server.inside = 9
  await connected()

  const hook = await renderHook(() => useHereCount({ eventId: 'e936-header', hereCount: 8 }))

  await waitFor(() => expect(hook.result.current).toBe(9))
  hook.unmount()
})

it('the chat header keeps an arrival heard while its preview read was still out', async () => {
  server.event = 'e936-header-race'
  server.inside = 8
  const socket = await connected()
  const release = hold()

  const hook = await renderHook(() => useHereCount({ eventId: 'e936-header-race', hereCount: 8 }))
  await act(async () => arrive(socket, 'rh_late'))
  expect(hook.result.current).toBe(9)
  await act(async () => release())
  await settle()

  expect(hook.result.current).toBe(9)
  hook.unmount()
})
