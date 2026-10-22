/**
 * The conversations read carries a `limit` on the first page too (SCRUM-760, server review #724): with none the server answers up
 * to 200 to an installed build. Driven through the real client against a scripted server.
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
// See session-end-reason.test.ts: apiClient's AppState timer outlives the test.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')

type Seen = { method: string; path: string; body: unknown; auth: string | undefined }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function server(answer: (seen: Seen) => Response) {
  const seen: Seen[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const s: Seen = {
      method: init?.method ?? 'GET',
      path: String(input).replace(/^https?:\/\/[^/]+/, ''),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.Authorization,
    }
    seen.push(s)
    return answer(s)
  }) as typeof fetch
  return seen
}

const ok = (data: unknown) => () => json(200, { success: true, data })

beforeEach(async () => {
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  await TokenStorage.setRefreshToken('ref')
})

it('asks for a page of 50 on the first read, forced or cached', async () => {
  const seen = server(ok({ conversations: [] }))
  await apiClient.getConversations({ force: true })
  expect(seen.map((s) => s.path)).toEqual(['/api/mobile/conversations?limit=50'])
  expect(seen[0].method).toBe('GET')
})

it('and the cached read asks the same', async () => {
  const seen = server(ok({ conversations: [] }))
  await apiClient.getConversations()
  expect(seen[0].path).toBe('/api/mobile/conversations?limit=50')
})
