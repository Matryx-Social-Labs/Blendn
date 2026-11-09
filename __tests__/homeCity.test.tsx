/**
 * The home-city store (`lib/homeCity.ts`): one copy per user, so a quick account switch never shows the previous
 * user's home, a failed read is tried again, and a save is never undone by a read that started before it.
 */
import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

jest.mock('../lib/apiClient', () => ({ apiClient: { getProfile: jest.fn(), updateProfile: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { HOME_RETRY_MS, saveHomeCity, useHomeCitySlug } from '../lib/homeCity'
/* eslint-enable import/first */

const getProfile = apiClient.getProfile as jest.Mock
const updateProfile = apiClient.updateProfile as jest.Mock
const profile = (slug: string | null) => ({ success: true, data: { profile: { homeCitySlug: slug } } })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

// The store is module state that outlives a test, so every test uses its own user ids.
let onAppState: ((state: string) => void) | undefined
beforeEach(() => {
  getProfile.mockReset()
  updateProfile.mockReset()
  // The preset's AppState returns no subscription; the app's does.
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onAppState = handler as (state: string) => void
    return { remove: jest.fn() } as never
  })
})
afterEach(() => jest.useRealTimers())

it('a quick account switch never shows the previous user’s home, even when their read lands last', async () => {
  const a = deferred<unknown>()
  const b = deferred<unknown>()
  getProfile.mockImplementation((id: string) => (id === 'switch-a' ? a.promise : b.promise))
  const view = await renderHook(({ id }: { id: string }) => useHomeCitySlug(id), { initialProps: { id: 'switch-a' } })
  await view.rerender({ id: 'switch-b' })
  expect(view.result.current).toBeUndefined()
  await act(async () => b.resolve(profile('toronto')))
  expect(view.result.current).toBe('toronto')
  await act(async () => a.resolve(profile('bengaluru')))
  expect(view.result.current).toBe('toronto')
})

it('switching back shows that user’s own last value at once, and reads it again', async () => {
  getProfile.mockImplementation(async (id: string) => profile(id === 'back-b' ? null : 'bengaluru'))
  const view = await renderHook(({ id }: { id: string }) => useHomeCitySlug(id), { initialProps: { id: 'back-a' } })
  expect(view.result.current).toBe('bengaluru')
  await view.rerender({ id: 'back-b' })
  expect(view.result.current).toBeNull()
  const again = deferred<unknown>()
  getProfile.mockReturnValue(again.promise)
  await view.rerender({ id: 'back-a' })
  expect(view.result.current).toBe('bengaluru')
  await act(async () => again.resolve(profile('mumbai')))
  expect(view.result.current).toBe('mumbai')
  expect(getProfile.mock.calls.filter(([id]) => id === 'back-a')).toHaveLength(2)
})

it('a failed read is tried again, a refused one too, until it lands', async () => {
  jest.useFakeTimers()
  getProfile.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ success: false }).mockResolvedValue(profile('bengaluru'))
  const view = await renderHook(() => useHomeCitySlug('retry-a'))
  expect(view.result.current).toBeUndefined()
  await act(async () => jest.advanceTimersByTime(HOME_RETRY_MS[0]))
  expect(getProfile).toHaveBeenCalledTimes(2)
  expect(view.result.current).toBeUndefined()
  await act(async () => jest.advanceTimersByTime(HOME_RETRY_MS[1]))
  expect(getProfile).toHaveBeenCalledTimes(3)
  expect(view.result.current).toBe('bengaluru')
})

it('stops trying once nothing shows the user any more', async () => {
  jest.useFakeTimers()
  getProfile.mockRejectedValue(new Error('offline'))
  const view = await renderHook(() => useHomeCitySlug('gone-a'))
  await view.unmount()
  await act(async () => jest.advanceTimersByTime(HOME_RETRY_MS.reduce((a, b) => a + b, 0)))
  expect(getProfile).toHaveBeenCalledTimes(1)
})

it('unmounted while a read is in flight, a failure schedules nothing', async () => {
  jest.useFakeTimers()
  const read = deferred<unknown>()
  getProfile.mockReturnValueOnce(read.promise).mockRejectedValue(new Error('offline'))
  const view = await renderHook(() => useHomeCitySlug('gone-b'))
  await view.unmount()
  await act(async () => read.resolve({ success: false }))
  await act(async () => jest.advanceTimersByTime(HOME_RETRY_MS.reduce((a, b) => a + b, 0)))
  expect(getProfile).toHaveBeenCalledTimes(1)
})

it('offline past the last retry, coming back to the front asks again', async () => {
  jest.useFakeTimers()
  getProfile.mockRejectedValue(new Error('offline'))
  const view = await renderHook(() => useHomeCitySlug('front-a'))
  for (const wait of HOME_RETRY_MS) await act(async () => jest.advanceTimersByTime(wait))
  expect(getProfile).toHaveBeenCalledTimes(HOME_RETRY_MS.length + 1)
  getProfile.mockResolvedValue(profile('toronto'))
  await act(async () => onAppState?.('active'))
  expect(view.result.current).toBe('toronto')
})

it('of two quick saves, the later one shows, whichever answer lands first', async () => {
  getProfile.mockResolvedValue(profile(null))
  const first = deferred<unknown>()
  const second = deferred<unknown>()
  updateProfile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const view = await renderHook(() => useHomeCitySlug('two-a'))
  let saves: Promise<boolean>[] = []
  await act(async () => {
    saves = [saveHomeCity('two-a', 'mumbai'), saveHomeCity('two-a', 'toronto')]
  })
  await act(async () => second.resolve({ success: true }))
  await act(async () => first.resolve({ success: true }))
  await act(async () => {
    await Promise.all(saves)
  })
  expect(view.result.current).toBe('toronto')
})

it('a save is not undone by a read that started before it', async () => {
  const read = deferred<unknown>()
  getProfile.mockReturnValue(read.promise)
  updateProfile.mockResolvedValue({ success: true })
  const view = await renderHook(() => useHomeCitySlug('save-a'))
  await act(async () => {
    await saveHomeCity('save-a', 'toronto')
  })
  expect(view.result.current).toBe('toronto')
  await act(async () => read.resolve(profile(null)))
  expect(view.result.current).toBe('toronto')
})
