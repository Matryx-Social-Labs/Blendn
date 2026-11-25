import { act, renderHook } from '@testing-library/react-native'

import {
  FRIENDS_PAGE,
  SEARCH_ABOVE,
  SEARCH_DEBOUNCE_MS,
  useFriendsHereList,
} from '../lib/friendsHereList'

const mockGet = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriendsHere: (...a: unknown[]) => mockGet(...a) } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

const f = (name: string, i = 0) => ({ userId: `${name}-${i}`, name, photo: null })

describe('pages (Flow 5 C6, I-A)', () => {
  it('pages of 20, as the board says ("Show 20 more")', () => expect(FRIENDS_PAGE).toBe(20))
  it('search comes first only above 20', () => expect(SEARCH_ABOVE).toBe(20))
})

describe('useFriendsHereList', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockGet.mockReset()
  })
  afterEach(() => jest.useRealTimers())
  const page = (friends: ReturnType<typeof f>[], total: number, nextCursor: string | null) => ({ success: true, data: { friends, total, nextCursor } })
  const settle = () => act(async () => {})

  it('reads the first page by name, 20 at a time', async () => {
    mockGet.mockResolvedValue(page([f('A')], 60, 'c1'))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    expect(mockGet).toHaveBeenCalledWith('e1', { order: 'name', limit: FRIENDS_PAGE, q: undefined })
    expect(result.current).toMatchObject({ status: 'ready', total: 60, hasMore: true })
  })

  it('appends the next page by cursor, without repeating a friend', async () => {
    mockGet.mockResolvedValueOnce(page([f('A', 1), f('B', 2)], 60, 'c1')).mockResolvedValueOnce(page([f('B', 2), f('C', 3)], 60, null))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    await act(async () => {
      await result.current.loadMore()
    })
    expect(mockGet).toHaveBeenLastCalledWith('e1', { order: 'name', limit: FRIENDS_PAGE, cursor: 'c1', q: undefined })
    expect(result.current.friends.map((x) => x.name)).toEqual(['A', 'B', 'C'])
    expect(result.current.hasMore).toBe(false)
  })

  it('two taps on the end of the list ask for one page', async () => {
    mockGet.mockResolvedValueOnce(page([f('A', 1)], 60, 'c1'))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    mockGet.mockClear()
    mockGet.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      void result.current.loadMore()
      void result.current.loadMore()
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('search waits 250 ms, asks with q, and keeps the unfiltered total', async () => {
    mockGet.mockResolvedValueOnce(page([f('A', 1)], 60, null))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    mockGet.mockResolvedValue(page([f('Meera', 9)], 1, null))
    await act(async () => result.current.search('mee'))
    expect(result.current.searching).toBe(true)
    expect(mockGet).toHaveBeenCalledTimes(1)
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(mockGet).toHaveBeenLastCalledWith('e1', { order: 'name', limit: FRIENDS_PAGE, q: 'mee' })
    expect(result.current).toMatchObject({ searching: false, total: 60 })
    expect(result.current.friends.map((x) => x.name)).toEqual(['Meera'])
  })

  it('a search with no match is an empty ready list, not an error', async () => {
    mockGet.mockResolvedValueOnce(page([f('A', 1)], 60, null))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    mockGet.mockResolvedValue(page([], 0, null))
    await act(async () => result.current.search('zzz'))
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(result.current).toMatchObject({ status: 'ready', friends: [] })
  })

  it('a failed first read is an error that Try again recovers from', async () => {
    mockGet.mockResolvedValueOnce({ success: false })
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    expect(result.current.status).toBe('error')
    mockGet.mockResolvedValue(page([f('A', 1)], 1, null))
    await act(async () => result.current.retry())
    await settle()
    expect(result.current.status).toBe('ready')
  })

  it('an older search answer never lands on a newer one', async () => {
    let slow: (v: unknown) => void = () => {}
    mockGet.mockResolvedValueOnce(page([f('A', 1)], 5, null))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    mockGet.mockReturnValueOnce(new Promise((r) => (slow = r)))
    await act(async () => result.current.search('a'))
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    mockGet.mockResolvedValueOnce(page([f('Bea', 2)], 1, null))
    await act(async () => result.current.search('b'))
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    await act(async () => slow(page([f('Zed', 3)], 1, null)))
    expect(result.current.friends.map((x) => x.name)).toEqual(['Bea'])
  })

  it('a next page is never asked with the last search’s cursor', async () => {
    mockGet.mockResolvedValueOnce(page([f('A', 1)], 60, 'c1'))
    const { result } = await renderHook(() => useFriendsHereList('e1'))
    await settle()
    mockGet.mockClear()
    mockGet.mockReturnValue(new Promise(() => {}))
    // Typing: the search is not asked yet, and the old cursor is the old list's.
    await act(async () => result.current.search('b'))
    await act(async () => {
      await result.current.loadMore()
    })
    expect(mockGet).not.toHaveBeenCalled()
    // Asked and not answered: still no next page.
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    mockGet.mockClear()
    await act(async () => {
      await result.current.loadMore()
    })
    expect(mockGet).not.toHaveBeenCalled()
  })
})
