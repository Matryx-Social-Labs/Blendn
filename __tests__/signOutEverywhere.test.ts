/**
 * Sign out everywhere clears nothing until the server has ended the sessions: the real client, a scripted server.
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
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'active' } }))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(async () => {
  mockSecure.clear()
  await TokenStorage.setTokens('access-1', 'refresh-1')
})

it('names no refresh token (the server then ends every session), and clears the tokens once it said yes', async () => {
  let body: Record<string, unknown> = {}
  global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return json(200, { success: true, data: { message: 'Signed out from all devices' } })
  }) as typeof fetch
  const result = await apiClient.signOutEverywhere()
  expect(result.success).toBe(true)
  expect(body.refreshToken).toBeUndefined()
  expect(await TokenStorage.getRefreshToken()).toBeNull()
  expect(await TokenStorage.getAccessToken()).toBeNull()
})

it('a server that cannot be reached clears nothing: the phone is still signed in, and says so', async () => {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed')
  }) as typeof fetch
  const result = await apiClient.signOutEverywhere()
  expect(result.success).toBe(false)
  expect(await TokenStorage.getRefreshToken()).toBe('refresh-1')
  expect(await TokenStorage.getAccessToken()).toBe('access-1')
})

it('a server that refuses (5xx) clears nothing either', async () => {
  global.fetch = jest.fn(async () => json(503, { success: false, error: 'down', errorCode: 'MAINTENANCE' })) as typeof fetch
  const result = await apiClient.signOutEverywhere()
  expect(result.success).toBe(false)
  expect(await TokenStorage.getRefreshToken()).toBe('refresh-1')
})
