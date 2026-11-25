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
jest.mock('../lib/blockedUsersPage', () => ({ ...jest.requireActual('../lib/blockedUsersPage'), fetchBlockedPage: (...a: unknown[]) => mockFetch(...a) }))
jest.mock('../lib/safetyUtils', () => ({ unblockUser: jest.fn() }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
const mockHiddenCrews = jest.fn()
jest.mock('../lib/crewsApi', () => ({ crewsApi: { hiddenCrews: (...a: unknown[]) => mockHiddenCrews(...a), unhideCrew: jest.fn() } }))
const mockShowSheet = jest.fn()
jest.mock('../lib/sheet', () => ({ ...jest.requireActual('../lib/sheet'), showSheet: (...a: unknown[]) => mockShowSheet(...a) }))

import { AccessibilityInfo } from 'react-native'
import BlockedUsers from '../app/blocked-users'

const mockAnnounce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})

const user = (i: number) => ({ blocked_id: `u${i}`, blocked_user_name: `Person ${i}`, blocked_user_photo: null, reason: null, blocked_at: '2026-09-12T10:00:00Z' })
const users = (from: number, n: number) => Array.from({ length: n }, (_, i) => user(from + i))
const ok = (list: unknown[], nextCursor: string | null = null, total: number = list.length) => ({ ok: true, page: { users: list, nextCursor, total } })

const crewsAnswer = (n: number) => ({
  success: true,
  data: {
    crews: Array.from({ length: n }, (_, i) => ({ crewId: `c${i}`, name: `Crew ${i}`, emblemSeed: `c${i}`, hiddenAt: '2026-11-02T10:00:00Z' })),
    pagination: { page: 1, limit: 3, totalCount: n, totalPages: 1, hasMore: false },
  },
})

beforeEach(() => {
  mockFetch.mockReset()
  mockShowSheet.mockReset()
  mockHiddenCrews.mockReset()
  mockHiddenCrews.mockResolvedValue(crewsAnswer(0))
})

it('B-A: blocked crews go first; with people too, People gets its own heading', async () => {
  mockHiddenCrews.mockResolvedValue(crewsAnswer(2))
  mockFetch.mockResolvedValue(ok([user(1)]))
  await render(<BlockedUsers />)
  expect(await screen.findByText('Crew 0')).toBeTruthy()
  expect(screen.getByText('Person 1')).toBeTruthy()
  expect(screen.getByText('People')).toBeTruthy()
})

it('each group owns its line: with both, the people’s is under People, after the crews (advisor 2026-11-25)', async () => {
  mockHiddenCrews.mockResolvedValue(crewsAnswer(1))
  mockFetch.mockResolvedValue(ok([user(1)]))
  const view = await render(<BlockedUsers />)
  await screen.findByText('Crew 0')
  const words = JSON.stringify(view.toJSON())
  const at = (text: string) => words.indexOf(text)
  expect(screen.getAllByText('They can’t see you or message you. They aren’t told.')).toHaveLength(1)
  expect(at('They can’t see you')).toBeGreaterThan(at('"People"'))
  expect(at('"People"')).toBeGreaterThan(at('You won’t see these crews'))
})

it('people only: their line is on top, with no heading, as before', async () => {
  mockFetch.mockResolvedValue(ok([user(1)]))
  await render(<BlockedUsers />)
  expect(await screen.findByText('They can’t see you or message you. They aren’t told.')).toBeTruthy()
  expect(screen.queryByText('People')).toBeNull()
})

it('B-A: crews blocked and nobody else: no "Nobody blocked", no People heading', async () => {
  mockHiddenCrews.mockResolvedValue(crewsAnswer(1))
  mockFetch.mockResolvedValue(ok([]))
  await render(<BlockedUsers />)
  expect(await screen.findByText('Crew 0')).toBeTruthy()
  expect(screen.queryByText('Nobody blocked')).toBeNull()
  expect(screen.queryByText('People')).toBeNull()
})

it('nobody blocked says so, top-aligned as Muted rooms is (D-L11)', async () => {
  mockFetch.mockResolvedValue(ok([]))
  await render(<BlockedUsers />)
  // Me + settings A 06: says where blocking happens, not a generic line.
  expect(await screen.findByText('Nobody blocked')).toBeTruthy()
  expect(screen.getByText('Block someone from their profile or a chat. They aren’t told, and you can unblock here any time.')).toBeTruthy()
  // Negative control: the centred empty list (`justifyContent: 'center'`) fails this.
  const list = screen.getByTestId('blocked-users-list')
  expect(StyleSheet.flatten(list.props.contentContainerStyle).justifyContent).toBeUndefined()
})

it('a failed read says it did not load, never "no blocked users"', async () => {
  mockFetch.mockResolvedValue({ ok: false, error: 'offline' })
  await render(<BlockedUsers />)
  expect(await screen.findByText("Blocked didn’t load")).toBeTruthy()
  expect(screen.queryByText('Nobody blocked')).toBeNull()
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

it('Unblock is the neutral, not red: it gives access back, it does not take anything (Me + settings A, NOTES: red is Delete only)', async () => {
  mockFetch.mockResolvedValue(ok([user(1)]))
  await render(<BlockedUsers />)
  await screen.findByText('Person 1')
  await act(async () => fireEvent.press(screen.getByLabelText('Unblock Person 1')))
  const [unblock] = mockShowSheet.mock.calls[0][0].actions
  expect(unblock.label).toBe('Unblock')
  expect(unblock.variant).toBe('secondary')
})

it('asks for the next page when the end comes into view, once, and adds it without repeats', async () => {
  mockFetch.mockResolvedValueOnce(ok(users(0, 3), 'c2')).mockResolvedValueOnce(ok([user(2), ...users(3, 2)]))
  await render(<BlockedUsers />)
  await screen.findByText('Person 0')
  const list = screen.getByTestId('blocked-users-list')
  await act(async () => fireEvent(list, 'endReached'))
  expect(await screen.findByText('Person 4')).toBeTruthy()
  expect(mockFetch).toHaveBeenLastCalledWith('c2', '')
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
  expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([null, 'c2', 'c3', 'c4'])
})

describe('at scale (Me + settings A 06): the server\'s count, and a search past 20 that asks the server', () => {
  // A test above leaves fake timers on.
  beforeEach(() => jest.useRealTimers())
  it('20 people: no search', async () => {
    mockFetch.mockResolvedValue(ok(users(0, 20)))
    await render(<BlockedUsers />)
    await screen.findByText('Person 0')
    // Negative control: BLOCKED_SEARCH_FROM at 19 draws a search here.
    expect(screen.queryByTestId('blocked-search')).toBeNull()
  })

  it('a long list says the server\'s total, not the page\'s', async () => {
    mockFetch.mockResolvedValue(ok(users(0, 50), 'c2', 12480))
    await render(<BlockedUsers />)
    await screen.findByText('Person 0')
    expect(screen.getByPlaceholderText('Search 12,480 people')).toBeTruthy()
    expect(screen.getByText('They can’t see you or message you. They aren’t told.')).toBeTruthy()
  })

  it('a search asks the server, pages its own results, and comes back to the whole list when cleared', async () => {
    mockFetch.mockResolvedValueOnce(ok(users(0, 50), 'c2', 1200))
    await render(<BlockedUsers />)
    await screen.findByText('Person 0', {}, { timeout: 3000 })
    mockFetch.mockResolvedValueOnce(ok([{ ...user(900), blocked_user_name: null, seen_as: 'Cosmic Panda' }], 's2', 3))
    await act(async () => fireEvent.changeText(screen.getByTestId('blocked-search-input'), 'cosmic'))
    expect(await screen.findByText('Cosmic Panda', {}, { timeout: 3000 })).toBeTruthy()
    expect(mockFetch).toHaveBeenLastCalledWith(null, 'cosmic')
    expect(screen.queryByText('Person 0')).toBeNull()
    // The count stays the whole list's; what the search found is announced (SearchField's resultsLabel).
    expect(screen.getByPlaceholderText('Search 1,200 people')).toBeTruthy()
    expect(mockAnnounce).toHaveBeenCalledWith('3 found')

    mockFetch.mockResolvedValueOnce(ok([user(901)], null, 3))
    await act(async () => fireEvent(screen.getByTestId('blocked-users-list'), 'endReached'))
    expect(await screen.findByText('Person 901')).toBeTruthy()
    expect(mockFetch).toHaveBeenLastCalledWith('s2', 'cosmic')

    mockFetch.mockResolvedValueOnce(ok([], null, 0))
    await act(async () => fireEvent.changeText(screen.getByTestId('blocked-search-input'), 'zzz'))
    expect(await screen.findByText('Nobody called “zzz”', {}, { timeout: 3000 })).toBeTruthy()

    mockFetch.mockResolvedValueOnce(ok(users(0, 50), 'c2', 1200))
    await act(async () => fireEvent.changeText(screen.getByTestId('blocked-search-input'), ''))
    expect(await screen.findByText('Person 0', {}, { timeout: 3000 })).toBeTruthy()
  })
})

describe('telling one "Someone" from another (SCRUM-1082)', () => {
  it('a person never named shows the pseudonym you saw, its creature, and where you blocked them', async () => {
    mockFetch.mockResolvedValue(
      ok([
        { ...user(1), blocked_user_name: null, seen_as: 'Velvet Otter', seen_in: 'Saint-Jean-sur-Richelieu Social Club' },
        { ...user(2), blocked_user_name: null, seen_as: 'Amber Heron', seen_in: 'Tech Week' },
      ])
    )
    await render(<BlockedUsers />)
    expect(await screen.findByText('Velvet Otter')).toBeTruthy()
    expect(screen.getByText('Amber Heron')).toBeTruthy()
    expect(screen.getByText(/Saint-Jean-sur-Richelieu Social Club/)).toBeTruthy()
    expect(screen.getAllByTestId('person-creature', { includeHiddenElements: true })).toHaveLength(2)
    expect(screen.queryByText('Someone')).toBeNull()
    expect(screen.getByLabelText('Unblock Velvet Otter')).toBeTruthy()
  })

  it('a name you were allowed to see still wins over the pseudonym', async () => {
    mockFetch.mockResolvedValue(ok([{ ...user(1), blocked_user_name: 'Marc-André Lefebvre-Desrosiers', seen_as: 'Velvet Otter' }]))
    await render(<BlockedUsers />)
    expect(await screen.findByText('Marc-André Lefebvre-Desrosiers')).toBeTruthy()
    expect(screen.queryByText('Velvet Otter')).toBeNull()
  })

  it('nothing known is "Someone"; a deleted account says so', async () => {
    mockFetch.mockResolvedValue(ok([{ ...user(1), blocked_user_name: null }, { ...user(2), blocked_user_name: null, account_deleted: true }]))
    await render(<BlockedUsers />)
    expect(await screen.findAllByText('Someone')).toHaveLength(2)
    expect(screen.getByText('Deleted account')).toBeTruthy()
  })
})

it('blockedCountLine: a person, people, in thousands', () => {
  const { blockedCountLine } = jest.requireActual('../lib/blockedUsersPage')
  expect(blockedCountLine(0)).toBeNull()
  expect(blockedCountLine(1)).toBe('1 person')
  expect(blockedCountLine(3)).toBe('3 people')
  expect(blockedCountLine(12480)).toBe('12,480 people')
})
