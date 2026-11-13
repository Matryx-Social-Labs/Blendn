/**
 * Wave PR (b): a received wave can be answered until the room closes, even after the waver left (approval 10). The
 * strip, the toast and See all answer through `room.wave(handle, settle, { name })`: someone off the roster, whom the
 * received list returned. And while the "Waved at you" list is open over the Room, the list plays the moment, not the
 * Room under it.
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
const { wavesListOpened } = require('../lib/roomWaves') as typeof import('../lib/roomWaves')
/* eslint-enable @typescript-eslint/no-require-imports */


/** The server: which room you are in, and how many are inside it. One room per test, so no test reads another's cache. */
const server = { event: '', inside: 0, hold: null as Promise<void> | null }
const posts: { path: string; body: unknown }[] = []

function answer(path: string): unknown {
  if (path.startsWith('/api/mobile/checkins/active')) {
    return {
      checkIns: [{ eventId: server.event, checkInTime: '2026-10-30T14:00:00.000Z', event: { id: server.event, title: 'Stand-up' } }],
    }
  }
  if (path.startsWith(`/api/mobile/events/${server.event}/matches`)) return { matches: [] }
  if (path === `/api/mobile/events/${server.event}/waves`) return { sent: true, mutual: true, conversationId: 'conv-1', pseudonyms: { you: 'Swift Gecko', them: 'Harbour Heron' } }
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
  posts.length = 0
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '')
    if (init?.method === 'POST') posts.push({ path, body: JSON.parse(String(init.body)) })
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


it('answers a wave from someone who left (off the roster) and plays the moment; control: without the list’s say-so it is refused unsent', async () => {
  server.event = 'e-wave-left'
  server.inside = 2
  await connected()
  const hook = await renderHook(() => useRoom())
  await waitFor(() => expect(hook.result.current.event?.id).toBe('e-wave-left'))

  let refused: Awaited<ReturnType<typeof hook.result.current.wave>> | undefined
  await act(async () => {
    refused = await hook.result.current.wave('rh_gone', 0)
  })
  expect(refused?.kind).toBe('refused')
  expect(posts).toHaveLength(0)

  let answered: Awaited<ReturnType<typeof hook.result.current.wave>> | undefined
  await act(async () => {
    answered = await hook.result.current.wave('rh_gone', 0, { name: 'Harbour Heron' })
  })
  expect(answered?.kind).toBe('mutual')
  expect(posts).toEqual([{ path: '/api/mobile/events/e-wave-left/waves', body: { toUserId: 'rh_gone' } }])
  expect(hook.result.current.match).toMatchObject({ name: 'Harbour Heron', you: 'Swift Gecko', conversationId: 'conv-1', person: null })
  hook.unmount()
})

it('while the list is open a room:match plays no moment in the Room under it; control: closed, it does', async () => {
  server.event = 'e-wave-list'
  server.inside = 2
  const socket = await connected()
  const hook = await renderHook(() => useRoom())
  await waitFor(() => expect(hook.result.current.event?.id).toBe('e-wave-list'))

  const close = wavesListOpened()
  await act(async () => socket.fire('room:match', { eventId: 'e-wave-list', otherUserId: 'rh_a', conversationId: 'conv-a', name: 'Night Cat' }))
  expect(hook.result.current.match).toBeNull()
  close()
  await act(async () => socket.fire('room:match', { eventId: 'e-wave-list', otherUserId: 'rh_b', conversationId: 'conv-b', name: 'Brass Lemur' }))
  expect(hook.result.current.match).toMatchObject({ conversationId: 'conv-b' })
  hook.unmount()
})
