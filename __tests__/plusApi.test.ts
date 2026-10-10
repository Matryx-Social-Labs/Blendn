/**
 * Blendn+ through the real client against a scripted server, in the SERVER's
 * shapes (blendn-admin step 11: `GET /me/plus`, `POST /me/plus/paywall-events`,
 * Go Live's `PLUS_REQUIRED`, `/me/attendance`'s `lockedCount`).
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

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { goLiveRefusal } = require('../lib/goLive') as typeof import('../lib/goLive')

type Seen = { method: string; path: string; body: unknown }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
function server(answer: (s: Seen) => Response) {
  const seen: Seen[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const s = { method: init?.method ?? 'GET', path: String(input).replace(/^https?:\/\/[^/]+/, ''), body: init?.body ? JSON.parse(String(init.body)) : undefined }
    seen.push(s)
    return answer(s)
  }) as typeof fetch
  return seen
}
beforeEach(async () => { mockSecure.clear(); await TokenStorage.setAccessToken('tok'); await TokenStorage.setRefreshToken('ref') })

describe('Blendn+ on the wire', () => {
  it('GET /me/plus: the server\'s status, as sent', async () => {
    const data = { active: true, product: 'night_pass', source: 'apple', expiresAt: '2026-10-11T18:00:00.000Z' }
    const seen = server(() => json(200, { success: true, data }))
    expect(await apiClient.getMyPlus()).toMatchObject({ success: true, data })
    expect(seen).toEqual([{ method: 'GET', path: '/api/mobile/me/plus', body: undefined }])
  })

  it('POST /me/plus/paywall-events: exactly { event, trigger }', async () => {
    const seen = server(() => json(200, { success: true, data: { recorded: true } }))
    await apiClient.logPaywallEvent('dismissed', 'go_live_expiry')
    expect(seen).toEqual([{ method: 'POST', path: '/api/mobile/me/plus/paywall-events', body: { event: 'dismissed', trigger: 'go_live_expiry' } }])
  })

  it('Go Live "stay" refused with 403 PLUS_REQUIRED reads as the paywall, not a failure', async () => {
    server(() => json(403, { success: false, error: 'Staying live is part of Blendn+.', errorCode: 'PLUS_REQUIRED' }))
    const result = await apiClient.goLive('v1', { latitude: 1, longitude: 2, stay: true })
    expect(result).toMatchObject({ success: false, errorCode: 'PLUS_REQUIRED' })
    expect(goLiveRefusal(result.errorCode, result.error)).toEqual({ kind: 'plus' })
  })

  it('/me/attendance carries lockedCount beside the (at most 3) nights', async () => {
    server(() => json(200, { success: true, data: { events: [], lockedCount: 7 } }))
    expect((await apiClient.getMyAttendance()).data?.lockedCount).toBe(7)
  })
})
