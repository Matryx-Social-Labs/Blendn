/*
 * The one-time ask after a first friendship (plans/friends-in-room.md, Q1): once ever per
 * account, only when the switch is off, never flipping anyone's value for them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import { ASK_AFTER_MS, askFriendsSeeMe, FRIENDS_SEE_ME_TITLE } from '../lib/friendsSeeMeAsk'

const mockProfile = jest.fn()
const mockUpdate = jest.fn()
const mockShow = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getProfile: (...a: unknown[]) => mockProfile(...a), updateProfile: (...a: unknown[]) => mockUpdate(...a) } }))
jest.mock('../lib/sheet', () => ({ showSheet: (...a: unknown[]) => mockShow(...a) }))
jest.mock('../lib/useAuth', () => ({ currentUserId: () => 'me' }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      clear: async () => store.clear(),
    },
  }
})

const ask = async () => {
  const p = askFriendsSeeMe()
  await jest.advanceTimersByTimeAsync(ASK_AFTER_MS + 10)
  await p
}

beforeEach(async () => {
  jest.useFakeTimers()
  mockProfile.mockReset().mockResolvedValue({ success: true, data: { profile: { friends_see_me_in_rooms: false } } })
  mockUpdate.mockReset().mockResolvedValue({ success: true })
  mockShow.mockReset()
  await (AsyncStorage as unknown as { clear: () => Promise<void> }).clear()
})
afterEach(() => jest.useRealTimers())

describe('askFriendsSeeMe', () => {
  it('asks once, in rose, after a beat, with Turn on and Not now', async () => {
    await ask()
    expect(mockShow).toHaveBeenCalledTimes(1)
    const sheet = mockShow.mock.calls[0][0]
    expect(sheet).toMatchObject({ kind: 'actions', hue: 'rose', title: FRIENDS_SEE_ME_TITLE })
    expect(sheet.actions.map((a: { label: string }) => a.label)).toEqual(['Turn on', 'Not now'])
    expect(sheet.actions[1].cancel).toBe(true)
  })

  it('never twice: the flag is written as it is shown', async () => {
    await ask()
    await ask()
    expect(mockShow).toHaveBeenCalledTimes(1)
    expect(await AsyncStorage.getItem('friends_see_me_ask_seen_me')).toBe('1')
  })

  it('Turn on writes the setting, and a failure says so and stays', async () => {
    await ask()
    const turnOn = mockShow.mock.calls[0][0].actions[0].run
    expect(await turnOn()).toEqual({ ok: true })
    expect(mockUpdate).toHaveBeenCalledWith('me', { friends_see_me_in_rooms: true })
    mockUpdate.mockResolvedValue({ success: false })
    expect(await turnOn()).toEqual({ ok: false, error: expect.stringContaining('Try again') })
  })

  it('Not now changes nothing', async () => {
    await ask()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('not when the switch is already on', async () => {
    mockProfile.mockResolvedValue({ success: true, data: { profile: { friends_see_me_in_rooms: true } } })
    await ask()
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('not when the profile will not say, and it is asked again later', async () => {
    mockProfile.mockResolvedValue({ success: false })
    await ask()
    expect(mockShow).not.toHaveBeenCalled()
    mockProfile.mockResolvedValue({ success: true, data: { profile: { friends_see_me_in_rooms: false } } })
    await ask()
    expect(mockShow).toHaveBeenCalledTimes(1)
  })

  it('two friendships in a second are one ask', async () => {
    const a = askFriendsSeeMe()
    const b = askFriendsSeeMe()
    await jest.advanceTimersByTimeAsync(ASK_AFTER_MS + 10)
    await Promise.all([a, b])
    expect(mockShow).toHaveBeenCalledTimes(1)
  })
})
