/**
 * A check-in or check-out in the room drops the room's cached matches
 * (SCRUM-502).
 *
 * The event marks the `match` domain dirty, and the sync that follows reads
 * `getEventMatches` through its 30-second SWR cache — which serves an expired
 * entry as-is and refreshes behind it. So the snapshot from *before* the event
 * was applied over the live state the event had just set: somebody who walked
 * back in read "Was here" for minutes, while the server said inside.
 *
 * Not by forcing the sync: `force` means a human asked (fetchPolicy.test.ts).
 * The event is proof the cached snapshot is old, so the entry goes, and the
 * unforced read that follows misses and asks the server.
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

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('forgetEventMatches', () => {
  const asked: string[] = []

  beforeEach(async () => {
    asked.length = 0
    mockSecure.clear()
    await TokenStorage.setAccessToken('tok')
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, '')
      asked.push(path)
      return json({ success: true, data: { matches: [{ id: path }] } })
    }) as typeof fetch
  })

  it("makes the room's next unforced read ask the server", async () => {
    await apiClient.getEventMatches('e1', { limit: 20 })
    await apiClient.getEventMatches('e1', { limit: 20 })
    expect(asked).toEqual(['/api/mobile/events/e1/matches?limit=20'])

    apiClient.forgetEventMatches('e1')
    await apiClient.getEventMatches('e1', { limit: 20 })
    expect(asked).toEqual(['/api/mobile/events/e1/matches?limit=20', '/api/mobile/events/e1/matches?limit=20'])
  })

  it('leaves every other room, and the event itself, cached', async () => {
    await apiClient.getEventMatches('e2', { limit: 20 })
    await apiClient.getEventMatches('e22', { limit: 20 })
    await apiClient.getEvent('e2')
    asked.length = 0

    apiClient.forgetEventMatches('e2')
    await apiClient.getEventMatches('e22', { limit: 20 })
    await apiClient.getEvent('e2')
    expect(asked).toEqual([])
  })
})

describe('the socket forgets before it marks the room dirty', () => {
  const src = readFileSync(join(__dirname, '..', 'lib', 'socketClient.ts'), 'utf8')

  it.each(['event:checkin', 'event:room:checkin', 'event:checkout'])('%s', (name) => {
    // First, because marking the domain dirty is what starts the sync.
    const handler = new RegExp(
      `sock\\.on\\("${name}", \\(data\\) => \\{\\s*apiClient\\.forgetEventMatches\\(data\\.eventId\\)\\s*markDomainsDirty`
    )
    expect(src).toMatch(handler)
  })
})
