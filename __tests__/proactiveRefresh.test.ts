/**
 * A token that is about to expire is refreshed before the request, not after
 * a wasted 401.
 *
 * Access tokens live 15 minutes, so a cold start or a resume after a quarter
 * of an hour sent the stale token, took a 401 (one full round trip, ~200-250 ms
 * from Canada), refreshed, and retried. On foreground, four or five requests
 * each burned their own 401. These drive the real client against a scripted
 * server and count what went over the wire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
const mockSecure = new Map<string, string>()
// A read that has already captured its value when it is made slow (a keychain that answers late).
let mockSlowReads = 0
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => {
    const value = mockSecure.get(k) ?? null
    if (mockSlowReads > 0) {
      mockSlowReads -= 1
      await new Promise((r) => setTimeout(r, 40))
    }
    return value
  },
  setItemAsync: async (k: string, v: string) => {
    mockSecure.set(k, v)
  },
  deleteItemAsync: async (k: string) => {
    mockSecure.delete(k)
  },
}))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/appVersion', () => ({ appVersionNumber: () => '1.0.0' }))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import { readFileSync } from 'fs'
import { join } from 'path'

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

const jwt = (expiresInSeconds: number) => {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString('base64url')
  return `h.${payload}.s`
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let refreshDelayMs = 5

/** A server that accepts only `valid`, and rotates to `next` on refresh. */
function server(valid: string, next: string) {
  const seen: string[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, '')
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
    seen.push(`${url} ${auth ?? ''}`.trim())
    if (url === '/api/mobile/auth/refresh') {
      await new Promise((r) => setTimeout(r, refreshDelayMs))
      return json(200, { success: true, data: { accessToken: next, refreshToken: 'refresh-2' } })
    }
    return auth === `Bearer ${valid}` ? json(200, { success: true, data: { id: 'u1' } }) : json(401, { success: false })
  }) as typeof fetch
  return seen
}

// The 30 s guard between proactive refreshes keys on Date.now(); each test starts a minute later.
let clock = 1_800_000_000_000
beforeEach(() => {
  mockSecure.clear()
  clock += 60_000
  jest.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(() => jest.restoreAllMocks())

describe('proactive refresh', () => {
  it('refreshes before a request when the token is about to expire, and never sends the stale one', async () => {
    const stale = jwt(20)
    const fresh = jwt(900)
    await TokenStorage.setTokens(stale, 'refresh-1')
    const seen = server(fresh, fresh)

    const result = await apiClient.getSession()

    expect(result.success).toBe(true)
    expect(seen).toEqual(['/api/mobile/auth/refresh', `/api/mobile/auth/session Bearer ${fresh}`])
  })

  it('sends a concurrent burst after one refresh, not one 401 each', async () => {
    const stale = jwt(-5)
    const fresh = jwt(900)
    await TokenStorage.setTokens(stale, 'refresh-1')
    const seen = server(fresh, fresh)

    await Promise.all([apiClient.getSession(), apiClient.getSession(), apiClient.getSession()])

    expect(seen.filter((s) => s.startsWith('/api/mobile/auth/refresh'))).toHaveLength(1)
    expect(seen.filter((s) => s.includes(stale))).toHaveLength(0)
  })

  it('leaves a healthy token alone', async () => {
    const ok = jwt(900)
    await TokenStorage.setTokens(ok, 'refresh-1')
    const seen = server(ok, ok)

    await apiClient.getSession()

    expect(seen).toEqual([`/api/mobile/auth/session Bearer ${ok}`])
  })

  it('does not refresh on every request when the device clock says the token is dead', async () => {
    // A token the server still honours but whose exp the (wrong) clock has passed:
    // the refresh hands back the same short-lived token, so each call looks stale.
    const dead = jwt(-3600)
    await TokenStorage.setTokens(dead, 'refresh-1')
    const seen = server(dead, dead)

    await apiClient.getSession()
    await apiClient.getSession()
    await apiClient.getSession()

    expect(seen.filter((s) => s.startsWith('/api/mobile/auth/refresh'))).toHaveLength(1)
  })

  it('still recovers through the 401 path when the token carries no expiry we can read', async () => {
    await TokenStorage.setTokens('opaque', 'refresh-1')
    const fresh = jwt(900)
    const seen = server(fresh, fresh)

    const result = await apiClient.getSession()

    expect(result.success).toBe(true)
    expect(seen).toEqual([
      '/api/mobile/auth/session Bearer opaque',
      '/api/mobile/auth/refresh',
      `/api/mobile/auth/session Bearer ${fresh}`,
    ])
  })
})

describe('around the refresh', () => {
  it('a refresh that already failed is not asked again by the launch path', async () => {
    await TokenStorage.setTokens(jwt(10), 'refresh-1')
    const seen: string[] = []
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '')
      seen.push(url)
      return json(503, { success: false })
    }) as typeof fetch

    await apiClient.getSession()
    const outcome = await apiClient.refreshSessionOutcome()

    expect(outcome).toBe('failed')
    expect(seen.filter((u) => u === '/api/mobile/auth/refresh')).toHaveLength(1)
  })

  it('a request held up by the 30 s guard still sends the token the other request just fetched', async () => {
    const stale = jwt(10)
    const fresh = jwt(900)
    await TokenStorage.setTokens(stale, 'refresh-1')
    refreshDelayMs = 30
    const seen = server(fresh, fresh)
    mockSlowReads = 0

    const first = apiClient.getSession()
    // The second read has captured the stale token, and answers after the first's refresh has landed.
    mockSlowReads = 1
    const second = apiClient.getSession()
    await Promise.all([first, second])

    expect(seen.filter((s) => s.includes(stale))).toHaveLength(0)
    refreshDelayMs = 5
  })
})

describe('no unconditional refresh timer', () => {
  it('useAuth no longer refreshes every 10 minutes: the next request does it, only when needed', () => {
    // Every refresh rotates the 30-day refresh token, so a session slides on use
    // either way; the timer only added a request per 10 minutes, idle or not.
    const src = readFileSync(join(__dirname, '..', 'lib', 'useAuth.ts'), 'utf8')
    expect(src).not.toMatch(/setInterval/)
  })
})
