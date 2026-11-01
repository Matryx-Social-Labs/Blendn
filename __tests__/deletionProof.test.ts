/**
 * Deleting an account proves it is the owner's (SCRUM-944 (3), owner row A-18), and an Apple account's grant is revoked
 * (App Review 5.1.1(v)).
 *
 * - `appleProofForDeletion` asks the Apple sheet for a fresh identity token (and the code that revokes the grant);
 *   `googleProofForDeletion` asks Google for a fresh ID token. Cancelled, unavailable or failed: null, and nothing is deleted.
 * - `apiClient.deleteAccount` sends only the proof's keys, and no body without one.
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
const mockPlatform = { OS: 'ios' }
jest.mock('react-native', () => ({
  Platform: mockPlatform,
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))
const mockApple = { isAvailableAsync: jest.fn(), signInAsync: jest.fn() }
jest.mock('expo-apple-authentication', () => mockApple)
const mockGoogle = { configure: jest.fn(), hasPlayServices: jest.fn(async () => true), signIn: jest.fn() }
jest.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: mockGoogle }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { appleProofForDeletion, googleProofForDeletion } = require('../lib/deletionProof') as typeof import('../lib/deletionProof')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Logger } = require('../lib/logger') as typeof import('../lib/logger')

beforeEach(() => {
  jest.clearAllMocks()
  mockApple.isAvailableAsync.mockResolvedValue(true)
})

describe('appleProofForDeletion', () => {
  it('opens the Apple sheet asking for nothing, and answers its identity token with the code', async () => {
    mockApple.signInAsync.mockResolvedValue({ authorizationCode: 'c0de', identityToken: 'id' })
    expect(await appleProofForDeletion()).toEqual({ appleIdentityToken: 'id', appleAuthorizationCode: 'c0de' })
    expect(mockApple.signInAsync).toHaveBeenCalledWith({ requestedScopes: [] })
  })

  it('answers null when the person cancels the sheet, and logs nothing: cancelling is a choice, not a failure', async () => {
    mockApple.signInAsync.mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }))
    expect(await appleProofForDeletion()).toBeNull()
    expect(Logger.warn).not.toHaveBeenCalled()
  })

  it('answers null without a sheet where Sign in with Apple is not available (Android)', async () => {
    mockApple.isAvailableAsync.mockResolvedValue(false)
    expect(await appleProofForDeletion()).toBeNull()
    expect(mockApple.signInAsync).not.toHaveBeenCalled()
  })

  it('answers null, and logs it, when Apple fails or hands back no identity token', async () => {
    mockApple.signInAsync.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ERR_REQUEST_FAILED' }))
    expect(await appleProofForDeletion()).toBeNull()
    expect(Logger.warn).toHaveBeenCalledTimes(1)
    mockApple.signInAsync.mockResolvedValue({ authorizationCode: 'c0de', identityToken: null })
    expect(await appleProofForDeletion()).toBeNull()
  })
})

describe('googleProofForDeletion', () => {
  afterEach(() => {
    mockPlatform.OS = 'ios'
  })

  it('configures Google itself (a restored session never mounted sign-in) and answers the fresh ID token', async () => {
    mockGoogle.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'g-id' } })
    expect(await googleProofForDeletion()).toEqual({ googleIdToken: 'g-id' })
    expect(mockGoogle.configure).toHaveBeenCalledTimes(1)
    expect(mockGoogle.hasPlayServices).not.toHaveBeenCalled()
  })

  it('checks Play services first on Android', async () => {
    mockPlatform.OS = 'android'
    mockGoogle.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'g-id' } })
    expect(await googleProofForDeletion()).toEqual({ googleIdToken: 'g-id' })
    expect(mockGoogle.hasPlayServices).toHaveBeenCalledTimes(1)
  })

  it('answers null when the chooser is cancelled or Google throws', async () => {
    mockGoogle.signIn.mockResolvedValue({ type: 'cancelled', data: null })
    expect(await googleProofForDeletion()).toBeNull()
    mockGoogle.signIn.mockRejectedValue(new Error('boom'))
    expect(await googleProofForDeletion()).toBeNull()
    expect(Logger.warn).toHaveBeenCalledTimes(1)
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

  it('carries the proof’s keys and nothing else', async () => {
    const seen = server()
    expect(await apiClient.deleteAccount({ appleIdentityToken: 'id', appleAuthorizationCode: 'c0de' })).toMatchObject({ success: true })
    // A delete that worked signs the phone out: sign back in for the second.
    await TokenStorage.setAccessToken('tok')
    await TokenStorage.setRefreshToken('ref')
    await apiClient.deleteAccount({ password: 'pw', googleIdToken: '' })
    expect(seen).toEqual([
      { method: 'DELETE', path: '/api/mobile/account', body: { appleIdentityToken: 'id', appleAuthorizationCode: 'c0de' } },
      { method: 'DELETE', path: '/api/mobile/account', body: { password: 'pw' } },
    ])
  })

  it('sends no body without a proof', async () => {
    const seen = server()
    await apiClient.deleteAccount()
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/mobile/account', body: undefined }])
  })
})
