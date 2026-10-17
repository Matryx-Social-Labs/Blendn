/**
 * The open Room's "N here now" follows check-outs (SCRUM-617).
 *
 * The server sends the recounted number on every `event:checkout`, and the
 * Room applied it. But the same event marks the room dirty, and the sync that
 * follows re-seeds the count from `getRoomPreview` — through its 15-second SWR
 * cache, which still held the number from before the check-out. So the header
 * went 7 → 6 and back to 7 as soon as that sync landed, and stayed at 7 while
 * the database said 4.
 *
 * Real `apiClient` (fetch faked), real `socketClient` (socket faked), real
 * `useRoom`: the bug lived between the three, so the test does too.
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
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))

// Before the requires: `apiClient` reads it at load, and imports are hoisted.
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { connect } = require('../lib/socketClient') as typeof import('../lib/socketClient')
const { useRoom } = require('../lib/useRoom') as typeof import('../lib/useRoom')
/* eslint-enable @typescript-eslint/no-require-imports */

/** The server: which room you are in, and how many are inside it. One room per test, so no test reads another's cache. */
const server = { event: '', inside: 0 }

function answer(path: string): unknown {
  if (path.startsWith('/api/mobile/checkins/active')) {
    return {
      checkIns: [{ eventId: server.event, checkInTime: '2026-10-12T14:00:00.000Z', event: { id: server.event, title: 'Hackathon' } }],
    }
  }
  if (path.startsWith(`/api/mobile/events/${server.event}/room-preview`)) {
    return { hereCount: server.inside, tasteMatchCount: null }
  }
  if (path.startsWith(`/api/mobile/events/${server.event}/matches`)) return { matches: [] }
  if (server.event.startsWith('e401') && path.startsWith(`/api/mobile/events/${server.event}/chat`)) return { chatGroupId: `g-${server.event}` }
  if (path.startsWith(`/api/mobile/chat/groups/g-${server.event}/messages`)) {
    return [{ id: 'm1', content: 'Rumours side two. Fight me.', user_id: 'u2', created_at: '2026-10-12T14:01:00.000Z' }]
  }
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

/** Long enough for every sync the events started to finish. */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 200)))

beforeEach(async () => {
  // `/checkins/active` is cached too, and names the room: each test's own.
  apiClient.forgetActiveCheckins()
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '')
    return new Response(JSON.stringify({ success: true, data: answer(path) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
})

// The last sync's reads land after the last test; let them, before teardown.
afterAll(() => new Promise((r) => setTimeout(r, 300)))

async function openRoom(event: string, inside: number) {
  server.event = event
  server.inside = inside
  const socket = await connected()
  const hook = await renderHook(() => useRoom())
  await waitFor(() => expect(hook.result.current.hereCount).toBe(inside))
  return { socket, room: hook.result, unmount: hook.unmount }
}

function checkOut(socket: MockSocket, who: string) {
  server.inside -= 1
  socket.fire('event:checkout', {
    eventId: server.event,
    userId: who,
    checkOutTime: new Date().toISOString(),
    hereCount: server.inside,
  })
}

it('drops by one on a check-out, and the sync the check-out starts does not put it back', async () => {
  const { socket, room, unmount } = await openRoom('e617-one', 7)

  await act(async () => checkOut(socket, 'rh_a'))
  await settle()

  expect(room.current.hereCount).toBe(6)
  unmount()
})

it('three check-outs one after another take 10 to 7, not 8 (the ticket, run 1)', async () => {
  const { socket, room, unmount } = await openRoom('e617-three', 10)

  for (const who of ['rh_a', 'rh_b', 'rh_c']) {
    await act(async () => checkOut(socket, who))
    await settle()
  }

  expect(room.current.hereCount).toBe(7)
  unmount()
})

it('three in one burst, each landing while the last one\'s sync is still reading, still end at 7', async () => {
  const { socket, room, unmount } = await openRoom('e617-burst', 10)

  await act(async () => {
    for (const who of ['rh_a', 'rh_b', 'rh_c']) checkOut(socket, who)
  })
  await settle()

  expect(room.current.hereCount).toBe(7)
  unmount()
})

it('asks for the count and the chat with the check-ins, before the roster, and is settled once both answer (PR #401 drive)', async () => {
  const order: string[] = []
  const inner = global.fetch as jest.Mock
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    order.push(path)
    return inner(input, init)
  }) as typeof fetch
  const { room, unmount } = await openRoom('e401-early', 5)
  await waitFor(() => expect(room.current.settled).toBe(true))
  const at = (end: string) => order.findIndex((p) => p.endsWith(end))
  const roster = at('/e401-early/matches')
  expect(at('/e401-early/room-preview')).toBeGreaterThan(-1)
  expect(at('/e401-early/room-preview')).toBeLessThan(roster)
  expect(at('/e401-early/chat')).toBeLessThan(roster)
  // Once each: the effect took the early lookup over rather than asking again.
  expect(order.filter((p) => p.endsWith('/e401-early/chat'))).toHaveLength(1)
  // Settled includes the dock's first read: it opens on the real last line (drive 2).
  expect(room.current.chatHistory).toMatchObject({ groupId: 'g-e401-early', failed: false })
  expect(order.findIndex((p) => p.endsWith('/g-e401-early/messages'))).toBeGreaterThan(-1)
  unmount()
})
