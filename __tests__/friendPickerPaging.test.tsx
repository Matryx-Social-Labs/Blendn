/**
 * The crew-invite pickers at every size (large data, 2026-10-22): Make a crew's friends step and the crew's Invite
 * friends sheet read your friends a page at a time by cursor, in a windowed list of fixed 64 pt rows. 0, 1, 100, 101
 * and 1,000 friends.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getFriends: jest.fn() } }))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { create: jest.fn(), crew: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

import NewCrewScreen from '../app/crews/new'
import { apiClient } from '../lib/apiClient'

const api = apiClient as jest.Mocked<typeof apiClient>
const friend = (i: number) => ({ userId: `u${i}`, name: `Friend ${i}`, photo: null, since: '2026-09-01T00:00:00Z' })
const friends = (n: number, from = 0) => Array.from({ length: n }, (_, i) => friend(from + i))
const page = (items: ReturnType<typeof friend>[], total: number, next: string | null = null) => ({
  success: true as const,
  data: { friends: items, count: total, pagination: { limit: 100, hasMore: next !== null, nextCursor: next, totalCount: total } },
})

async function toFriends() {
  await render(<NewCrewScreen />)
  await fireEvent.changeText(screen.getByTestId('make-name-input'), 'Nebula')
  await fireEvent.press(screen.getByLabelText('Next'))
  await waitFor(() => screen.getByText('Friends only. The count says how many, never who was skipped.'))
}
const list = () => screen.getByTestId('friend-pick-list')
const reachEnd = async () => {
  await act(async () => {
    fireEvent(list(), 'endReached')
  })
}

beforeEach(() => jest.clearAllMocks())

it('0 friends: says to add friends first, with no list', async () => {
  api.getFriends.mockResolvedValue(page([], 0))
  await toFriends()
  await waitFor(() => screen.getByText('Add friends first — a crew is made from your friends.'))
  expect(screen.queryByTestId('friend-pick-list')).toBeNull()
})

it('1 friend: one row', async () => {
  api.getFriends.mockResolvedValue(page(friends(1), 1))
  await toFriends()
  await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Friend 0' }))
  expect(list().props.data).toHaveLength(1)
})

it('100 friends: one page, and the end asks for nothing', async () => {
  api.getFriends.mockResolvedValue(page(friends(100), 100))
  await toFriends()
  await waitFor(() => screen.getByTestId('friend-pick-list'))
  await reachEnd()
  expect(api.getFriends).toHaveBeenCalledTimes(1)
})

it('101 friends: the 101st comes by cursor when the end is reached, and Try again follows a failed page', async () => {
  api.getFriends.mockResolvedValueOnce(page(friends(100), 101, 'c1')).mockResolvedValueOnce({ success: false })
  await toFriends()
  await waitFor(() => screen.getByTestId('friend-pick-list'))
  expect(list().props.data).toHaveLength(100)
  await reachEnd()
  expect(api.getFriends).toHaveBeenLastCalledWith('c1')
  expect(screen.getByText('Couldn’t load more.')).toBeTruthy()
  expect(list().props.data).toHaveLength(100)
  api.getFriends.mockResolvedValueOnce(page(friends(1, 100), 101))
  await act(async () => {
    fireEvent.press(screen.getByText('Try again'))
  })
  expect(list().props.data).toHaveLength(101)
})

it('1,000 friends: ten pages, fixed 64 pt rows, a window of seven, and the pick cap of eleven still holds', async () => {
  for (let p = 0; p < 10; p++) api.getFriends.mockResolvedValueOnce(page(friends(100, p * 100), 1000, p < 9 ? `c${p + 1}` : null))
  await toFriends()
  await waitFor(() => screen.getByTestId('friend-pick-list'))
  for (let p = 1; p < 10; p++) await reachEnd()
  expect(list().props.data).toHaveLength(1000)
  expect(list().props.getItemLayout(null, 999)).toEqual({ length: 64, offset: 64 * 999, index: 999 })
  expect(list().props.windowSize).toBeLessThanOrEqual(7)
  // Eleven picks fill the crew; the twelfth row is dimmed.
  for (let i = 0; i < 11; i++) await fireEvent.press(screen.getByRole('checkbox', { name: `Ask Friend ${i}` }))
  expect(screen.getByText('A crew has at most 12 people.')).toBeTruthy()
})

it('a failed first read is not "no friends": it offers the retry', async () => {
  api.getFriends.mockResolvedValueOnce({ success: false })
  await toFriends()
  await waitFor(() => screen.getByLabelText('Your friends didn’t load — try again'))
  api.getFriends.mockResolvedValueOnce(page(friends(1), 1))
  await fireEvent.press(screen.getByLabelText('Your friends didn’t load — try again'))
  await waitFor(() => screen.getByRole('checkbox', { name: 'Ask Friend 0' }))
})
