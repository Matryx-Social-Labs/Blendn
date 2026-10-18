/**
 * The request queue's width and its accounting.
 *
 * Width: six slots against a launch burst of 10-12 reads put the second half a
 * round trip behind the first (HTTP/2 shares one connection, so the ceiling was
 * the queue's, not the network's).
 *
 * Accounting: clear() runs on every backgrounding and used to set the active
 * count to 0 while requests were still on the wire; each then decremented as it
 * finished, the count went negative, and the ceiling was no longer a ceiling.
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RequestQueue, MAX_CONCURRENT_REQUESTS } = require('../lib/apiClient') as typeof import('../lib/apiClient')

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

/** A request that stays on the wire until `release()`. */
function held() {
  let release: () => void = () => {}
  const started = jest.fn()
  const request = () => {
    started()
    return new Promise<void>((r) => (release = r))
  }
  return { request, started, release: () => release() }
}

describe('RequestQueue', () => {
  it('puts a launch burst of ten on the wire together', async () => {
    expect(MAX_CONCURRENT_REQUESTS).toBeGreaterThanOrEqual(10)
    const queue = new RequestQueue()
    const jobs = Array.from({ length: 12 }, () => held())

    jobs.forEach((j) => void queue.add(j.request))
    await tick()

    expect(jobs.filter((j) => j.started.mock.calls.length > 0)).toHaveLength(MAX_CONCURRENT_REQUESTS)
    expect(queue.getStats().activeRequests).toBe(MAX_CONCURRENT_REQUESTS)
    jobs.forEach((j) => j.release())
    await tick()
  })

  it('keeps the count of what is on the wire through a clear(), and never goes below zero', async () => {
    const queue = new RequestQueue()
    const inFlight = [held(), held()]
    const results = inFlight.map((j) => queue.add(j.request))
    await tick()
    expect(queue.getStats().activeRequests).toBe(2)

    queue.clear() // the app went to the background
    expect(queue.getStats().activeRequests).toBe(2)

    inFlight.forEach((j) => j.release())
    await Promise.all(results)
    await tick()
    expect(queue.getStats().activeRequests).toBe(0)
  })

  it('still holds the ceiling after a clear() with requests in flight', async () => {
    const queue = new RequestQueue()
    const before = Array.from({ length: 3 }, () => held())
    before.forEach((j) => void queue.add(j.request))
    await tick()
    queue.clear()
    before.forEach((j) => j.release())
    await tick()

    const after = Array.from({ length: MAX_CONCURRENT_REQUESTS + 4 }, () => held())
    after.forEach((j) => void queue.add(j.request))
    await tick()

    expect(after.filter((j) => j.started.mock.calls.length > 0)).toHaveLength(MAX_CONCURRENT_REQUESTS)
    after.forEach((j) => j.release())
    await tick()
  })
})
