/*
 * A pulled-photo notice is dealt with once (`photo_states` lists a pull for seven days, with no "seen"): dismissed on its tile or
 * replaced by a different photo, kept per account on this phone under `pulled:<userId>`.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
const mockWarn = jest.fn()
jest.mock('../lib/logger', () => ({ Logger: { warn: (...a: unknown[]) => mockWarn(...a), debug: jest.fn(), info: jest.fn(), error: jest.fn() } }))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { pulledPhotos } from '../lib/photoStates'
import { markPulledSeen, unseenPulled } from '../lib/pulledNotices'

// photo_states as the server sends it (blendn-admin profile-friends-push-gaps.itest.ts): two pulls, newest first.
const pulled = pulledPhotos([
  { url: 'https://cdn.test/profile/p1/live.jpg', pulled: false, pulled_at: null, was_main: false },
  { url: null, pulled: true, pulled_at: '2026-10-21T09:15:00.000Z', was_main: true },
  { url: null, pulled: true, pulled_at: '2026-10-19T08:00:00.000Z', was_main: false },
])

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
})

it('shows every notice until one is dealt with', async () => {
  expect(await unseenPulled('u1', pulled)).toEqual(pulled)
})

it('draws a dealt-with notice no more, and only that one', async () => {
  await markPulledSeen('u1', pulled[0])
  expect(await unseenPulled('u1', pulled)).toEqual([pulled[1]])
  expect(await AsyncStorage.getItem('pulled:u1')).toBe(JSON.stringify(['2026-10-21T09:15:00.000Z']))
})

it('is per account: another person on this phone still sees theirs', async () => {
  await markPulledSeen('u1', pulled[0])
  expect(await unseenPulled('u2', pulled)).toEqual(pulled)
})

it('writes a notice once, however many times it is dismissed', async () => {
  await markPulledSeen('u1', pulled[0])
  await markPulledSeen('u1', pulled[0])
  expect(JSON.parse((await AsyncStorage.getItem('pulled:u1')) as string)).toEqual(['2026-10-21T09:15:00.000Z'])
})

it('a store that cannot be read shows the notices, and one that cannot be written costs only the memory', async () => {
  ;(AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk'))
  expect(await unseenPulled('u1', pulled)).toEqual(pulled)
  ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'))
  await expect(markPulledSeen('u1', pulled[0])).resolves.toBeUndefined()
  expect(mockWarn).toHaveBeenCalledTimes(2)
})

it('keeps no more than fifty, newest last', async () => {
  for (let i = 0; i < 55; i++) await markPulledSeen('u1', { pulledAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`, wasMain: false })
  const kept = JSON.parse((await AsyncStorage.getItem('pulled:u1')) as string)
  expect(kept).toHaveLength(50)
  expect(kept[49]).toBe('2026-01-01T00:00:54.000Z')
})

it('nothing pulled is nothing to read', async () => {
  ;(AsyncStorage.getItem as jest.Mock).mockClear()
  expect(await unseenPulled('u1', [])).toEqual([])
  expect(AsyncStorage.getItem).not.toHaveBeenCalled()
})
