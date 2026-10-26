/**
 * The upload URL is asked for with the file's size (signed into the URL by the
 * server, so the PUT cannot carry more), and every request names the build in
 * `X-App-Version`, which the server's version gates read (blendn-admin M6).
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
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.1', nativeBuildVersion: '130' }))
// `lib/appVersion` reads expo-constants beside it (its fallback); unmocked, the require throws and the build reads 'unknown'.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.1' } } }))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

beforeEach(async () => { mockSecure.clear(); await TokenStorage.setAccessToken('tok') })

it('asks for the upload URL with the size and names the build', async () => {
  const calls: { body: unknown; headers: Record<string, string> }[] = []
  global.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> })
    return new Response(JSON.stringify({ success: true, data: { uploadUrl: 'u', publicUrl: 'p' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  await apiClient.getPresignedUploadUrl('a.jpg', 'image/jpeg', 'chat', 123456)
  expect(calls).toHaveLength(1)
  expect(calls[0].body).toEqual({ filename: 'a.jpg', contentType: 'image/jpeg', folder: 'chat', size: 123456 })
  expect(calls[0].headers['X-App-Version']).toBe('1.0.1')
})
