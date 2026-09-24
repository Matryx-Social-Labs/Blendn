/**
 * The server's sentence survives the sign-out it causes (SCRUM-292).
 *
 * Driven on Android: an admin suspended the account, the phone's refresh got
 * 403 "This account has been suspended…", and the entry screen still said
 * "You were signed out". The sign-out that followed fired requests with no
 * session left — the push-token DELETE, and any other call waiting on the same
 * refresh — each 401'd, and each recorded the generic marker over the
 * sentence. The iOS simulator has no push token, so it sent nothing and
 * passed; a real phone of either kind has one.
 *
 * These drive the real client: a scripted server, real token storage (in
 * memory), the real 401 → refresh path, and the entry screen's read.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
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
// apiClient registers an AppState listener on a 1 s module-level timer; with the
// real module that fires after teardown and imports react-native into a dead
// environment. Plain objects keep it harmless.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  consumeSessionEndedNotice,
  markSessionExpired,
  markSessionStarted,
  subscribeSessionExpired,
} from '../lib/sessionEvents'

// apiClient refuses to load without a base URL; imports are hoisted, so require it after.
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

const SUSPENDED = "This account has been suspended. Contact support@blendn.app if you think that's a mistake."

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const settle = () => new Promise((r) => setTimeout(r, 0))

/** A suspended account: every call 401s, and the refresh says why. */
function suspendedServer(refreshDelayMs = 0) {
  const seen: string[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push(`${init?.method ?? 'GET'} ${url.replace(/^https?:\/\/[^/]+/, '')}`)
    if (url.endsWith('/api/mobile/auth/refresh')) {
      await new Promise((r) => setTimeout(r, refreshDelayMs))
      return json(403, { success: false, error: SUSPENDED })
    }
    return json(401, { success: false, error: 'Unauthorized' })
  }) as typeof fetch
  return seen
}

beforeEach(async () => {
  mockSecure.clear()
  await AsyncStorage.clear()
})

describe('a suspended phone is told why, through the sign-out that follows', () => {
  it("keeps the refresh's sentence when the push-token DELETE 401s after the tokens are gone", async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    const seen = suspendedServer()

    await apiClient.getSession()
    // What _layout does once `user` is null: an authenticated DELETE with no session.
    await apiClient.removePushToken('ExponentPushToken[device]')
    await settle()

    expect(seen).toEqual([
      'GET /api/mobile/auth/session',
      'POST /api/mobile/auth/refresh',
      'DELETE /api/mobile/notifications/token?token=ExponentPushToken%5Bdevice%5D',
    ])
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)
  })

  it('keeps it when several calls 401 at once and share the one refresh', async () => {
    await TokenStorage.setTokens('access-1', 'refresh-1')
    const seen = suspendedServer(20)

    await Promise.all([apiClient.getSession(), apiClient.getSession(), apiClient.getSession()])
    await settle()

    expect(seen.filter((s) => s.startsWith('POST /api/mobile/auth/refresh'))).toHaveLength(1)
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)
  })
})

describe('the notice belongs to one session end', () => {
  it('is not raised again by a call that 401s after the entry screen read it', async () => {
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)

    markSessionExpired()
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(false)
  })

  it('is recorded on a cold start, before this process has seen any sign-in', async () => {
    // A phone relaunched with a stored session: nothing has called
    // markSessionStarted, and the first end may carry no sentence at all.
    let fresh!: typeof import('../lib/sessionEvents')
    jest.isolateModules(() => {
      fresh = require('../lib/sessionEvents')
    })
    fresh.markSessionExpired()
    await settle()
    expect(await fresh.consumeSessionEndedNotice()).toBe(true)
  })

  it('is news again once a new session has begun', async () => {
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    await settle()
    await consumeSessionEndedNotice()

    await TokenStorage.setTokens('access-2', 'refresh-2')
    markSessionExpired()
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(true)
  })

  it('is not inherited by the next sign-in when nobody read it', async () => {
    // One person's "suspended" must never greet whoever signs in next on the phone.
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    await settle()

    await TokenStorage.setTokens('access-3', 'refresh-3')
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(false)
  })

  it("lets the server's sentence replace a generic marker for the same end", async () => {
    markSessionStarted()
    markSessionExpired()
    markSessionExpired(SUSPENDED)
    await settle()
    expect(await consumeSessionEndedNotice()).toBe(SUSPENDED)
  })

  it('still tells the app every time, so a signed-in screen is always cleared', () => {
    const heard = jest.fn()
    const unsubscribe = subscribeSessionExpired(heard)
    markSessionStarted()
    markSessionExpired(SUSPENDED)
    markSessionExpired()
    unsubscribe()
    expect(heard).toHaveBeenCalledTimes(2)
  })
})
