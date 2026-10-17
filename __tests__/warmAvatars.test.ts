/**
 * The Room is revealed with its first faces decoded (PR #401 drive 2: blank
 * faces filling in after the pour), and a slow image never holds it.
 */
const mockPrefetch = jest.fn()
jest.mock('expo-image', () => ({ Image: { prefetch: (...a: unknown[]) => mockPrefetch(...a) } }))

import { warmAvatars } from '../lib/warmAvatars'

beforeEach(() => {
  jest.useFakeTimers()
  mockPrefetch.mockReset()
})
afterEach(() => jest.useRealTimers())

it('asks for the first twelve distinct photos, into memory and disk, and is done when they are', async () => {
  mockPrefetch.mockResolvedValue(true)
  const urls = Array.from({ length: 20 }, (_, i) => `https://img/${i % 15}.jpg`)
  await warmAvatars([...urls, null, undefined])
  expect(mockPrefetch).toHaveBeenCalledWith(Array.from({ length: 12 }, (_, i) => `https://img/${i}.jpg`), { cachePolicy: 'memory-disk' })
})

it('never holds the Room past 1.5 s for an image that does not come', async () => {
  mockPrefetch.mockReturnValue(new Promise(() => {}))
  let done = false
  void warmAvatars(['https://img/slow.jpg']).then(() => (done = true))
  await jest.advanceTimersByTimeAsync(1499)
  expect(done).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  expect(done).toBe(true)
})

it('a failed prefetch is not a wait, and no photos is no wait at all', async () => {
  mockPrefetch.mockRejectedValue(new Error('offline'))
  await expect(warmAvatars(['https://img/x.jpg'])).resolves.toBeUndefined()
  await expect(warmAvatars([null])).resolves.toBeUndefined()
})
