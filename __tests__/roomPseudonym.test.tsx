/**
 * ROOM-02 / M1: your pseudonym in a room is that room's. Room A's must not stay on screen when room B's door fails.
 * (Harness of roomRoundTrips.test.tsx.)
 *
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
const mockChanged = new Set<() => void>()
jest.mock('../lib/checkIn', () => ({
  subscribeCheckInChanged: (f: () => void) => {
    mockChanged.add(f)
    return () => mockChanged.delete(f)
  },
}))

// Before the requires: `apiClient` reads it at load, and imports are hoisted.
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { connect } = require('../lib/socketClient') as typeof import('../lib/socketClient')
const { useRoom } = require('../lib/useRoom') as typeof import('../lib/useRoom')
/* eslint-enable @typescript-eslint/no-require-imports */


let EVENT = 'e-a'
let chatAnswer: 'ok' | 'fail' | 'left' = 'ok'

function answer(path: string): unknown {
  if (path.startsWith('/api/mobile/checkins/active')) {
    return { checkIns: [{ eventId: EVENT, checkInTime: '2026-10-12T14:00:00.000Z', event: { id: EVENT, title: 'Hackathon' } }] }
  }
  if (path.startsWith(`/api/mobile/events/${EVENT}/room-preview`)) return { hereCount: 1, tasteMatchCount: null }
  if (path.startsWith(`/api/mobile/events/${EVENT}/matches`)) return { matches: [] }
  if (path.startsWith(`/api/mobile/events/${EVENT}/chat`)) return { chatGroupId: `g-${EVENT}`, you: { pseudonym: 'Night Cat' }, write: { allowed: true, closesAt: '2026-10-13T20:00:00.000Z' } }
  return []
}

beforeEach(async () => {
  apiClient.forgetActiveCheckins()
  apiClient.clearResponseCache()
  mockSecure.clear()
  chatAnswer = 'ok'
  await TokenStorage.setAccessToken('tok')
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (path.endsWith(`/${EVENT}/chat`) && chatAnswer === 'fail') return json({ success: false, error: 'nope', errorCode: 'FORBIDDEN' }, 403)
    if (path.endsWith(`/${EVENT}/chat`) && chatAnswer === 'left') return json({ success: false, error: 'You left', errorCode: 'LEFT_ROOM', chatGroupId: `g-${EVENT}` }, 403)
    return json({ success: true, data: answer(path) })
  }) as typeof fetch
})

afterAll(() => new Promise((r) => setTimeout(r, 300)))

async function connected(): Promise<MockSocket> {
  const pending = connect()
  await new Promise((r) => setTimeout(r, 0))
  const s = mockSockets[mockSockets.length - 1]
  s.fire('connect')
  await pending
  return s
}

async function moveTo(next: string, how: 'fail' | 'left') {
  EVENT = next
  chatAnswer = how
  apiClient.forgetActiveCheckins()
  apiClient.clearResponseCache()
  await act(async () => mockChanged.forEach((f) => f()))
}

describe('your pseudonym is the current room’s (M1)', () => {
  it.each([['fail'], ['left']] as const)('room A named you "Night Cat"; room B’s door answers %s: no pseudonym is kept', async (how) => {
    EVENT = `e-a-${how}`
    await connected()
    const hook = await renderHook(() => useRoom())
    await waitFor(() => expect(hook.result.current.pseudonym).toBe('Night Cat'))
    expect(hook.result.current.chatClosesAt).toBe('2026-10-13T20:00:00.000Z')

    await moveTo(`e-b-${how}`, how)
    await waitFor(() => expect(hook.result.current.event?.id).toBe(`e-b-${how}`))
    await waitFor(() => expect(hook.result.current.pseudonym).toBeNull())
    expect(hook.result.current.chatClosesAt).toBeNull()
    hook.unmount()
  })
})
