import { act, renderHook } from '@testing-library/react-native'

import {
  FRIEND_ROW_HEIGHT,
  FRIENDS_PAGE,
  LETTER_HEIGHT,
  layoutOf,
  letterOf,
  SEARCH_DEBOUNCE_MS,
  useFriendsHereList,
  withLetters,
} from '../lib/friendsHereList'

const mockGet = jest.fn()
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriendsHere: (...a: unknown[]) => mockGet(...a) } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

const f = (name: string, i = 0) => ({ userId: `${name}-${i}`, name, photo: null })

describe('letterOf', () => {
  it('upper-cases a Latin initial', () => expect(letterOf('asha Menon')).toBe('A'))
  it('a non-Latin initial is its own letter', () => {
    expect(letterOf('অনির্বাণ')).toBe('অ')
    expect(letterOf('Ñandú')).toBe('Ñ')
  })
  it('digits, symbols and emoji are under #', () => {
    expect(letterOf('4chan Fan')).toBe('#')
    expect(letterOf('🙂 Smile')).toBe('#')
    expect(letterOf('  ')).toBe('#')
  })
  it('an emoji or accent is one character, not half a surrogate pair', () => expect(letterOf('😀')).toBe('#'))
})

describe('withLetters and layoutOf', () => {
  const rows = withLetters([f('Aarav', 1), f('Ananya', 2), f('Dev', 3), f('অর্জুন', 4), f('9lives', 5)])
  it('a header before each run of one initial', () => {
    expect(rows.map((r) => (r.kind === 'letter' ? `#${r.letter}` : r.friend.name))).toEqual([
      '#A', 'Aarav', 'Ananya', '#D', 'Dev', '#অ', 'অর্জুন', '##', '9lives',
    ])
  })
  it('keys are unique', () => expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length))
  it('offsets are exact: headers 32, friends 64, summed', () => {
    const at = layoutOf(rows)
    expect(at[0]).toEqual({ length: LETTER_HEIGHT, offset: 0, index: 0 })
    expect(at[1]).toEqual({ length: FRIEND_ROW_HEIGHT, offset: LETTER_HEIGHT, index: 1 })
    expect(at[3]).toEqual({ length: LETTER_HEIGHT, offset: LETTER_HEIGHT + 2 * FRIEND_ROW_HEIGHT, index: 3 })
    const last = at[at.length - 1]
    expect(last.offset + last.length).toBe(4 * LETTER_HEIGHT + 5 * FRIEND_ROW_HEIGHT)
  })
  it('a thousand friends lay out in one pass', () => {
    const many = withLetters(Array.from({ length: 1000 }, (_, i) => f(`A${String(i).padStart(4, '0')}`, i)))
    expect(layoutOf(many)).toHaveLength(1001)
  })
})

describe('useFriendsHereList', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockGet.mockReset()
  })
  afterEach(() => jest.useRealTimers())
  const page = (friends: ReturnType<typeof f>[], total: number, nextCursor: string | null) => ({ success: true, data: { friends, total, nextCursor } })
  const settle = () => act(async () => {})

  it('reads the first page by name, 50 at a time', async () => {
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
})
