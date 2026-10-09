/**
 * Go Live through the real client against a scripted server, in the SERVER's shapes
 * (blendn-admin app/api/mobile/venues/[venueId]/live/route.ts, lib/api-response.ts).
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

type Seen = { method: string; path: string; body: any }
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

describe('POST /venues/:id/live as the door reads it', () => {
  it('sends the fix and the window in the keys the server reads, once', async () => {
    const seen = server(() => json(200, { success: true, data: { venueDayId: 'd1', chatGroupId: 'g1', expiresAt: '2026-10-09T20:20:00.000Z', stay: false, stayUntil: null, checkIn: { id: 'c', status: 'checked_in', checkInTime: 'x' }, revealSuggestion: false, intentNeeded: false } }))
    await apiClient.goLive('v 1', { latitude: 12.97, longitude: 77.59, deviceInfo: { platform: 'ios', gpsAccuracy: 12 }, minutes: 20 })
    expect(seen).toEqual([{ method: 'POST', path: '/api/mobile/venues/v%201/live', body: { latitude: 12.97, longitude: 77.59, deviceInfo: { platform: 'ios', gpsAccuracy: 12 }, minutes: 20 } }])
  })

  it('EVENT_LIVE_HERE: the 409 body carries the event, and the refusal built from the RESULT is a hand-off', async () => {
    server(() => json(409, { success: false, error: 'Friday session is on here. Check in to it instead.', errorCode: 'EVENT_LIVE_HERE', eventId: 'e1' }))
    const result = await apiClient.goLive('v1', { latitude: 1, longitude: 2, minutes: 20 })
    expect(result).toMatchObject({ success: false, errorCode: 'EVENT_LIVE_HERE', eventId: 'e1' })
    expect(goLiveRefusal(result.errorCode, result.error, result.eventId)).toMatchObject({ kind: 'handoff', eventId: 'e1' })
  })

  it('NOT_LIVE: a 403 from the room carries its code (GET /chat/groups/:id/messages)', async () => {
    server(() => json(403, { success: false, error: "You're not live here any more. Go live at the venue to join today's room.", errorCode: 'NOT_LIVE' }))
    expect(await apiClient.getChatMessages('g1' as never)).toMatchObject({ success: false, errorCode: 'NOT_LIVE' })
  })
})
