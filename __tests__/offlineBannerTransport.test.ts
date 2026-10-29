/**
 * Airplane mode raises the Offline banner on Android as well as on iOS (SCRUM-898).
 *
 * `request()` called `markOffline()` only for `error instanceof TypeError`, the shape the old XHR fetch rejected with. Since
 * SDK 56 the global `fetch` is `expo/fetch`, which rejects with `FetchError` (an `Error` whose message starts "fetch failed:"
 * and carries the native text), and a body that drops mid-read rejects with a plain `Error(<native text>)`. Neither is a
 * `TypeError`, so offline fell through to the generic sentence, `networkStatus` stayed 'unknown' and every OfflineBanner
 * stayed hidden, with no "Network error, retry n/2" line in the log: every transport failure on Android.
 *
 * Driven through the real `apiClient` with the global `fetch` rejecting with each shape the transports produce.
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
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { getNetworkState, markOnline } = require('../lib/networkStatus') as typeof import('../lib/networkStatus')
/* eslint-enable @typescript-eslint/no-require-imports */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const NO_INTERNET = 'No internet connection. Check your network and try again.'

/** What each transport rejects with when the radio is off. */
const SHAPES: [string, () => Error][] = [
  ['the XHR fetch (TypeError)', () => new TypeError('Network request failed')],
  ['expo/fetch on Android (FetchError, OkHttp text)', () => Object.assign(new Error('fetch failed: Unable to resolve host "api.test": No address associated with hostname'), { cause: new Error('UnknownHostException') })],
  ['expo/fetch on iOS (FetchError, URLSession text)', () => new Error('fetch failed: The Internet connection appears to be offline.')],
  ['a body that drops mid-read on Android', () => new Error('Software caused connection abort')],
  ['a body that drops mid-read on iOS', () => new Error('The network connection was lost.')],
]

describe('a transport failure is offline, whichever shape it takes', () => {
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())
  beforeEach(async () => {
    mockSecure.clear()
    await TokenStorage.setAccessToken('tok')
    await TokenStorage.setRefreshToken('ref')
    markOnline()
  })

  it.each(SHAPES)('%s: the sentence, and the banner state', async (_name, make) => {
    global.fetch = jest.fn(async () => {
      throw make()
    }) as typeof fetch

    const result = apiClient.getEventChat('e1')
    await jest.advanceTimersByTimeAsync(10_000)

    await expect(result).resolves.toEqual({ success: false, error: NO_INTERNET })
    expect(getNetworkState()).toBe('offline')
  })

  it.each(SHAPES)('%s: a GET is tried again before it gives up', async (_name, make) => {
    const fetchMock = jest.fn(async () => {
      throw make()
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = apiClient.getEventChat('e2')
    await jest.advanceTimersByTimeAsync(10_000)
    await result

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('comes back online on the next answer', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('fetch failed: Network is unreachable')
    }) as typeof fetch
    const down = apiClient.getEventChat('e3')
    await jest.advanceTimersByTimeAsync(10_000)
    await down
    expect(getNetworkState()).toBe('offline')

    global.fetch = jest.fn(async () => json(200, { success: true, data: { id: 'e3' } })) as typeof fetch
    const up = apiClient.getEventChat('e4')
    await jest.advanceTimersByTimeAsync(1_000)
    await up
    expect(getNetworkState()).toBe('online')
  })

  it('does not call a server fault, a bad body or a timeout "offline"', async () => {
    const calm = async (make: () => Error | Response, after = 10_000) => {
      markOnline()
      global.fetch = jest.fn(async () => {
        const r = make()
        if (r instanceof Error) throw r
        return r
      }) as typeof fetch
      const pending = apiClient.getEventChat(`e${Math.random()}`)
      await jest.advanceTimersByTimeAsync(after)
      await pending
      return getNetworkState()
    }
    expect(await calm(() => json(500, { success: false, error: 'boom' }))).toBe('online')
    expect(await calm(() => new SyntaxError('JSON Parse error: Unexpected end of input'))).toBe('online')
    expect(await calm(() => new Error('Cannot read property x of undefined'))).toBe('online')
    expect(await calm(() => Object.assign(new Error('Request timed out'), { name: 'AbortError' }))).toBe('online')
    expect(await calm(() => new Error('fetch failed: The operation was aborted.'))).toBe('online')
  })
})
