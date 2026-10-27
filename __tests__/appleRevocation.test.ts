/**
 * Deleting an Apple account (App Review 5.1.1(v)): the client's half of revoking the Sign in with Apple grant.
 *
 * - `appleCodeForDeletion` asks the Apple sheet for a fresh `authorizationCode`, and never stands in the way of the
 *   delete: cancelled, unavailable or failed, it answers null.
 * - `apiClient.deleteAccount` sends it as `appleAuthorizationCode` (blendn-admin `feat/app-review-server`), and sends no
 *   body without one, exactly as before.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { mockSecure.set(k, v) },
  deleteItemAsync: async (k: string) => { mockSecure.delete(k) },
}))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
const mockApple = { isAvailableAsync: jest.fn(), signInAsync: jest.fn() }
jest.mock('expo-apple-authentication', () => mockApple)

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { appleCodeForDeletion } = require('../lib/appleRevocation') as typeof import('../lib/appleRevocation')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Logger } = require('../lib/logger') as typeof import('../lib/logger')

beforeEach(() => {
  jest.clearAllMocks()
  mockApple.isAvailableAsync.mockResolvedValue(true)
})

describe('appleCodeForDeletion', () => {
  it('opens the Apple sheet asking for nothing but a code, and answers the code', async () => {
    mockApple.signInAsync.mockResolvedValue({ authorizationCode: 'c0de', identityToken: 'id' })
    expect(await appleCodeForDeletion()).toBe('c0de')
    expect(mockApple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [] })
  })

  it('answers null when the person cancels the sheet, and logs nothing: cancelling is a choice, not a failure', async () => {
    mockApple.signInAsync.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }))
    expect(await appleCodeForDeletion()).toBeNull()
    expect(Logger.warn).not.toHaveBeenCalled()
  })

  it('answers null without a sheet where Sign in with Apple is not available (Android)', async () => {
    mockApple.isAvailableAsync.mockResolvedValue(false)
    expect(await appleCodeForDeletion()).toBeNull()
    expect(mockApple.signInAsync).not.toHaveBeenCalled()
  })

  it('answers null, and logs it, when Apple fails or hands back no code', async () => {
    mockApple.signInAsync.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ERR_REQUEST_FAILED' }))
    expect(await appleCodeForDeletion()).toBeNull()
    expect(Logger.warn).toHaveBeenCalledTimes(1)
    mockApple.signInAsync.mockResolvedValue({ authorizationCode: null })
    expect(await appleCodeForDeletion()).toBeNull()
  })
})

describe('DELETE /api/mobile/account on the wire', () => {
  type Seen = { method: string; path: string; body: unknown }
  function server() {
    const seen: Seen[] = []
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ method: init?.method ?? 'GET', path: String(input).replace(/^https?:\/\/[^/]+/, ''), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(JSON.stringify({ success: true, data: { deleted: true } }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    return seen
  }
  beforeEach(async () => {
    mockSecure.clear()
    await TokenStorage.setAccessToken('tok')
    await TokenStorage.setRefreshToken('ref')
  })

  it('carries the Apple code as appleAuthorizationCode', async () => {
    const seen = server()
    expect(await apiClient.deleteAccount('c0de')).toMatchObject({ success: true })
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/mobile/account', body: { appleAuthorizationCode: 'c0de' } }])
  })

  it('sends no body without one, as every build before this did', async () => {
    const seen = server()
    await apiClient.deleteAccount()
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/mobile/account', body: undefined }])
  })
})
