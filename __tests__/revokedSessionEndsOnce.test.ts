/**
 * SCRUM-879: a password reset or a sign-out-everywhere revokes this phone's session while the app is open. The app stayed on
 * its screen showing "Couldn't load your chats" and sent about 29 refused requests a minute until a relaunch. The refresh
 * says why (a named reason on a 401), and that must end the session here once, the way a relaunch does: the reason stored,
 * the local session reset, the entry screen next, and no request after.
 *
 * Drives the real client and the real auth state, with a scripted server and token storage in memory.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockSecure.set(k, v),
  deleteItemAsync: async (k: string) => void mockSecure.delete(k),
}))
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }) } }))
jest.mock('../lib/appVersion', () => ({ appVersionNumber: () => '1.0.0', appBuildNumber: () => null }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('../lib/notifications', () => ({}))
jest.mock('../lib/socketClient', () => ({ socketClient: { disconnect: jest.fn() } }))
jest.mock('../lib/goLive', () => ({ clearLiveSession: jest.fn() }))
jest.mock('../lib/purchases', () => ({ syncPurchasesUser: jest.fn(async () => {}) }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { getCurrentUser, signInWithEmail } = require('../lib/useAuth') as typeof import('../lib/useAuth')
const { consumeSessionEnd } = require('../lib/sessionEvents') as typeof import('../lib/sessionEvents')
/* eslint-enable @typescript-eslint/no-require-imports */

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const settle = () => new Promise((r) => setTimeout(r, 20))
const user = { id: 'u1', email: 'a@b.c', name: 'Sam', image: null, emailVerified: null, createdAt: '2026-01-01', signInMethod: 'password', profile: null }

let calls: string[]
function revokedServer(code: string) {
  calls = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url.replace(/^https?:\/\/[^/]+/, '')}`)
    if (url.endsWith('/api/mobile/auth/refresh')) return json(401, { success: false, error: 'Invalid or expired refresh token', errorCode: 'UNAUTHORIZED', reasonCode: code })
    return json(401, { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED', reasonCode: code })
  }) as typeof fetch
}

beforeEach(async () => {
  mockSecure.clear()
  jest.spyOn(apiClient, 'signInWithEmail').mockResolvedValue({ success: true, data: { user, accessToken: 'a1', refreshToken: 'r1' } } as never)
  await TokenStorage.setTokens('a1', 'r1')
  await signInWithEmail('a@b.c', 'pw')
  await TokenStorage.setTokens('a1', 'r1')
})

describe.each([['SESSION_REVOKED_ELSEWHERE', 'elsewhere'], ['PASSWORD_RESET', 'reset']])('a session revoked by %s while the app is open', (code, reason) => {
  it('ends once: the user is gone, the reason is stored, and no request follows', async () => {
    revokedServer(code)
    // A screen's worth of reads at once, as the chats list, the bell and the Pulse make them.
    await Promise.all(Array.from({ length: 12 }, (_, i) => apiClient.getChatMessages(`g${i}`)))
    await settle()
    expect(await getCurrentUser()).toBeNull()
    expect(await TokenStorage.getRefreshToken()).toBeNull()
    expect((await consumeSessionEnd())?.reason).toBe(reason)
    const used = calls.length
    // Everything after is answered here, without the network: no storm until a relaunch.
    for (let i = 0; i < 30; i++) await apiClient.getChatGroups()
    await settle()
    expect(calls.length).toBe(used)
    expect(calls.filter((c) => c.endsWith('/auth/refresh')).length).toBe(1)
  })
})

describe('a refresh nobody was waiting on (the timer, the foreground)', () => {
  it('refused with a named reason ends the session at once, without waiting for a screen to ask', async () => {
    revokedServer('PASSWORD_RESET')
    await expect(apiClient.refreshSessionOutcome()).resolves.toBe('rejected')
    await settle()
    expect(await getCurrentUser()).toBeNull()
    expect((await consumeSessionEnd())?.reason).toBe('reset')
    expect(calls).toEqual(['POST /api/mobile/auth/refresh'])
  })

  it('refused with no named reason is left to the next request, as before', async () => {
    revokedServer('')
    await expect(apiClient.refreshSessionOutcome()).resolves.toBe('rejected')
    await settle()
    expect(await getCurrentUser()).not.toBeNull()
  })
})
