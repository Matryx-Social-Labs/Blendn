import { act, renderHook } from '@testing-library/react-native'

import { FRIENDS_FIRST_PAGE, FRIENDS_REFETCH_MS, useFriendsHere } from '../lib/friendsHere'

const mockGet = jest.fn()
let pushFriends: (d: { eventId: string }) => void = () => {}
let pushStatus: (s: { state: string }) => void = () => {}
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriendsHere: (...a: unknown[]) => mockGet(...a) } }))
jest.mock('../lib/socketClient', () => ({
  subscribeToRoomFriends: (cb: typeof pushFriends) => {
    pushFriends = cb
    return () => {}
  },
  subscribeConnectionStatus: (cb: typeof pushStatus) => {
    pushStatus = cb
    cb({ state: 'connected' })
    return () => {}
  },
}))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

const asha = { userId: 'u1', name: 'Asha Menon', photo: null }
const ok = (friends = [asha], total = friends.length) => ({ success: true, data: { friends, total, nextCursor: null } })

beforeEach(() => {
  jest.useFakeTimers()
  mockGet.mockReset()
})
afterEach(() => jest.useRealTimers())

const settle = () => act(async () => {})

describe('useFriendsHere', () => {
  it('reads the first page, newest first, 8 at most', async () => {
    mockGet.mockResolvedValue(ok([asha], 1))
    const { result } = await renderHook(() => useFriendsHere('e1', true))
    await settle()
    expect(mockGet).toHaveBeenCalledWith('e1', { order: 'recent', limit: FRIENDS_FIRST_PAGE })
    expect(result.current).toMatchObject({ friends: [asha], total: 1, loaded: true, appearances: 0 })
  })

  it('reads nothing outside a room', async () => {
    const { result } = await renderHook(() => useFriendsHere('e1', false))
    await settle()
    expect(mockGet).not.toHaveBeenCalled()
    expect(result.current.friends).toEqual([])
  })

  it('an older server (404) leaves no section and no page', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'Not found' })
    const { result } = await renderHook(() => useFriendsHere('e1', true))
    await settle()
    expect(result.current).toMatchObject({ friends: [], total: 0, loaded: true })
  })

  it('room:friends refetches once after a second, however many arrive', async () => {
    mockGet.mockResolvedValue(ok())
    await renderHook(() => useFriendsHere('e1', true))
    await settle()
    mockGet.mockClear()
    await act(async () => {
      pushFriends({ eventId: 'e1' })
      pushFriends({ eventId: 'e1' })
      pushFriends({ eventId: 'other' })
    })
    expect(mockGet).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(FRIENDS_REFETCH_MS)
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('keeps the last good page when a read fails', async () => {
    mockGet.mockResolvedValueOnce(ok([asha], 4))
    const { result } = await renderHook(() => useFriendsHere('e1', true))
    await settle()
    mockGet.mockResolvedValue({ success: false })
    await act(async () => pushFriends({ eventId: 'e1' }))
    await act(async () => {
      jest.advanceTimersByTime(FRIENDS_REFETCH_MS)
    })
    expect(result.current.total).toBe(4)
    expect(result.current.friends).toEqual([asha])
  })

  it('a reconnect reads again', async () => {
    mockGet.mockResolvedValue(ok())
    await renderHook(() => useFriendsHere('e1', true))
    await settle()
    await act(async () => pushStatus({ state: 'reconnecting' }))
    mockGet.mockClear()
    await act(async () => pushStatus({ state: 'connected' }))
    await act(async () => {
      jest.advanceTimersByTime(FRIENDS_REFETCH_MS)
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('the section appearing after the first read is counted once; arriving with it is not', async () => {
    mockGet.mockResolvedValueOnce(ok([], 0))
    const { result } = await renderHook(() => useFriendsHere('e1', true))
    await settle()
    expect(result.current.appearances).toBe(0)
    mockGet.mockResolvedValue(ok([asha], 1))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.appearances).toBe(1)
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.appearances).toBe(1)
  })

  it('another room never shows this room’s friends', async () => {
    mockGet.mockResolvedValue(ok())
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useFriendsHere(id, true), { initialProps: { id: 'e1' } })
    await settle()
    mockGet.mockReturnValue(new Promise(() => {}))
    await rerender({ id: 'e2' })
    expect(result.current).toMatchObject({ friends: [], total: 0, loaded: false })
  })

  it('a slow older answer never overwrites a newer one', async () => {
    let first: (v: unknown) => void = () => {}
    mockGet.mockReturnValueOnce(new Promise((r) => (first = r)))
    const { result } = await renderHook(() => useFriendsHere('e1', true))
    mockGet.mockResolvedValue(ok([asha], 2))
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => first(ok([], 0)))
    expect(result.current.total).toBe(2)
  })
})
