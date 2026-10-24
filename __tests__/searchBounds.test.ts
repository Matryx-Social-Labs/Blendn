/**
 * A search the server would refuse is never sent (admin #751: `search` is trimmed and 2 to 100 characters, else a 400
 * `VALIDATION_FAILED` with `reasonCode: SEARCH_TOO_SHORT`). Under 2 the list is the normal one; a field holds 100; and a
 * SEARCH_TOO_SHORT that comes back anyway is no search, never an error state.
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
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({ Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SEARCH_MAX, searchTermOf } = require('../lib/searchTerm') as typeof import('../lib/searchTerm')

const LIST = { success: true, data: { events: [], venues: [], pagination: { page: 1, limit: 1, totalCount: 0, totalPages: 0, hasMore: false } } }
const TOO_SHORT = { success: false, error: 'Search for at least 2 characters.', errorCode: 'VALIDATION_FAILED', reasonCode: 'SEARCH_TOO_SHORT' }

/** The server: every URL it was asked, answering `refuse` (a 400) to any that carries a search. */
function server(refuse: object | null = null) {
  const urls: string[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    const refused = refuse && /[?&]search=/.test(url)
    return new Response(JSON.stringify(refused ? refuse : LIST), { status: refused ? 400 : 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return urls
}
beforeEach(async () => {
  mockSecure.clear()
  await TokenStorage.setAccessToken('tok')
  await TokenStorage.setRefreshToken('ref')
})

describe('the term a list is searched by', () => {
  it('is the trimmed words from 2 characters, and nothing under', () => {
    expect(searchTermOf('')).toBeNull()
    expect(searchTermOf(' a ')).toBeNull()
    expect(searchTermOf('   ')).toBeNull()
    expect(searchTermOf(undefined)).toBeNull()
    expect(searchTermOf(' ab ')).toBe('ab')
  })

  it('holds at most 100 characters', () => {
    expect(searchTermOf('x'.repeat(140))).toHaveLength(SEARCH_MAX)
  })
})

describe('what the Pulse and Places send', () => {
  it('one letter is no search: the events list and the places list go without it', async () => {
    const urls = server()
    await apiClient.getEvents({ page: 1, search: 'a' }, { force: true })
    await apiClient.getVenues({ page: 1, search: ' b ' }, { force: true })
    expect(urls).toHaveLength(2)
    for (const url of urls) expect(url).not.toContain('search=')
  })

  it('two letters and more are sent, trimmed and capped', async () => {
    const urls = server()
    await apiClient.getEvents({ page: 1, search: ' jazz ' }, { force: true })
    await apiClient.getVenues({ page: 1, search: 'y'.repeat(140) }, { force: true })
    const searchOf = (url: string) => new URL(url).searchParams.get('search')
    expect(searchOf(urls[0])).toBe('jazz')
    expect(searchOf(urls[1])).toBe('y'.repeat(SEARCH_MAX))
  })

  it('a SEARCH_TOO_SHORT that comes back anyway is no search: the normal list, never an error', async () => {
    const urls = server(TOO_SHORT)
    const result = await apiClient.getEvents({ page: 1, search: 'jazz' }, { force: true })
    expect(result.success).toBe(true)
    expect(urls).toHaveLength(2)
    expect(urls[1]).not.toContain('search=')
  })
})

it('the Pulse narrows only on a term the server takes: one letter keeps the normal screen (no harness: pinned at its source)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require('fs').readFileSync(require('path').join(__dirname, '../app/(tabs)/events.tsx'), 'utf8') as string
  expect(src).toContain('if (searchTermOf(next) === null) setSearchTerm(\'\')')
  expect(src).toMatch(/const term = searchTermOf\(searchInput\)\s+\/\/[^\n]*\n\s+if \(term === null\) return\s+const id = setTimeout\(\(\) => setSearchTerm\(term\)/)
})
