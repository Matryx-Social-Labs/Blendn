/**
 * Railway logs the query string, so a position never leaves in a URL at more than three decimals (about 110 m):
 * the events list the Pulse sends, Places' list, an event's detail. A check-in (and go live, a presence ping)
 * needs the precision and sends it in the BODY, which is not logged and is not rounded.
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
const { roundCoordinate, COORD_DECIMALS } = require('../lib/coordinates') as typeof import('../lib/coordinates')

type Seen = { method: string; url: string; body: any }
function server() {
  const seen: Seen[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ method: init?.method ?? 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return new Response(JSON.stringify({ success: true, data: { events: [], venues: [], pagination: { page: 1, limit: 1, totalCount: 0, totalPages: 0, hasMore: false } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return seen
}
beforeEach(async () => {
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  await TokenStorage.setRefreshToken('ref')
})

const LAT = 12.971598765
const LON = 77.594566123
/** Any number in the query with more digits after the point than the rounded precision. */
const tooPrecise = (url: string) => new RegExp(`=-?\\d+\\.\\d{${COORD_DECIMALS + 1},}`).test(url.split('?')[1] ?? '')

describe('a position in a URL', () => {
  it('rounds to three decimals, one helper for every pane', () => {
    expect(roundCoordinate(LAT)).toBe(12.972)
    expect(roundCoordinate(LON)).toBe(77.595)
    expect(roundCoordinate(-33.8688197)).toBe(-33.869)
    expect(roundCoordinate(12.97)).toBe(12.97)
  })

  it('the events list the Pulse sends carries lat and lon rounded', async () => {
    const seen = server()
    await apiClient.getEvents({ page: 1, limit: 50, city: 'Bengaluru', lat: LAT, lon: LON, include: 'checkins' }, { force: true })
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toContain('lat=12.972')
    expect(seen[0].url).toContain('lon=77.595')
    expect(tooPrecise(seen[0].url)).toBe(false)
  })

  it('every list that sends one is rounded: the Pulse’s featured, weekend and for-you reads, Places, a map viewport, an event’s detail', async () => {
    const seen = server()
    const where = { city: 'Bengaluru', lat: LAT, lon: LON }
    await apiClient.getEvents({ page: 1, limit: 5, ...where, featured: true }, { force: true })
    await apiClient.getEvents({ page: 1, limit: 20, ...where, startDate: '2026-10-23T17:00:00.000Z' }, { force: true })
    await apiClient.getEvents({ page: 1, limit: 12, ...where, categorySlug: 'jazz' })
    await apiClient.getVenues({ page: 1, limit: 30, ...where, sortBy: 'distance' }, { force: true })
    await apiClient.getVenues({ page: 1, limit: 5, ...where, sortBy: 'distance' })
    await apiClient.getEvents({ lat: LAT, lon: LON, radius: 2.337 })
    await apiClient.getEvent('e1', { lat: LAT, lon: LON })
    expect(seen.length).toBeGreaterThanOrEqual(7)
    for (const s of seen) {
      expect(s.url).toMatch(/lat=12\.972/)
      expect(tooPrecise(s.url)).toBe(false)
    }
    // Only coordinates are rounded: the radius is a distance the server needs as sent.
    expect(seen.some((s) => s.url.includes('radius=2.337'))).toBe(true)
  })

  it('check-in and go live keep the precision, in the body', async () => {
    const seen = server()
    await apiClient.checkIn('e1', { latitude: LAT, longitude: LON, deviceInfo: { gpsAccuracy: 8 } })
    await apiClient.goLive('v1', { latitude: LAT, longitude: LON, minutes: 20 })
    const bodies = seen.filter((s) => s.body)
    expect(bodies).toHaveLength(2)
    for (const s of bodies) expect(s.body).toMatchObject({ latitude: LAT, longitude: LON })
    for (const s of seen) expect(s.url).not.toMatch(/lat/)
  })
})
