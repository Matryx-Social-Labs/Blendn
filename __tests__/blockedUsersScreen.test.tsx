/**
 * Blocked users at scale: a page at a time, the next on reaching the end, a failed page keeps what is on screen, and a
 * long list is virtualised. 0, 1, a handful, hundreds.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
const mockFetch = jest.fn()
jest.mock('../lib/blockedUsersPage', () => ({ fetchBlockedPage: (...a: unknown[]) => mockFetch(...a) }))
jest.mock('../lib/safetyUtils', () => ({ unblockUser: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
const mockShowSheet = jest.fn()
jest.mock('../lib/sheet', () => ({ ...jest.requireActual('../lib/sheet'), showSheet: (...a: unknown[]) => mockShowSheet(...a) }))

import BlockedUsers from '../app/blocked-users'

const user = (i: number) => ({ blocked_id: `u${i}`, blocked_user_name: `Person ${i}`, blocked_user_photo: null, reason: null, blocked_at: '2026-09-12T10:00:00Z' })
const users = (from: number, n: number) => Array.from({ length: n }, (_, i) => user(from + i))
const ok = (list: unknown[], nextCursor: string | null = null) => ({ ok: true, page: { users: list, nextCursor } })

beforeEach(() => {
  mockFetch.mockReset()
  mockShowSheet.mockReset()
})

it('nobody blocked says so, top-aligned as Muted rooms is (D-L11)', async () => {
  mockFetch.mockResolvedValue(ok([]))
  await render(<BlockedUsers />)
  expect(await screen.findByText('No blocked users')).toBeTruthy()
  // Negative control: the centred empty list (`justifyContent: 'center'`) fails this.
  const list = screen.getByTestId('blocked-users-list')
  expect(StyleSheet.flatten(list.props.contentContainerStyle).justifyContent).toBeUndefined()
})

it('a failed read says it did not load, never "no blocked users"', async () => {
  mockFetch.mockResolvedValue({ ok: false, error: 'offline' })
  await render(<BlockedUsers />)
  expect(await screen.findByText("Blocked users didn’t load")).toBeTruthy()
  expect(screen.queryByText('No blocked users')).toBeNull()
})

it('draws a creature, never a face, even if a photo slips through (YOU-10, E10)', async () => {
  mockFetch.mockResolvedValue(ok([{ ...user(1), blocked_user_photo: 'https://cdn/face.jpg' }]))
  await render(<BlockedUsers />)
  await screen.findByText('Person 1')
  expect(screen.getByTestId('person-creature', { includeHiddenElements: true })).toBeTruthy()
})

it('one person is one row with Unblock', async () => {
  mockFetch.mockResolvedValue(ok([user(1)]))
  await render(<BlockedUsers />)
  expect(await screen.findByText('Person 1')).toBeTruthy()
  expect(screen.getByLabelText('Unblock Person 1')).toBeTruthy()
})

it('the Unblock sheet promises only what unblocking does (SCRUM-909)', async () => {
  // A block that closed a conversation leaves it closed for good (the server answers a new request with 404),
  // and the list does not say which blocks did: so the line must be true for both.
  mockFetch.mockResolvedValue(ok([user(1)]))
  await render(<BlockedUsers />)
  await screen.findByText('Person 1')
  await act(async () => fireEvent.press(screen.getByLabelText('Unblock Person 1')))
  const sheet = mockShowSheet.mock.calls[0][0]
  expect(sheet.title).toBe('Unblock Person 1?')
  expect(sheet.message).toBe('They can see your profile again. A conversation you ended stays closed. They are not told.')
  expect(sheet.message).not.toMatch(/message you again/)
})

it('asks for the next page when the end comes into view, once, and adds it without repeats', async () => {
  mockFetch.mockResolvedValueOnce(ok(users(0, 3), 'c2')).mockResolvedValueOnce(ok([user(2), ...users(3, 2)]))
  await render(<BlockedUsers />)
  await screen.findByText('Person 0')
  const list = screen.getByTestId('blocked-users-list')
  await act(async () => fireEvent(list, 'endReached'))
  expect(await screen.findByText('Person 4')).toBeTruthy()
  expect(mockFetch).toHaveBeenLastCalledWith('c2')
  expect(screen.getAllByText('Person 2')).toHaveLength(1)
  // No cursor now: reaching the end again asks nothing.
  await act(async () => fireEvent(list, 'endReached'))
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

it('a page that does not come keeps the list and offers Try again at the foot', async () => {
  mockFetch.mockResolvedValueOnce(ok(users(0, 2), 'c2')).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(ok(users(2, 1)))
  await render(<BlockedUsers />)
  await screen.findByText('Person 0')
  await act(async () => fireEvent(screen.getByTestId('blocked-users-list'), 'endReached'))
  expect(await screen.findByText('The rest didn’t load.')).toBeTruthy()
  expect(screen.getByText('Person 1')).toBeTruthy()
  await act(async () => fireEvent.press(screen.getByText('Try again')))
  expect(await screen.findByText('Person 2')).toBeTruthy()
})

it('hundreds of people are virtualised, not all mounted', async () => {
  mockFetch.mockResolvedValue(ok(users(0, 500)))
  await render(<BlockedUsers />)
  await screen.findByText('Person 0')
  expect(screen.queryByText('Person 499')).toBeNull()
  expect(screen.queryAllByText(/^Person \d+$/).length).toBeLessThan(60)
})

it('a refresh during a next-page load does not leave the foot spinning, and the late page is dropped', async () => {
  let release: (v: unknown) => void = () => {}
  mockFetch
    .mockResolvedValueOnce(ok(users(0, 3), 'c2'))
    .mockImplementationOnce(() => new Promise((r) => (release = r)))
    .mockResolvedValueOnce(ok(users(10, 2)))
  await render(<BlockedUsers />)
  await screen.findByText('Person 0')
  const list = screen.getByTestId('blocked-users-list')
  await act(async () => fireEvent(list, 'endReached'))
  expect(screen.getByLabelText('Loading more')).toBeTruthy()
  // Pull to refresh while the next page is out.
  const { refreshControl } = list.props
  await act(async () => refreshControl.props.onRefresh())
  expect(await screen.findByText('Person 10')).toBeTruthy()
  expect(screen.queryByLabelText('Loading more')).toBeNull()
  await act(async () => release(ok(users(50, 2))))
  expect(screen.queryByText('Person 50')).toBeNull()
  expect(screen.queryByLabelText('Loading more')).toBeNull()
})

it('an empty page with a cursor after it is followed on at once', async () => {
  mockFetch.mockResolvedValueOnce(ok(users(0, 2), 'c2')).mockResolvedValueOnce(ok([], 'c3')).mockResolvedValueOnce(ok([], 'c4')).mockResolvedValueOnce(ok(users(7, 1)))
  await render(<BlockedUsers />)
  await screen.findByText('Person 0')
  await act(async () => fireEvent(screen.getByTestId('blocked-users-list'), 'endReached'))
  expect(await screen.findByText('Person 7')).toBeTruthy()
  expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([undefined, 'c2', 'c3', 'c4'])
})
