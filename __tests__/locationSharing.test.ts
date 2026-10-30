/**
 * "Share location for nearby events" switches something (SCRUM-908).
 *
 * `profiles.share_location` was written by Settings and onboarding and read by nothing. With it off, no position leaves
 * the phone for an events list, Places or an event's detail (the reads that sort and label by distance). A check-in
 * (a body, not a URL) is a different act and is not this switch.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

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
const { setLocationSharing, locationSharingOn } = require('../lib/shareLocation') as typeof import('../lib/shareLocation')

function server(ok = true) {
  const urls: string[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return new Response(JSON.stringify(ok ? { success: true, data: { events: [], venues: [] } } : { success: false, error: 'no' }), {
      status: ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return urls
}
beforeEach(async () => {
  mockSecure.clear()
  setLocationSharing(true)
  await TokenStorage.setAccessToken('tok')
  await TokenStorage.setRefreshToken('ref')
})

const LAT = 12.971598
const LON = 77.594566
const reads = async () => {
  await apiClient.getEvents({ page: 1, city: 'Bengaluru', lat: LAT, lon: LON, radius: 5 }, { force: true })
  await apiClient.getVenues({ page: 1, city: 'Bengaluru', lat: LAT, lon: LON, sortBy: 'distance' }, { force: true })
  await apiClient.getEvent('e1', { lat: LAT, lon: LON, include: 'checkins' })
}

describe('with sharing on (the default)', () => {
  it('the distance reads carry the position', async () => {
    const urls = server()
    await reads()
    expect(urls).toHaveLength(3)
    for (const url of urls) expect(url).toMatch(/lat=12\.972.*lon=77\.595|lon=77\.595.*lat=12\.972/)
  })

  it('a profile that says nothing is on', () => {
    setLocationSharing(undefined)
    expect(locationSharingOn()).toBe(true)
  })
})

describe('with sharing off', () => {
  it('no position leaves for an events list, Places or an event’s detail, and the rest of each question does', async () => {
    setLocationSharing(false)
    const urls = server()
    await reads()
    expect(urls).toHaveLength(3)
    for (const url of urls) expect(url).not.toMatch(/[?&](lat|lon)=/)
    expect(urls[0]).toContain('city=Bengaluru')
    expect(urls[1]).toContain('city=Bengaluru')
    expect(urls[2]).toContain('include=checkins')
  })

  it('a radius or a distance sort that needs the position goes with it, so the server is not asked for what it cannot do', async () => {
    setLocationSharing(false)
    const urls = server()
    await apiClient.getEvents({ page: 1, lat: LAT, lon: LON, radius: 5, sortBy: 'distance' }, { force: true })
    await apiClient.getEvents({ page: 1, lat: LAT, lon: LON, sortBy: 'start_time' }, { force: true })
    await apiClient.getVenues({ page: 1, lat: LAT, lon: LON, radius: 2, sortBy: 'name' }, { force: true })
    expect(urls[0]).not.toMatch(/radius=|sortBy=/)
    expect(urls[1]).toContain('sortBy=start_time')
    expect(urls[2]).toContain('sortBy=name')
    expect(urls[2]).not.toContain('radius=')
  })

  it('the map’s viewport is where the camera is, not where you are: it still goes', async () => {
    setLocationSharing(false)
    const urls = server()
    await apiClient.getEvents({ lat: LAT, lon: LON, radius: 3 }, { force: true, viewport: true })
    await apiClient.getVenues({ lat: LAT, lon: LON, radius: 3, sortBy: 'distance' }, { force: true, viewport: true })
    for (const url of urls) expect(url).toMatch(/lat=12\.972/)
    expect(urls[0]).toContain('radius=3')
  })

  it('saving the switch in Settings is what turns it off and on', async () => {
    server()
    await apiClient.updateProfile('u1', { share_location: false })
    expect(locationSharingOn()).toBe(false)
    await apiClient.updateProfile('u1', { share_location: true })
    expect(locationSharingOn()).toBe(true)
  })

  it('a save the server refused changes nothing', async () => {
    server(false)
    await apiClient.updateProfile('u1', { share_location: false })
    expect(locationSharingOn()).toBe(true)
  })

  it('another preference saved leaves it alone', async () => {
    setLocationSharing(false)
    server()
    await apiClient.updateProfile('u1', { read_receipts: false })
    expect(locationSharingOn()).toBe(false)
  })
})

describe('where the switch comes from', () => {
  it('a session read, sign-in or sign-out sets it from the account (every path goes through updateAuthState)', () => {
    const src = readFileSync(join(__dirname, '..', 'lib', 'useAuth.ts'), 'utf8')
    const body = src.slice(src.indexOf('const updateAuthState'), src.indexOf('// Initialize auth system once'))
    expect(body).toMatch(/setLocationSharing\(globalAuthState\.user\?\.profile\?\.share_location\)/)
  })
})
