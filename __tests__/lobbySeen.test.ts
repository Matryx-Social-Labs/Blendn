/**
 * SCRUM-1115: the Lobby's seen marker lives on the server now (`POST /events/:id/board/seen`). The markers this phone
 * kept before go up once, so a Lobby already read does not turn new on upgrade (decided per advisor, task 18), and then
 * the phone keeps none.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { markBoardSeen: jest.fn() } }))

import { apiClient } from '../lib/apiClient'

const KEY = 'blendn.lobby.seen'
const mark = apiClient.markBoardSeen as jest.Mock
const fresh = () => {
  let mod: typeof import('../lib/lobbySeen') | undefined
  jest.isolateModules(() => {
    mod = require('../lib/lobbySeen')
  })
  return mod!.postPhoneLobbyMarkers
}

beforeEach(async () => {
  mark.mockReset()
  await AsyncStorage.clear()
})

it('posts every marker the phone kept, once, and then keeps none', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify([['e1', '2026-11-08T10:00:00Z'], ['e2', '2026-11-09T11:00:00Z'], ['bad'], 7]))
  mark.mockResolvedValue({ success: true, data: { seenAt: 'x' } })
  const post = fresh()
  await Promise.all([post(), post()])
  expect(mark.mock.calls).toEqual([['e1', '2026-11-08T10:00:00Z'], ['e2', '2026-11-09T11:00:00Z']])
  expect(await AsyncStorage.getItem(KEY)).toBeNull()
  await post()
  expect(mark).toHaveBeenCalledTimes(2)
})

it('a Lobby that refuses (closed, not yours) is an answer: the markers go (control: no answer keeps them for next time)', async () => {
  const pairs = JSON.stringify([['e1', '2026-11-08T10:00:00Z']])
  await AsyncStorage.setItem(KEY, pairs)
  mark.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN', error: 'Only people going can read the Lobby' })
  await fresh()()
  expect(await AsyncStorage.getItem(KEY)).toBeNull()

  await AsyncStorage.setItem(KEY, pairs)
  mark.mockResolvedValue({ success: false, error: 'No internet connection. Check your network and try again.' })
  const post = fresh()
  await post()
  expect(await AsyncStorage.getItem(KEY)).toBe(pairs)
  // The next read tries again.
  mark.mockResolvedValue({ success: true, data: { seenAt: 'x' } })
  await post()
  expect(await AsyncStorage.getItem(KEY)).toBeNull()
})

it('nothing kept: no request', async () => {
  await fresh()()
  expect(mark).not.toHaveBeenCalled()
})
