/**
 * The deadline covers the whole answer, not just its headers (SCRUM-498).
 *
 * Since SDK 56 the global `fetch` is `expo/fetch`, which resolves when the
 * headers arrive and streams the body after. `fetchWithTimeout` cleared its
 * deadline at that point, and the body was read with none: a body that stalled
 * held its `RequestQueue` slot for good. On the sim the Me tab sat on its
 * skeleton with four requests "still running after 135000ms" — no timeout, no
 * error, nothing to retry.
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
const { REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE, fetchWithTimeout } =
  require('../lib/fetchTimeout') as typeof import('../lib/fetchTimeout')
/* eslint-enable @typescript-eslint/no-require-imports */

/** Headers in, then a body that never finishes — and ignores the abort. */
const stalledBody = (): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => new Promise<string>(() => {}),
    json: () => new Promise<unknown>(() => {}),
  }) as unknown as Response

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('fetchWithTimeout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('rejects when the headers arrive but the body never finishes', async () => {
    let signal: AbortSignal | null | undefined
    const pending = fetchWithTimeout('/x', {}, 1000, async (_input, init) => {
      signal = init?.signal
      return stalledBody()
    })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    await jest.advanceTimersByTimeAsync(1000)
    await assertion
    // And the socket under the stalled body is let go.
    expect(signal?.aborted).toBe(true)
  })

  it('gives headers and body one budget, not one each', async () => {
    let settled = false
    const pending = fetchWithTimeout(
      '/x',
      {},
      1000,
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(stalledBody()), 600))
    )
    pending.catch(() => (settled = true))

    await jest.advanceTimersByTimeAsync(1000)
    expect(settled).toBe(true)
  })

  it('rejects when the body fails part-way, rather than answering empty', async () => {
    const torn = { ...stalledBody(), text: () => Promise.reject(new TypeError('Network request failed')) }

    await expect(fetchWithTimeout('/x', {}, 1000, async () => torn as unknown as Response)).rejects.toBeInstanceOf(
      TypeError
    )
    expect(jest.getTimerCount()).toBe(0)
  })

  it('hands back the body it read inside the deadline, with the response', async () => {
    const { response, body } = await fetchWithTimeout('/x', {}, 1000, async () => json(201, { ok: 1 }))

    expect(response.status).toBe(201)
    expect(JSON.parse(body)).toEqual({ ok: 1 })
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('apiClient', () => {
  // One fake clock for the block: a fresh one per test rewinds Date.now(), and
  // the queue's debounce then reads the rewind as a 15-second wait.
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())
  beforeEach(async () => {
    mockSecure.clear()
    await TokenStorage.setAccessToken('tok')
    await TokenStorage.setRefreshToken('ref')
  })

  it('gives six stalled bodies the timeout sentence, and the seventh call its turn', async () => {
    // Six is the queue's whole width: before, six stalled bodies were every
    // slot, and the seventh call waited for good.
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/events/e7/') ? json(200, { success: true, data: { id: 'e7' } }) : stalledBody()
    ) as typeof fetch

    const stalled = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => apiClient.getEventChat(id))
    let seventh: unknown
    void apiClient.getEventChat('e7').then((r) => (seventh = r))

    await jest.advanceTimersByTimeAsync(1000)
    expect(seventh).toBeUndefined()

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    for (const result of await Promise.all(stalled)) {
      expect(result).toEqual({ success: false, error: TIMEOUT_MESSAGE })
    }
    expect(seventh).toMatchObject({ success: true, data: { id: 'e7' } })
  })

  it('takes an empty answer as success, read from the body it was handed', async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 204 })) as typeof fetch

    const result = apiClient.getEventChat('e8')
    await jest.advanceTimersByTimeAsync(50)
    await expect(result).resolves.toEqual({ success: true })
  })

  it('reads a refresh that answers from the body it was handed, and retries signed with the new token', async () => {
    const auth: (string | undefined)[] = []
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/mobile/auth/refresh')) {
        return json(200, { success: true, data: { accessToken: 'tok2', refreshToken: 'ref2' } })
      }
      const sent = (init?.headers as Record<string, string>).Authorization
      auth.push(sent)
      return sent === 'Bearer tok2'
        ? json(200, { success: true, data: { id: 'e4' } })
        : json(401, { success: false, error: 'Unauthorized' })
    }) as typeof fetch

    const result = apiClient.getEventChat('e4')
    await jest.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toMatchObject({ success: true, data: { id: 'e4' } })
    expect(auth).toEqual(['Bearer tok', 'Bearer tok2'])
    expect(await TokenStorage.getRefreshToken()).toBe('ref2')
  })

  it('times out the retry after a refresh when its body stalls', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/mobile/auth/refresh')) {
        return json(200, { success: true, data: { accessToken: 'tok3', refreshToken: 'ref3' } })
      }
      const sent = (init?.headers as Record<string, string>).Authorization
      return sent === 'Bearer tok3' ? stalledBody() : json(401, { success: false, error: 'Unauthorized' })
    }) as typeof fetch

    let result: unknown
    void apiClient.getEventChat('e9').then((r) => (result = r))
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 100)

    expect(result).toEqual({ success: false, error: TIMEOUT_MESSAGE })
  })

  // Last: a failed refresh arms the 2-second refresh retry on this shared clock.
  it('treats a refresh whose body stalls as a failed refresh, not a hang', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/api/mobile/auth/refresh')
        ? stalledBody()
        : json(401, { success: false, error: 'Unauthorized' })
    ) as typeof fetch

    let result: unknown
    void apiClient.getEventChat('e10').then((r) => (result = r))
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 100)

    expect(result).toEqual({ success: false, error: TIMEOUT_MESSAGE })
    // Not signed out: the server never finished answering.
    expect(await TokenStorage.getRefreshToken()).toBe('ref')
  })
})
