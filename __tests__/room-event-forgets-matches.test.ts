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

/*
 * A read already on the wire when the event arrives was answered before it:
 * the next read must not join it, and its answer must not refill the cache.
 * The common shape is SWR's own background refresh — every sync more than 30
 * seconds after the last one starts one.
 */
describe('a read in flight at the event', () => {
  type Pending = { path: string; answer: (body: unknown) => void }
  const pending: Pending[] = []
  const settle = () => new Promise((r) => setTimeout(r, 30))

  beforeEach(async () => {
    pending.length = 0
    mockSecure.clear()
    await TokenStorage.setAccessToken('tok')
    global.fetch = jest.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) =>
          pending.push({
            path: String(input).replace(/^https?:\/\/[^/]+/, ''),
            answer: (body) => resolve(json(body)),
          })
        )
    ) as typeof fetch
  })

  it('is not joined by the next read, and does not refill the cache', async () => {
    const before = apiClient.getEventMatches('e3', { limit: 20 })
    await settle()
    expect(pending).toHaveLength(1)

    apiClient.forgetEventMatches('e3')
    const after = apiClient.getEventMatches('e3', { limit: 20 })
    await settle()
    // A second request, not the first one's promise.
    expect(pending).toHaveLength(2)

    pending[0].answer({ success: true, data: { matches: [{ id: 'old' }] } })
    await expect(before).resolves.toMatchObject({ data: { matches: [{ id: 'old' }] } })
    // The old read finishing must not unregister the new one: a third read
    // still joins it rather than going out again.
    const third = apiClient.getEventMatches('e3', { limit: 20 })
    await settle()
    expect(pending).toHaveLength(2)

    pending[1].answer({ success: true, data: { matches: [{ id: 'new' }] } })
    await expect(after).resolves.toMatchObject({ data: { matches: [{ id: 'new' }] } })
    await expect(third).resolves.toMatchObject({ data: { matches: [{ id: 'new' }] } })

    // And the cache holds the answer given after the event.
    await expect(apiClient.getEventMatches('e3', { limit: 20 })).resolves.toMatchObject({
      data: { matches: [{ id: 'new' }] },
    })
    expect(pending).toHaveLength(2)
  })

  it("drops the old answer even when it lands after the event's read is done", async () => {
    const before = apiClient.getEventMatches('e4', { limit: 20 })
    await settle()
    apiClient.forgetEventMatches('e4')
    const after = apiClient.getEventMatches('e4', { limit: 20 })
    await settle()

    pending[1].answer({ success: true, data: { matches: [{ id: 'new' }] } })
    await after
    pending[0].answer({ success: true, data: { matches: [{ id: 'old' }] } })
    await before

    await expect(apiClient.getEventMatches('e4', { limit: 20 })).resolves.toMatchObject({
      data: { matches: [{ id: 'new' }] },
    })
  })
})

describe("SWR's background refresh in flight at the event", () => {
  type Pending = { answer: (body: unknown) => void }
  const pending: Pending[] = []
  const settle = () => new Promise((r) => setTimeout(r, 30))
  const matches = (id: string) => ({ success: true, data: { matches: [{ id }] } })

  beforeEach(async () => {
    pending.length = 0
    mockSecure.clear()
    await TokenStorage.setAccessToken('tok')
    global.fetch = jest.fn(
      () => new Promise<Response>((resolve) => pending.push({ answer: (body) => resolve(json(body)) }))
    ) as typeof fetch
  })
  afterEach(() => jest.restoreAllMocks())

  it('does not put its older answer back over the one fetched after the event', async () => {
    const first = apiClient.getEventMatches('e5', { limit: 20 })
    await settle()
    pending[0].answer(matches('first'))
    await first

    // 31 seconds on: expired, so served as-is with a refresh behind it.
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now + 31_000)
    await expect(apiClient.getEventMatches('e5', { limit: 20 })).resolves.toMatchObject(matches('first'))
    await settle()
    expect(pending).toHaveLength(2)

    apiClient.forgetEventMatches('e5')
    const after = apiClient.getEventMatches('e5', { limit: 20 })
    await settle()
    expect(pending).toHaveLength(3)
    pending[2].answer(matches('new'))
    await after
    pending[1].answer(matches('refresh'))
    await settle()

    await expect(apiClient.getEventMatches('e5', { limit: 20 })).resolves.toMatchObject(matches('new'))
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
