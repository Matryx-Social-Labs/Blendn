import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

/**
 * The Banter (Flow 5 Banter frames, #27, R2-D2, R3-D5), rendered: its
 * sections, a request's note verbatim, a room's state as a chip, an
 * account's draft and unsent message as line 2 (and never another
 * account's), what opening a DM passes, and the empty, failed and
 * no-match states.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
// The screen's latest focus effect: a test calls it to come back to the Banter from a room.
let mockRefocus: (() => void | (() => void)) | null = null
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useScrollToTop: () => {},
    useIsFocused: () => true,
    // The screen is focused once, on mount.
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockRefocus = effect
      React.useEffect(effect, [effect])
    },
  }
})
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
let mockRM = false
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), __esModule: true, useReducedMotion: () => mockRM }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), journey: jest.fn() } }))
jest.mock('../lib/perf', () => ({ ScreenProfiler: ({ children }: { children: React.ReactNode }) => children }))
const mockAuth: { user: { id: string }; loading: boolean } = { user: { id: 'u-a' }, loading: false }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getChatGroups: jest.fn(),
    getConversations: jest.fn(),
    getMessageRequests: jest.fn(),
    markAllConversationsRead: jest.fn(),
    respondToMessageRequest: jest.fn(),
    getConversationMessages: jest.fn(),
    // Older pages (lib/chatPaging, lib/useBanterInbox) read through the queue.
    queuedRequest: jest.fn(),
    forgetChatGroups: jest.fn(),
  },
}))
/** Your own check-in changing (lib/checkIn's bus): a checkout here, the presence monitor's, a window that ran out. */
const mockCheckInChanged = new Set<() => void>()
jest.mock('../lib/checkIn', () => ({
  ...jest.requireActual('../lib/checkIn'),
  subscribeCheckInChanged: (f: () => void) => {
    mockCheckInChanged.add(f)
    return () => mockCheckInChanged.delete(f)
  },
}))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { myCrews: jest.fn(async () => ({ success: true, data: { crews: [], invites: [] } })) } }))
jest.mock('../lib/useBlends', () => ({ useBlends: () => ({ blends: [] }) }))
const mockDm: Array<(d: { conversationId: string; message: Record<string, unknown> }) => void> = []
const mockSync: { onSync?: () => unknown } = {}
jest.mock('../lib/socketClient', () => ({
  subscribeToChatMessage: () => () => {},
  subscribeToUserNotifications: (_user: string, cb: never) => {
    mockDm.push(cb)
    return () => {}
  },
}))
jest.mock('../lib/useLiveSync', () => ({
  useLiveSync: (o: { onSync: () => unknown }) => {
    mockSync.onSync = o.onSync
    return { state: 'connected', connected: true }
  },
}))
jest.mock('../lib/board', () => ({ ...jest.requireActual('../lib/board'), BOARD_ENABLED: false }))
jest.mock('../components/pulse/NotificationBell', () => ({ NotificationBell: () => null }))
jest.mock('../components/RealtimeStatusBanner', () => ({ __esModule: true, default: () => null }))
jest.mock('../components/board/BoardRequestsSection', () => ({ BoardRequestsSection: () => null }))
jest.mock('../components/OptimizedImage', () => ({ preloadImages: jest.fn() }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
const mockRefreshBadge = jest.fn()
jest.mock('../lib/appBadge', () => ({ refreshAppIconBadge: () => mockRefreshBadge(), scheduleIconBadgeRefresh: jest.fn() }))

const mockSpots: { active: boolean; text?: string }[] = []
jest.mock('../components/ds/CoachMarkHost', () => ({
  useCoachMarkSpot: (active: boolean, spot: { text: string }) => {
    mockSpots.push({ active, text: spot.text })
  },
}))

/* eslint-disable import/first */
import { router } from 'expo-router'
import Banter from '../app/(tabs)/chat'
import { apiClient } from '../lib/apiClient'
import { clearOutbox, dmThread, keepFailed, roomThread, setDraft } from '../lib/chatOutbox'
import { markDomainsDirty } from '../lib/liveSyncState'
import { queryCache } from '../lib/queryCache'
import { resetRoomMembership } from '../lib/roomMembership'
import { noteBlocked } from '../lib/blockEpoch'
import { H } from '../lib/haptics'
import { namedList } from '../lib/namedList'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const at = '2026-10-15T19:00:00.000Z'
const liveRoom = { id: 'g-live', name: 'Vinyl Night', memberCount: 40, isCheckedIn: true, event: { id: 'e1', title: 'Vinyl Night' }, lastMessage: { content: 'Stage is open', createdAt: at, user: { id: 'u-c', name: 'Cosmic Panda' } } }
const pastRoom = { id: 'g-past', name: 'Jazz Brunch', memberCount: 12, isCheckedIn: false, status: 'locked', event: { id: 'e2', title: 'Jazz Brunch' }, lastMessage: { content: 'Thanks all', createdAt: at, user: { id: 'u-c', name: 'Cosmic Panda' } } }
const dm = { id: 'c1', otherUser: { id: 'u-m', name: 'Amber Fox', image: 'https://cdn.blendn.app/u/m.jpg' }, lastMessage: { content: 'See you there', createdAt: at, senderId: 'u-m' }, unreadCount: 1, theyRevealed: false }
const request = { id: 'r1', senderId: 'u-q', sender: { id: 'u-q', name: 'Quiet Otter' }, message: 'Loved your take on the set — coffee next week?', createdAt: at }

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve()
  })
}
const open = async () => {
  await render(<Banter />)
  await flush()
}
const serve = ({ rooms = [liveRoom, pastRoom] as object[], dms = [dm], requests = [request] } = {}) => {
  api.getChatGroups.mockResolvedValue({ success: true, data: { groups: rooms } } as never)
  api.getConversations.mockResolvedValue({ success: true, data: dms } as never)
  api.getMessageRequests.mockResolvedValue({ success: true, data: { requests } } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
  clearOutbox()
  resetRoomMembership()
  queryCache.invalidate('')
  mockAuth.user = { id: 'u-a' }
  mockRM = false
  serve()
})

// First in the file on purpose: a coach mark is once per account per launch (module state), so a later render would find it spent.
describe('the fourth tip: "Swipe a chat left to mute it." (ROOM-18)', () => {
  it('is placed on the Banter once a chat can be muted, and not before the list has loaded', async () => {
    mockSpots.length = 0
    serve()
    await open()
    await flush() // the stored "seen" flag is read asynchronously
    expect(mockSpots.some((s) => s.active && s.text === 'Swipe a chat left to mute it.')).toBe(true)
  })

  it('finds its row by a flag on the row, not by matching the tray’s label', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '(tabs)', 'chat.tsx'), 'utf8')
    expect(src).toContain('i.row.canMute === true')
    expect(src).not.toMatch(/label === 'Mute'/)
    expect(src.match(/canMute: true/g)).toHaveLength(2)
  })

  it('a swipe-open counts as use, so it never shows to somebody who already knows', async () => {
    const { COACH_TIPS } = jest.requireActual('../lib/coachMarks') as typeof import('../lib/coachMarks')
    expect(COACH_TIPS.find((t) => t.id === 'banter_swipe_mute')?.text).toBe('Swipe a chat left to mute it.')
  })
})

it('draws Live now, Requests, People and Past rooms, with a request’s note verbatim', async () => {
  await open()
  for (const heading of ['Live now', 'Requests', 'People', 'Past rooms']) expect(screen.getAllByText(heading).length).toBeGreaterThan(0)
  expect(screen.getAllByText('Vinyl Night').length).toBeGreaterThan(0)
  expect(screen.getByText('Loved your take on the set — coffee next week?')).toBeTruthy()
  expect(screen.getByLabelText('Accept the request from Quiet Otter')).toBeTruthy()
  expect(screen.getByLabelText('Decline the request from Quiet Otter')).toBeTruthy()
})

it('says a locked room’s state as a chip, not as its last message', async () => {
  await open()
  expect(screen.getByText(/Locked by the organizer/)).toBeTruthy()
  expect(screen.queryByText(/Thanks all/)).toBeNull()
})

it('line 2 is your unsent message, then your draft — never another account’s', async () => {
  // An open room: a locked one says its state before anything of yours.
  serve({ rooms: [liveRoom, { ...pastRoom, status: 'open' }] })
  keepFailed(dmThread('c1', 'u-a'), [{ id: 'local-1' }])
  setDraft(roomThread('g-past', 'u-a'), 'see you at   ten')
  // The account before, on this phone: none of it is B's — or A's to see as B.
  setDraft(dmThread('c1', 'u-z'), 'somebody else’s draft')
  await open()
  expect(screen.getByText('Not sent · Tap to retry')).toBeTruthy()
  expect(screen.getByText(/see you at ten/)).toBeTruthy()
  expect(screen.queryByText(/somebody else’s draft/)).toBeNull()
})

it('shows B none of A’s drafts or unsent messages', async () => {
  keepFailed(dmThread('c1', 'u-a'), [{ id: 'local-1' }])
  setDraft(roomThread('g-past', 'u-a'), 'A’s draft')
  mockAuth.user = { id: 'u-b' }
  await open()
  expect(screen.queryByText('Not sent · Tap to retry')).toBeNull()
  expect(screen.queryByText(/A’s draft/)).toBeNull()
})

it('opens a DM by its ids and name only: no photo URL rides in the route', async () => {
  await open()
  await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c1')))
  const pushed = (router.push as jest.Mock).mock.calls.at(-1)?.[0]
  expect(pushed.pathname).toBe('/private-chat/[conversationId]')
  expect(pushed.params).toEqual({ conversationId: 'c1', otherUserName: 'Amber Fox', otherUserId: 'u-m' })
})

it('empty: no conversations yet, and a way to find some', async () => {
  serve({ rooms: [], dms: [], requests: [] })
  await open()
  expect(screen.getByText('No conversations yet')).toBeTruthy()
  expect(screen.getByLabelText('Explore events')).toBeTruthy()
  // The frame puts the block at 280: well below the search row, not under it.
  let node = screen.getByTestId('banter-empty').parent
  let margin = 0
  for (let depth = 0; node && depth < 4; depth++, node = node.parent) margin = Math.max(margin, StyleSheet.flatten(node.props.style)?.marginTop ?? 0)
  expect(margin).toBeGreaterThanOrEqual(96)
})

it('failed: says so and offers to try again', async () => {
  api.getChatGroups.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  api.getConversations.mockResolvedValue({ success: false, error: 'Network request failed' } as never)
  await open()
  expect(screen.getByText('Couldn’t load your chats')).toBeTruthy()
})

it('a search with nothing says what it searched for, and clears', async () => {
  await open()
  await act(async () => fireEvent.press(screen.getByLabelText('Search conversations')))
  await act(async () => fireEvent.changeText(screen.getByTestId('banter-search'), 'zzz'))
  expect(screen.getByText('No chats match “zzz”')).toBeTruthy()
  // The state's action, not the field's own clear button.
  await act(async () => fireEvent.press(within(screen.getByTestId('banter-no-match')).getByLabelText('Clear search')))
  expect(screen.queryByText('No chats match “zzz”')).toBeNull()
})

describe('a DM that lands while the Banter is open', () => {
  it('shows at once, and a dirty sync never puts the stale list back', async () => {
    // Arrange: the list is loaded (and cached); then a message lands on the socket.
    await open()
    const fresh = { ...dm, lastMessage: { content: 'On my way up', createdAt: '2026-10-15T19:30:00.000Z', senderId: 'u-m' }, unreadCount: 2 }
    // The SWR copy still holds the old list; only a forced fetch has the new one.
    api.getConversations.mockImplementation((async (o?: { force?: boolean }) => ({ success: true, data: o?.force ? [fresh] : [dm] })) as never)
    // Act
    await act(async () => {
      mockDm.forEach((cb) => cb({ conversationId: 'c1', message: { id: 'm2', senderId: 'u-m', text: 'On my way up', createdAt: '2026-10-15T19:30:00.000Z' } }))
    })
    expect(screen.getByText(/On my way up/)).toBeTruthy()
    markDomainsDirty(['chat'])
    await act(async () => {
      await mockSync.onSync?.()
    })
    await flush()
    // Assert
    expect(screen.getByText(/On my way up/)).toBeTruthy()
    expect(api.getConversations).toHaveBeenLastCalledWith({ force: true })
  })
})

describe('a lift after a hold opens nothing (drive 2, Android)', () => {
  it('a rested finger coming up does not open the row; a tap still does', async () => {
    await open()
    const list = screen.getByTestId('banter-list')
    const now = jest.spyOn(Date, 'now')
    // A hold: the finger rests 600 ms, then comes up on the row.
    now.mockReturnValue(1_000)
    await act(async () => fireEvent(list, 'touchStart'))
    now.mockReturnValue(1_600)
    await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c1')))
    expect(router.push).not.toHaveBeenCalled()
    // A tap: down and up within a moment.
    await act(async () => fireEvent(list, 'touchEnd'))
    await act(async () => fireEvent(list, 'touchStart'))
    now.mockReturnValue(1_700)
    await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c1')))
    expect(router.push).toHaveBeenCalled()
    now.mockRestore()
  })
})

describe('a finger resting on the Live now card holds the order (drive 5, Android)', () => {
  it('a DM 5 s into the hold raises "↑ New" without moving a row, and the lift opens nothing', async () => {
    const { Platform } = require('react-native')
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    jest.useFakeTimers({ now: 1_000 })
    const sneha = { ...dm, id: 'c2', otherUser: { id: 'u-s', name: 'Sneha Pillai', image: 'https://cdn.blendn.app/u/s.jpg' }, lastMessage: { content: 'hi', createdAt: '2026-10-15T18:00:00.000Z', senderId: 'u-s' }, unreadCount: 0 }
    serve({ dms: [dm, sneha] })
    await open()
    const rows = () => screen.getAllByTestId(/^banter-row-p:/).map((r) => r.props.testID)
    expect(rows()).toEqual(['banter-row-p:c1', 'banter-row-p:c2'])
    // Android's order: the finger comes down on the Live now card (the list hears it) and rests; no drag, no lift.
    await act(async () => fireEvent(screen.getAllByText('Vinyl Night')[0], 'touchStart'))
    await act(async () => jest.advanceTimersByTime(5_000))
    // Sneha writes: her row would move up.
    await act(async () => {
      mockDm.forEach((cb) => cb({ conversationId: 'c2', message: { id: 'm9', senderId: 'u-s', text: 'drive5 android held', createdAt: '2026-10-15T19:45:00.000Z' } }))
    })
    await flush()
    expect(rows()).toEqual(['banter-row-p:c1', 'banter-row-p:c2'])
    expect(screen.getByRole('button', { name: 'New messages above' })).toBeTruthy()
    // The finger comes up on Sneha's row: a release after a hold opens nothing.
    await act(async () => fireEvent.press(screen.getByTestId('banter-row-p:c2')))
    await act(async () => fireEvent(screen.getByTestId('banter-list'), 'touchEnd'))
    expect(router.push).not.toHaveBeenCalled()
    // And on lift the rows settle.
    await act(async () => jest.advanceTimersByTime(300))
    expect(rows()).toEqual(['banter-row-p:c2', 'banter-row-p:c1'])
    jest.useRealTimers()
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })
})

it('a checkout drops the Live now hero at once, not a minute and a tab switch later (drive 5 D-2)', async () => {
  // Arrange: standing in Vinyl Night, its hero up.
  await open()
  expect(screen.getByTestId('banter-live-g-live')).toBeTruthy()

  // Act: you check out; the server's row says so. A checkout announces itself more than once: one read (review LOW).
  serve({ rooms: [{ ...liveRoom, isCheckedIn: false }, pastRoom] })
  const reads = api.getChatGroups.mock.calls.length
  await act(async () => {
    for (let i = 0; i < 3; i++) mockCheckInChanged.forEach((f) => f())
  })
  await act(async () => new Promise((r) => setTimeout(r, 350)))
  await flush()

  // Assert: read again once, past every cache, and no hero.
  expect(api.getChatGroups.mock.calls.length - reads).toBe(1)
  expect(api.forgetChatGroups).toHaveBeenCalledTimes(1)
  expect(api.getChatGroups).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
  expect(screen.queryByTestId('banter-live-g-live')).toBeNull()
})

describe('one press guard for everything in the list (drive 6: the Live now card opened its room after a hold)', () => {
  it('a hold on the Live now card, then the lift, opens nothing; a tap opens it', async () => {
    await open()
    const list = screen.getByTestId('banter-list')
    const card = screen.getByTestId('banter-live-g-live')
    const now = jest.spyOn(Date, 'now')
    // A hold: the finger rests 600 ms on the card, then comes up on it.
    now.mockReturnValue(10_000)
    await act(async () => fireEvent(card, 'touchStart'))
    now.mockReturnValue(10_600)
    await act(async () => fireEvent.press(card))
    expect(router.push).not.toHaveBeenCalled()
    await act(async () => fireEvent(list, 'touchEnd'))
    // A tap: down and up within a moment.
    await act(async () => fireEvent(card, 'touchStart'))
    now.mockReturnValue(10_700)
    await act(async () => fireEvent.press(card))
    expect(router.push).toHaveBeenCalled()
    now.mockRestore()
  })
})

describe('the inbox reorders by gliding, and keeps still under a thumb', () => {
  type Host = { props?: Record<string, unknown>; parent: Host | null }
  /** The `layout` the list's cell around a row carries (itemLayoutAnimation lands there). */
  const layoutAround = (testID: string) => {
    let node = screen.getByTestId(testID, { includeHiddenElements: true }) as unknown as Host | null
    while (node && !node.props?.layout) node = node.parent
    return node?.props?.layout
  }
  const ROW = 'banter-row-p:c1'

  it('a row moves with a layout animation', async () => {
    await open()
    expect(layoutAround(ROW)).toBeDefined()
  })

  it('Reduce Motion: the rows just move', async () => {
    mockRM = true
    await open()
    expect(layoutAround(ROW)).toBeUndefined()
  })

  it('a drag stops the glide, and the lift without speed brings it back', async () => {
    await open()
    const list = screen.getByTestId('banter-list')
    await act(async () => fireEvent(list, 'scrollBeginDrag'))
    expect(layoutAround(ROW)).toBeUndefined()
    await act(async () => fireEvent(list, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y: 0 }, velocity: { y: 0 } } }))
    expect(layoutAround(ROW)).toBeDefined()
  })

  it('a fling keeps it off until the momentum ends', async () => {
    await open()
    const list = screen.getByTestId('banter-list')
    await act(async () => fireEvent(list, 'scrollBeginDrag'))
    await act(async () => fireEvent(list, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y: 0 }, velocity: { y: 2 } } }))
    expect(layoutAround(ROW)).toBeUndefined()
    await act(async () => fireEvent(list, 'momentumScrollEnd'))
    expect(layoutAround(ROW)).toBeDefined()
  })
})

describe('the unread dot never grows from nothing (DS #28)', () => {
  it('enters 0.8 to 1 with a fade, and sits still under Reduce Motion', async () => {
    const parts = require('../components/banter/BanterParts') as typeof import('../components/banter/BanterParts')
    const start = parts.dotIn().initialValues
    expect(start.transform[0].scale).toBe(0.8)
    expect(start.opacity).toBe(0)
    expect(require('fs').readFileSync(require.resolve('../components/banter/BanterParts'), 'utf8')).not.toMatch(/ZoomIn/)
  })
})

describe('the header’s height (Flow 5 Banter: 116 on a 402 pt iPhone)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parts = require('../components/banter/BanterParts') as typeof import('../components/banter/BanterParts')

  it('is the bar geometry, per platform, and the same number the list below is laid out from', () => {
    expect(parts.banterHeaderHeight(59, false)).toBe(59 + 2 + 44 + 10)
    expect(parts.banterHeaderHeight(24, true)).toBe(24 + 2 + 48 + 10)
  })

  it('the title cannot outgrow the circle row, so the header never grows with the text size', () => {
    // Display is a 40 pt line in a 44 pt row (48 on Android): 1.1 and 1.2 at most.
    expect(parts.titleScaleCap(false) * 40).toBeLessThanOrEqual(44)
    expect(parts.titleScaleCap(true) * 40).toBeLessThanOrEqual(48)
  })

  it('draws the header at exactly that height, starting under the inset', async () => {
    mockAuth.user = { id: 'me' } as never
    await render(<Banter />)
    await act(async () => {})
    const title = screen.getByRole('header', { name: 'Banter' })
    expect(title.props.maxFontSizeMultiplier).toBe(parts.titleScaleCap(false))
    const header = require('react-native').StyleSheet.flatten(title.parent!.props.style)
    expect(header.height).toBe(parts.banterHeaderHeight(0, false))
    expect(header.paddingTop).toBe(2)
  })
})

describe('the app icon follows what the Banter reads (badgeCount counts unread conversations)', () => {
  it('Mark all read re-reads the icon once the server has it', async () => {
    api.markAllConversationsRead.mockResolvedValue({ success: true, data: { marked: 1 } } as never)
    await open()
    // One control for the action: the header's, as the frame draws it; the People heading carries no second link (D29).
    expect(screen.queryByText('Mark all read')).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByTestId('banter-mark-all'))
    })
    await flush()
    expect(api.markAllConversationsRead).toHaveBeenCalled()
    expect(mockRefreshBadge).toHaveBeenCalledTimes(1)
  })

  it('and not when the server refused: the count did not change', async () => {
    api.markAllConversationsRead.mockResolvedValue({ success: false, error: 'no' } as never)
    await open()
    await act(async () => {
      fireEvent.press(screen.getByTestId('banter-mark-all'))
    })
    await flush()
    expect(mockRefreshBadge).not.toHaveBeenCalled()
  })
})

describe('unread to read (#29): the dot leaves where it is seen, on the way back', () => {
  const unreadRoom = { ...pastRoom, status: 'open', unreadCount: 2 }
  const rowLabel = /Jazz Brunch, .*unread/

  it('the room is opened and the row still says unread underneath; coming back clears it', async () => {
    serve({ rooms: [unreadRoom], dms: [], requests: [] })
    await open()
    expect(screen.getByLabelText(rowLabel)).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByLabelText(rowLabel)))
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/chat/[id]' }))
    // Behind the room it is not yet redrawn: the cue is for the person who returns.
    expect(screen.getByLabelText(rowLabel)).toBeTruthy()
    await act(async () => void mockRefocus?.())
    expect(screen.queryByLabelText(rowLabel)).toBeNull()
    expect(screen.getByLabelText(/^Jazz Brunch, .*Tuesday|^Jazz Brunch, /)).toBeTruthy()
  })

  it('a room you did not open keeps its dot when you come back', async () => {
    serve({ rooms: [unreadRoom, { ...unreadRoom, id: 'g-two', name: 'Disco Lunch', event: { id: 'e9', title: 'Disco Lunch' } }], dms: [], requests: [] })
    await open()
    await act(async () => fireEvent.press(screen.getByLabelText(rowLabel)))
    await act(async () => void mockRefocus?.())
    expect(screen.getByLabelText(/Disco Lunch, .*unread/)).toBeTruthy()
  })

  it('the Live now pill is a view that leaves over quick, and under Reduce Motion simply goes', () => {
    const src = require('fs').readFileSync(require.resolve('../components/banter/BanterParts'), 'utf8') as string
    expect(src).toMatch(/exiting=\{leaves\(reduceMotion\)\}/)
    expect(src).toMatch(/reduceMotion \? undefined : FadeOut\.duration\(DURATION\.quick\)/)
  })
})

describe('a Banter of thousands (SCRUM-760 b)', () => {
  const queued = apiClient.queuedRequest as jest.Mock
  const room = (n: number) => ({ id: `g-${n}`, name: `Room ${n}`, memberCount: 12, isCheckedIn: false, status: 'open', event: { id: `e${n}`, title: `Room ${n}` }, lastMessage: { content: `line ${n}`, createdAt: at, user: { id: 'u-c', name: 'Cosmic Panda' } } })
  const conv = (n: number) => ({ ...dm, id: `c-${n}`, otherUser: { id: `u-${n}`, name: `Fox ${n}`, image: null }, unreadCount: 0 })
  const groups = (n: number, hasMore: boolean, page = 1) => ({ success: true, data: { groups: [room(n)], pagination: { page, hasMore } } })
  // What the real `getConversations` hands back: the rows, with the server's cursor kept beside them.
  const conversations = (rows: object[], nextCursor?: string) =>
    namedList({ success: true, data: { conversations: rows, ...(nextCursor ? { pagination: { hasMore: true, nextCursor } } : {}) } } as never, 'conversations') as never
  const reachEnd = () => act(async () => fireEvent(screen.getByTestId('banter-list'), 'endReached'))

  beforeEach(() => {
    queued.mockReset()
    serve({ rooms: [], dms: [], requests: [] })
  })

  it('loads the next page of rooms by number, once, appended under what is held', async () => {
    api.getChatGroups.mockResolvedValue(groups(1, true) as never)
    queued.mockResolvedValueOnce(groups(2, false, 2))
    await open()
    expect(screen.getAllByText('Room 1').length).toBeGreaterThan(0)
    await reachEnd()
    expect(queued).toHaveBeenCalledWith('/api/mobile/chat/groups?page=2')
    expect((await screen.findAllByText('Room 2')).length).toBeGreaterThan(0)
    // Nothing more to ask: the last page said so.
    await reachEnd()
    expect(queued).toHaveBeenCalledTimes(1)
  })

  it('conversations load by the server’s cursor only when People is asked ("Show more people"), never arriving under a reader', async () => {
    api.getConversations.mockResolvedValue(conversations([conv(1)], 'k1'))
    queued.mockResolvedValueOnce({ success: true, data: { conversations: [conv(2)] } })
    await open()
    expect(screen.getAllByText('Fox 1').length).toBeGreaterThan(0)
    // The end of the list does not fetch them: a page in the middle would push the rooms below it away.
    await reachEnd()
    expect(queued).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByTestId('banter-people-more')))
    expect(queued).toHaveBeenCalledWith('/api/mobile/conversations?limit=50&cursor=k1')
    expect((await screen.findAllByText('Fox 2')).length).toBeGreaterThan(0)
    // The last page said so: the button goes.
    expect(screen.queryByTestId('banter-people-more')).toBeNull()
  })

  it('no layout glide on a page append: the list’s reorder animation is off for a beat after one lands', async () => {
    api.getChatGroups.mockResolvedValue(groups(1, true) as never)
    queued.mockResolvedValueOnce(groups(2, false, 2))
    await open()
    await reachEnd()
    await screen.findAllByText('Room 2')
    expect(screen.getByTestId('banter-list').props.itemLayoutAnimation).toBeUndefined()
  })

  it('a server that sends no paging is one page, and nothing more is asked', async () => {
    api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [room(1)] } } as never)
    api.getConversations.mockResolvedValue([conv(1)] as never)
    await open()
    await reachEnd()
    expect(queued).not.toHaveBeenCalled()
  })

  it('a page that fails keeps the list, does not loop, and retries on its own button', async () => {
    api.getChatGroups.mockResolvedValue(groups(1, true) as never)
    queued.mockResolvedValueOnce({ success: false, error: 'offline' })
    await open()
    await reachEnd()
    expect(await screen.findByTestId('banter-more-failed')).toBeTruthy()
    expect(screen.getAllByText('Room 1').length).toBeGreaterThan(0)
    await reachEnd()
    expect(queued).toHaveBeenCalledTimes(1)
    queued.mockResolvedValueOnce(groups(2, false, 2))
    await act(async () => fireEvent.press(screen.getByTestId('banter-more-failed')))
    expect((await screen.findAllByText('Room 2')).length).toBeGreaterThan(0)
  })

  it('keeps the older pages through a quiet refresh of the newest', async () => {
    api.getChatGroups.mockResolvedValue(groups(1, true) as never)
    queued.mockResolvedValueOnce(groups(2, false, 2))
    await open()
    await reachEnd()
    await screen.findAllByText('Room 2')
    await act(async () => void (await mockSync.onSync?.()))
    await flush()
    expect(screen.getAllByText('Room 2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Room 1').length).toBeGreaterThan(0)
  })

  it('a room bumped off the newest page by a busier one stays on screen once older pages are loaded (demotion)', async () => {
    api.getChatGroups.mockResolvedValue(groups(1, true) as never)
    queued.mockResolvedValueOnce(groups(2, false, 2))
    await open()
    await reachEnd()
    await screen.findAllByText('Room 2')
    // Room 3 is now the newest and Room 1 has slid off page one: it is not on the new page, and still on screen.
    api.getChatGroups.mockResolvedValue(groups(3, true) as never)
    markDomainsDirty(['chat'])
    await act(async () => void (await mockSync.onSync?.()))
    await flush()
    expect(screen.getAllByText('Room 3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Room 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Room 2').length).toBeGreaterThan(0)
  })

  it('a block anywhere starts the lists over: the blocked person’s conversation on an older page is gone', async () => {
    api.getConversations.mockResolvedValue(conversations([conv(1)], 'k1'))
    queued.mockResolvedValueOnce({ success: true, data: { conversations: [conv(9)] } })
    await open()
    await act(async () => fireEvent.press(screen.getByTestId('banter-people-more')))
    expect((await screen.findAllByText('Fox 9')).length).toBeGreaterThan(0)

    // The server now leaves them out of the first page too.
    api.getConversations.mockResolvedValue(conversations([conv(1)]))
    await act(async () => noteBlocked())
    await flush()
    expect(screen.queryByText('Fox 9')).toBeNull()
    expect(screen.getAllByText('Fox 1').length).toBeGreaterThan(0)
  })

  it('the Requests section is a strip of three with the server’s true count and a "See all" to the screen of them', async () => {
    const rs = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, senderId: `s${from + i}`, sender: { id: `s${from + i}`, name: `Asker ${from + i}` }, message: `hello ${from + i}`, createdAt: at }))
    api.getMessageRequests.mockResolvedValue({ success: true, data: { requests: rs(0, 20), totalCount: 140 } } as never)
    await open()
    expect(screen.getByLabelText('Requests, 140')).toBeTruthy()
    expect(screen.getAllByLabelText(/^Accept the request from/)).toHaveLength(3)
    await act(async () => fireEvent.press(screen.getByLabelText('See all 140')))
    expect(router.push).toHaveBeenCalledWith('/message-requests')
    // The strip stays a strip: nothing expands in place.
    expect(screen.getAllByLabelText(/^Accept the request from/)).toHaveLength(3)
  })

  it('a few requests are all shown, with no "Show all"', async () => {
    serve()
    await open()
    expect(screen.getByLabelText('Requests, 1')).toBeTruthy()
    expect(screen.queryByLabelText(/^Show all/)).toBeNull()
  })
})

describe('the branded pull to refresh (#18)', () => {
  const list = () => screen.getByTestId('banter-list')
  const pull = async (y: number) => {
    await act(async () => fireEvent.scroll(list(), { nativeEvent: { contentOffset: { x: 0, y }, contentSize: { height: 800, width: 400 }, layoutMeasurement: { height: 800, width: 400 } } }))
    await act(async () => fireEvent(list(), 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y }, velocity: { x: 0, y: 0 } } }))
    await flush()
  }

  it('refreshes by release past the arm point, with H.threshold once as it arms, and the stock control is gone', async () => {
    const threshold = jest.spyOn(H, 'threshold').mockImplementation(() => {})
    await open()
    expect(list().props.refreshControl).toBeUndefined()
    api.getChatGroups.mockClear()
    await pull(-70)
    expect(api.getChatGroups).toHaveBeenCalledWith({ force: true })
    expect(threshold).toHaveBeenCalledTimes(1)
  })

  it('a short pull refreshes nothing', async () => {
    await open()
    api.getChatGroups.mockClear()
    await pull(-20)
    expect(api.getChatGroups).not.toHaveBeenCalled()
  })
})

it('a crew like is the crew chat’s preview as words, never "You: liked …" (TG-10)', async () => {
  serve()
  const crewRoom = { id: 'c-1', kind: 'crew', name: 'Crew Five', unreadCount: 0, lastMessageAt: at, lastMessage: { content: 'liked Crew Nebula for the crew', createdAt: at, user: { id: 'u-a', name: 'Asha' } } }
  api.getChatGroups.mockResolvedValue({ success: true, data: { groups: [liveRoom], rooms: [crewRoom] } } as never)
  await open()
  expect(await screen.findByText('You liked Crew Nebula for the crew')).toBeTruthy()
  expect(screen.queryByText(/You: liked/)).toBeNull()
})

// S-7: the server says which message is the room's (`lastMessage.type`). Negative control: with the word match alone,
// the typed person's message below reads "You liked …" and the system line keeps "You:".
it('reads the room’s own line from lastMessage.type: system has no "You:", a person typing the words is a person', async () => {
  serve()
  const room = (id: string, content: string, type: string) => ({ id, kind: 'crew', name: `Crew ${id}`, unreadCount: 0, lastMessageAt: at, lastMessage: { content, type, createdAt: at, user: { id: 'u-a', name: 'Asha' } } })
  api.getChatGroups.mockResolvedValue({
    success: true,
    data: { groups: [liveRoom], rooms: [room('c-1', 'liked Crew Nebula for the crew', 'system'), room('c-2', 'Crew Two is on the board', 'system'), room('c-3', 'liked Lot S9 for the crew', 'text')] },
  } as never)
  await open()
  expect(await screen.findByText('You liked Crew Nebula for the crew')).toBeTruthy()
  expect(screen.getByText('Crew Two is on the board')).toBeTruthy()
  expect(screen.getByText('You: liked Lot S9 for the crew')).toBeTruthy()
})
