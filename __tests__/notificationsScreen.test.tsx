/**
 * The Notifications screen (Flow 9 · 9.2): every state the frames draw, driven against a mocked API.
 *
 * Behavioural, because each is a branch a source grep would pass by name alone: loading, failed,
 * empty, populated in three sections, the request answered in place (pending → done, stale, decline),
 * See all, the ⋯ menu and Clear all, paging, opening marking everything seen.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
const mockParams: Record<string, string> = {}
const mockAsk = jest.fn()
jest.mock('../lib/friendsSeeMeAsk', () => ({ askFriendsSeeMe: (...a: unknown[]) => mockAsk(...a), useStillHere: () => () => true }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(() => fn(), [fn]),
  // A new object per call, as the router hands out when params change.
  useLocalSearchParams: () => ({ ...mockParams }),
  useIsFocused: () => true,
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
const mockUser = { user: { id: 'u_me' } }
jest.mock('../lib/useAuth', () => ({ useAuth: () => mockUser }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getNotifications: jest.fn(),
    markNotificationsRead: jest.fn(),
    clearNotifications: jest.fn(),
    respondToFriendRequest: jest.fn(),
    getFriendRequests: jest.fn(),
    getFriends: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}))
// The fetch deadline at 100 ms, so the answer's (three of them) passes in a test's time.
jest.mock('../lib/fetchTimeout', () => ({ ...jest.requireActual('../lib/fetchTimeout'), REQUEST_TIMEOUT_MS: 100 }))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { decline: jest.fn(), myCrews: jest.fn() } }))
jest.mock('../lib/notifications', () => ({
  navigateFromNotificationData: jest.fn(),
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => true),
}))
let mockBell: (() => void) | null = null
jest.mock('../lib/socketClient', () => ({
  subscribeToBell: (fn: () => void) => {
    mockBell = fn
    return () => {
      mockBell = null
    }
  },
}))
const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), setBadgeCountAsync: jest.fn() }))
jest.mock('../lib/haptics', () => ({
  H: { destructive: jest.fn(), toggle: jest.fn(), error: jest.fn(), primary: jest.fn(), success: jest.fn(), threshold: jest.fn(), select: jest.fn() },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import NotificationsScreen from '../app/notifications'
import { SheetHost } from '../components/SheetHost'
import { COLOR, SPACE } from '../lib/design/tokens'
import { apiClient } from '../lib/apiClient'
import { crewsApi } from '../lib/crewsApi'
import type { NotificationItem } from '../lib/notificationFormat'
import { navigateFromNotificationData } from '../lib/notifications'
import { H } from '../lib/haptics'
import * as sheetModule from '../lib/sheet'
import { closeSheet } from '../lib/sheet'
import { ANSWER_DEADLINE_MS, DONE_DWELL_MS } from '../lib/useNotificationFeed'
import { forgetPushPermission } from '../lib/pushStatus'
import { resetFriendRequests, useFriendRequestsState } from '../lib/friendRequests'
import { crewInviteAnswered, resetCrewInvites, useCrewInvites } from '../lib/crewInvites'
import { useFriendRequests } from '../lib/useFriendRequests'
import { isLitControl } from './helpers/lit'

const api = apiClient as jest.Mocked<typeof apiClient>
const permissions = Notifications.getPermissionsAsync as jest.Mock
const setBadge = Notifications.setBadgeCountAsync as jest.Mock

const NOW = Date.now()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN

const item = (over: Partial<NotificationItem> & Pick<NotificationItem, 'id' | 'kind'>): NotificationItem => ({
  title: 'T',
  body: 'B',
  data: null,
  readAt: null,
  createdAt: ago(5 * MIN),
  ...over,
})

const friend = item({ id: 'f1', kind: 'friend_request', title: 'New friend request', data: { requestId: 'r1' } })
const invite = item({ id: 'c1', kind: 'crew_invite', title: 'You’re invited to a crew', data: { crewId: 'cr1' } })
const match = item({ id: 'm1', kind: 'match', title: 'You have a new match', data: { conversationId: 'conv1' } })
const older = item({ id: 'e1', kind: 'friend_accepted', title: 'Friend request accepted', readAt: ago(HOUR), createdAt: ago(30 * HOUR) })

const feed = (notifications: NotificationItem[], extra: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    notifications,
    unreadCount: notifications.filter((n) => n.readAt === null).length,
    pagination: { limit: 30, hasMore: false },
    ...extra,
  },
})

/** The screen with the app's one sheet host beside it, as the root layout mounts them. */
const Screen = () => (
  <View>
    <NotificationsScreen />
    <SheetHost />
  </View>
)

beforeEach(async () => {
  // The permission is read once a session (RC drive D1): each test is a new one.
  forgetPushPermission()
  jest.clearAllMocks()
  await AsyncStorage.clear()
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  api.getNotifications.mockResolvedValue(feed([friend, match, older]) as never)
  api.markNotificationsRead.mockResolvedValue({ success: true } as never)
  api.clearNotifications.mockResolvedValue({ success: true } as never)
  /*
   * The shared lists hold exactly the asks the feed names as open, unless a test says one was answered elsewhere: Waiting on you
   * is those lists (SCRUM-1062), so a list holding more than the feed would add rows a test did not ask for. Read off the feed's
   * mock without calling it, so no test's count of feed reads moves.
   */
  const feedAsks = async (kind: string, key: string) => {
    const read = (await api.getNotifications.getMockImplementation()?.()) as { data?: { notifications?: NotificationItem[] } } | undefined
    const ids = (read?.data?.notifications ?? []).filter((n) => n.kind === kind && n.open !== false).map((n) => n.data?.[key])
    return ids.filter((id): id is string => typeof id === 'string')
  }
  api.getFriendRequests.mockImplementation(
    async () => ({ success: true, data: { incoming: (await feedAsks('friend_request', 'requestId')).map((id) => ({ id, person: { userId: `u_${id}` } })), outgoing: [] } }) as never
  )
  ;(crewsApi.myCrews as jest.Mock).mockImplementation(async () => ({
    success: true,
    data: { crews: [], invites: (await feedAsks('crew_invite', 'crewId')).map((crewId) => ({ crewId, name: `Crew ${crewId}` })) },
  }))
  // Those lists are shared by every surface, so each test starts them from nothing.
  resetFriendRequests()
  resetCrewInvites()
  api.getFriends.mockResolvedValue({ success: true, data: { friends: [], count: 0 } } as never)
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
})
afterEach(async () => {
  await act(async () => closeSheet())
})

describe('the states', () => {
  it('draws six skeleton rows while it loads, as one busy element', async () => {
    api.getNotifications.mockReturnValue(new Promise(() => {}) as never)
    await render(<Screen />)
    expect(screen.getByLabelText('Loading notifications')).toBeTruthy()
    expect(screen.queryByText('Quiet for now')).toBeNull()
  })

  it('says it could not load, and Try again reads it again', async () => {
    api.getNotifications.mockResolvedValueOnce({ success: false, error: 'offline' } as never)
    await render(<Screen />)
    expect(await screen.findByText('Couldn’t load notifications')).toBeTruthy()
    expect(screen.queryByText('Quiet for now')).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('New friend request')).toBeTruthy()
    expect(api.getNotifications).toHaveBeenCalledTimes(2)
  })

  it('is “Quiet for now” with nothing, in the design’s words and without the old copy', async () => {
    api.getNotifications.mockResolvedValue(feed([]) as never)
    await render(<Screen />)
    expect(await screen.findByText('Quiet for now')).toBeTruthy()
    // Requests placement A, board 04: message requests are in Banter now, and the copy says so.
    expect(screen.getByText('Friend requests, crew invites, matches and event changes land here. Messages and message requests are in Banter.')).toBeTruthy()
    expect(screen.queryByText(/Waves, matches and reminders/)).toBeNull()
  })

  it('keeps what it had through a failed refresh rather than say “Quiet for now”', async () => {
    await render(<Screen />)
    await screen.findByText('New friend request')
    api.getNotifications.mockResolvedValue({ success: false } as never)
    await act(async () => mockBell?.())
    expect(screen.getByText('New friend request')).toBeTruthy()
    expect(screen.queryByText('Couldn’t load notifications')).toBeNull()
  })

  it('shows Waiting on you with its count, then New, then Earlier, and the foot sentence', async () => {
    await render(<Screen />)
    expect(await screen.findByRole('header', { name: 'Waiting on you, 1' })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'New' })).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Earlier' })).toBeTruthy()
    expect(screen.getByText(/everything we keep: read notifications for 30 days, unread for 90/)).toBeTruthy()
    // The request carries its pills; a plain row does not.
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy()
  })

  it('sits on the app’s one 24 pt gutter, like every other list (r7 M3)', async () => {
    await render(<Screen />)
    await screen.findByRole('header', { name: 'Waiting on you, 1' })
    const card = StyleSheet.flatten(screen.getByTestId('notifications-waiting-card').props.style)
    expect(card.marginHorizontal).toBe(SPACE.gutter)
    // The section heading's inset: the first ancestor that pads it.
    let node = screen.getByTestId('notifications-new').parent
    while (node && StyleSheet.flatten(node.props.style)?.paddingHorizontal === undefined) node = node.parent
    expect(StyleSheet.flatten(node!.props.style).paddingHorizontal).toBe(SPACE.gutter)
  })

  it('shows three of the requests and “See all N” for the rest', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => item({ id, kind: 'friend_request', data: { requestId: `r${id}` } }))
    api.getNotifications.mockResolvedValue(feed(five) as never)
    await render(<Screen />)
    expect(await screen.findByRole('header', { name: 'Waiting on you, 5' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(3)
    fireEvent.press(screen.getByRole('button', { name: 'See all 5' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(5))
    expect(screen.queryByRole('button', { name: 'See all 5' })).toBeNull()
  })

  it('a row opens where the push would', async () => {
    await render(<Screen />)
    fireEvent.press(await screen.findByText('You have a new match'))
    expect(navigateFromNotificationData).toHaveBeenCalledWith({ conversationId: 'conv1' })
  })
})

describe('opening marks everything seen', () => {
  it('asks the server once, and the rows that were unseen stay New', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    expect(api.markNotificationsRead).toHaveBeenCalledTimes(1)
    expect(api.markNotificationsRead).toHaveBeenCalledWith()
    // Still under New: the screen is not the place a row stops being new.
    expect(screen.getByRole('button', { name: /You have a new match.*new$/ })).toBeTruthy()
  })

  it('asks nothing when there was nothing unseen', async () => {
    api.getNotifications.mockResolvedValue(feed([older]) as never)
    await render(<Screen />)
    await screen.findByText('Friend request accepted')
    expect(api.markNotificationsRead).not.toHaveBeenCalled()
  })
})

describe('answering a request in place', () => {
  it('Accept is a spinner, then “You’re friends now” inline, then the row leaves; nothing else changes', async () => {
    jest.setTimeout(10000)
    let finish: (v: unknown) => void = () => {}
    api.respondToFriendRequest.mockReturnValue(new Promise((r) => (finish = r)) as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    expect(api.respondToFriendRequest).toHaveBeenCalledWith('r1', 'accept')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: true }))

    await act(async () => finish({ success: true }))
    expect(await screen.findByText('You’re friends now')).toBeTruthy()
    expect(mockAsk).toHaveBeenCalledWith({ stillHere: expect.any(Function) })
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
    // The moment plays where it was answered: the row has not left Waiting (a remount there arrives done, and plays nothing).
    expect(screen.getByRole('header', { name: /Waiting on you/ })).toBeTruthy()
    await waitFor(() => expect(H.success).toHaveBeenCalledTimes(1))

    // It stays inline for 2 s (the prototype's dwell), then the row leaves.
    await waitFor(() => expect(screen.queryByText('You’re friends now')).toBeNull(), { timeout: DONE_DWELL_MS + 1000 })
    expect(screen.queryByRole('header', { name: /Waiting on you/ })).toBeNull()
    expect(screen.queryByText('New friend request')).toBeNull()
    expect(H.success).toHaveBeenCalledTimes(1)
  })

  it('Decline collapses the row and says nothing to anybody', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Decline' }))
    expect(api.respondToFriendRequest).toHaveBeenCalledWith('r1', 'dismiss')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull())
    expect(mockShowToast).not.toHaveBeenCalled()
    expect(mockAsk).not.toHaveBeenCalled()
  })

  it('a request that is no longer open says so and keeps no pills', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('This request is no longer open')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('a failure puts the pills back and says so in a toast', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: false, error: 'boom' } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That didn’t go through. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
  })

  // SCRUM-754: iOS Accept spun for 2+ minutes. The awaited call had no deadline of its own and `answer()` no catch,
  // so a call that never settled (or threw) held the row on its spinner for good.
  it('an answer that never settles gives the pills back after the deadline, with the toast', async () => {
    api.respondToFriendRequest.mockReturnValue(new Promise(() => {}) as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: true }))
    expect(mockShowToast).not.toHaveBeenCalled()
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That didn’t go through. Try again.', 'error', { haptic: 'error' }), {
      timeout: ANSWER_DEADLINE_MS * 2,
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: false }))
  })

  it('an answer that throws gives the pills back, and a second tap is sent', async () => {
    api.respondToFriendRequest.mockRejectedValueOnce(new Error('Request queue cleared')).mockResolvedValue({ success: true } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That didn’t go through. Try again.', 'error', { haptic: 'error' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Decline' }).props.accessibilityState).toMatchObject({ busy: false }))
    fireEvent.press(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(api.respondToFriendRequest).toHaveBeenCalledTimes(2))
  })

  // SCRUM-1036: and it is not left behind as "New friend request" either: an answered friend request leaves the feed.
  it('a request answered somewhere else is not Waiting on you, and not a "New friend request" either', async () => {
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } } as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await waitFor(() => expect(screen.queryByText('New friend request')).toBeNull())
    expect(screen.queryByRole('header', { name: /Waiting on you/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
  })

  it('the server’s own word that a request is closed (`open: false`) leaves it out from the first frame', async () => {
    api.getNotifications.mockResolvedValue(feed([{ ...friend, open: false }, match]) as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    expect(screen.queryByText('New friend request')).toBeNull()
  })

  it('51 requests waiting: one not on the first page of 50 is still waiting, not answered elsewhere', async () => {
    const others = Array.from({ length: 50 }, (_, i) => ({ id: `other${i}`, person: { userId: `u_other${i}`, name: `Other ${i}` }, createdAt: ago(HOUR) }))
    api.getFriendRequests.mockResolvedValue({
      success: true,
      data: { incoming: others, outgoing: [], pagination: { incoming: { limit: 50, hasMore: true, nextCursor: 'i1', totalCount: 51 } } },
    } as never)
    await render(<Screen />)
    expect(within(await screen.findByTestId('notification-f1')).getByRole('button', { name: 'Accept' })).toBeTruthy()
    await act(async () => {})
    expect(within(screen.getByTestId('notification-f1')).getByRole('button', { name: 'Accept' })).toBeTruthy()
    // Counted as the list counts it: the server's 51, not the 50 read.
    expect(screen.getByRole('header', { name: 'Waiting on you, 51' })).toBeTruthy()
    expect(screen.queryByText('This request is no longer open')).toBeNull()
  })

  it('a partial list still says who sent the requests on it: a timed-out Accept is checked against friends', async () => {
    const onPage = ['r1', 'r2', 'ra', 'rb', 'rc'].map((id) => ({ id, person: { userId: `u_${id}`, name: `Person ${id}` }, createdAt: ago(HOUR) }))
    api.getFriendRequests.mockResolvedValue({
      success: true,
      data: { incoming: onPage, outgoing: [], pagination: { incoming: { limit: 50, hasMore: true, nextCursor: 'i1', totalCount: 90 } } },
    } as never)
    api.respondToFriendRequest.mockReturnValueOnce(new Promise(() => {}) as never).mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' } as never)
    await render(<Screen />)
    const row = () => within(screen.getByTestId('notification-f1'))
    await screen.findByTestId('notification-f1')
    fireEvent.press(row().getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled(), { timeout: ANSWER_DEADLINE_MS * 2 })
    api.getFriends.mockResolvedValue({ success: true, data: { friends: [{ userId: 'u_r1', name: 'Priya', photo: null, since: ago(MIN) }], count: 1 } } as never)
    await waitFor(() => expect(row().getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: false }))
    fireEvent.press(row().getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('You’re friends now')).toBeTruthy()
  })

  it('the same list when it is the whole list (50 or fewer) does close the one that is not on it', async () => {
    api.getFriendRequests.mockResolvedValue({
      success: true,
      data: {
        incoming: [{ id: 'other0', person: { userId: 'u_other0', name: 'Kavya Iyer' }, createdAt: ago(HOUR) }],
        outgoing: [],
        pagination: { incoming: { limit: 50, hasMore: false, nextCursor: null, totalCount: 1 } },
      },
    } as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await waitFor(() => expect(screen.queryByTestId('notification-f1')).toBeNull())
    expect(screen.queryByText('New friend request')).toBeNull()
    // What is waiting is the list's one, drawn from the list.
    expect(screen.getByRole('header', { name: 'Waiting on you, 1' })).toBeTruthy()
    expect(screen.getByText('Kavya wants to be friends')).toBeTruthy()
  })

  it('shows the list at once, and reconciles the requests after: a slow requests list holds nothing up', async () => {
    api.getFriendRequests.mockReturnValue(new Promise(() => {}) as never)
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeTruthy()
    expect(screen.getByText('You have a new match')).toBeTruthy()
  })

  it('an Accept that timed out and then reads “no longer open” is checked: friends now means it landed', async () => {
    api.respondToFriendRequest.mockReturnValueOnce(new Promise(() => {}) as never).mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled(), { timeout: ANSWER_DEADLINE_MS * 2 })
    api.getFriends.mockResolvedValue({ success: true, data: { friends: [{ userId: 'u_r1', name: 'Priya', photo: null, since: ago(MIN) }], count: 1 } } as never)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: false }))
    fireEvent.press(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('You’re friends now')).toBeTruthy()
    expect(screen.queryByText('This request is no longer open')).toBeNull()
  })

  it('a “no longer open” with no timed-out Accept before it is still stale, without asking who your friends are', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('This request is no longer open')).toBeTruthy()
    expect(api.getFriends).not.toHaveBeenCalled()
  })

  it('a request answered elsewhere while the screen is open leaves Waiting on the next read', async () => {
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeTruthy()
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } } as never)
    await act(async () => mockBell?.())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull())
    expect(screen.queryByText('New friend request')).toBeNull()
    expect(screen.getByText('You have a new match')).toBeTruthy()
  })

  it('keeps Waiting as it was when the requests list does not load', async () => {
    api.getFriendRequests.mockResolvedValue({ success: false } as never)
    await render(<Screen />)
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeTruthy()
  })

  it('a request no longer open says so, then leaves Waiting after the dwell', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND' } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Accept' }))
    expect(await screen.findByText('This request is no longer open')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('This request is no longer open')).toBeNull(), { timeout: DONE_DWELL_MS + 1000 })
    expect(screen.queryByRole('header', { name: /Waiting on you/ })).toBeNull()
  })

  it('declining a crew invite asks the crew, not the friends route', async () => {
    api.getNotifications.mockResolvedValue(feed([invite]) as never)
    ;(crewsApi.decline as jest.Mock).mockResolvedValue({ success: true })
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Decline' }))
    expect(crewsApi.decline).toHaveBeenCalledWith('cr1')
    expect(api.respondToFriendRequest).not.toHaveBeenCalled()
  })

  it('Join opens the invite where it is answered; it never joins from the list', async () => {
    api.getNotifications.mockResolvedValue(feed([invite]) as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Join' }))
    expect(navigateFromNotificationData).toHaveBeenCalledWith({ crewId: 'cr1' })
    // Join is not Decline: nothing is answered, nothing is sent to the crew.
    expect(crewsApi.decline).not.toHaveBeenCalled()
  })

  it('does not bring an answered request back as Waiting the next time', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull())
    await screen.unmount()
    await render(<Screen />)
    await screen.findByText('You have a new match')
    expect(screen.queryByText('New friend request')).toBeNull()
  })
})

describe('the rose world (foundations C, part 2)', () => {
  const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

  it('lights the Waiting count and the glyph tile in rose; the Accept pill is the one positive look (board C)', async () => {
    await render(<Screen />)
    await screen.findByText('New friend request')
    expect(flat('notifications-waiting-count').backgroundColor).toBe(COLOR.selectionRoseFill)
    expect(flat('notifications-waiting-count').borderColor).toBe(COLOR.brandRose)
    expect(flat('notification-f1-art-tile').backgroundColor).toBe(COLOR.selectionRoseFill)
    expect(isLitControl(screen.getByTestId('notification-f1-pill-0'))).toBe(true)
    expect(screen.getByRole('header', { name: 'Waiting on you, 1' })).toBeTruthy()
  })

  it('a friend row is the person and the time: no event, no room', async () => {
    await render(<Screen />)
    await screen.findByText('New friend request')
    expect(screen.getAllByText('5 min ago').length).toBeGreaterThan(0)
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('answering turns the tile’s glyph from user-plus to user-check', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Screen />)
    await screen.findByText('New friend request')
    const before = JSON.stringify(screen.getByTestId('notification-f1-art-tile', { includeHiddenElements: true }).children)
    fireEvent.press(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText('You’re friends now')
    expect(JSON.stringify(screen.getByTestId('notification-f1-art-tile', { includeHiddenElements: true }).children)).not.toBe(before)
  })

  it('Turn on is a lit button with the bell (board C: no hue on buttons)', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await render(<Screen />)
    await screen.findByText(/Push is off/)
    expect(isLitControl(screen.getByTestId('notifications-push-off-action'))).toBe(true)
  })
})

describe('Push is off', () => {
  it('is a solid row above the list with Turn on, when the phone has said no', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await render(<Screen />)
    expect(await screen.findByText(/Push is off\. These still land here/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })

  it('is not there when pushes are on', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    expect(screen.queryByText(/Push is off/)).toBeNull()
  })
})

describe('the ⋯ menu and Clear all', () => {
  const openMenu = async () => {
    fireEvent.press(await screen.findByRole('button', { name: 'More' }))
    await screen.findByTestId('notifications-menu')
  }

  it('offers Notification settings and Clear all', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    expect(screen.getByRole('button', { name: 'Notification settings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Notification settings' }))
    expect(router.push).toHaveBeenCalledWith('/notification-settings')
  })

  it('asks for the neutral Clear all confirm: not red (E13), not lit (not a yes), and strong is retired (board C)', async () => {
    const show = jest.spyOn(sheetModule, 'showSheet')
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    const sheet = show.mock.calls[0][0] as { actions: { label: string; variant?: string }[] }
    expect(sheet.actions.find((a) => a.label === 'Clear all')?.variant).toBe('secondary')
    show.mockRestore()
  })

  it('has nothing to clear when there is nothing', async () => {
    api.getNotifications.mockResolvedValue(feed([]) as never)
    await render(<Screen />)
    await screen.findByText('Quiet for now')
    await openMenu()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
  })

  it('asks first in one sheet, and Cancel clears nothing', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText('Clear all notifications?')).toBeTruthy()
    expect(api.clearNotifications).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Cancel'))
    expect(api.clearNotifications).not.toHaveBeenCalled()
  })

  it('does not promise the requests stay in this list while the server clears them too, and says where they still are', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText(/Requests waiting on you stay open in Friends and Crews until you answer them/)).toBeTruthy()
    expect(screen.queryByText(/Everything else leaves this list/)).toBeNull()
    fireEvent.press(screen.getAllByText('Clear all').slice(-1)[0])
    await waitFor(() => expect(screen.queryByText('You have a new match')).toBeNull())
    // True about it: clearing answered nothing, and Waiting on you is the requests list, so the request is still there (SCRUM-1062).
    expect(screen.getByRole('header', { name: 'Waiting on you, 1' })).toBeTruthy()
  })

  it('empty after a clear says where the requests still are, when their list has not answered', async () => {
    api.getFriendRequests.mockResolvedValue({ success: false } as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    await screen.findByText('Clear all notifications?')
    fireEvent.press(screen.getAllByText('Clear all').slice(-1)[0])
    expect(await screen.findByText('Quiet for now')).toBeTruthy()
    expect(screen.getByText('Friend requests and crew invites you haven’t answered are still open in Friends and Crews.')).toBeTruthy()
  })

  it('a clear given up on that lands after all reads the list again, so the screen ends up as the server is', async () => {
    let land: (v: unknown) => void = () => {}
    api.clearNotifications.mockReturnValue(new Promise((r) => (land = r)) as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    await screen.findByText('Clear all notifications?')
    fireEvent.press(screen.getAllByText('Clear all').slice(-1)[0])
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t clear. Try again.', 'error', { haptic: 'error' }), { timeout: ANSWER_DEADLINE_MS * 2 })
    expect(screen.getByText('You have a new match')).toBeTruthy()
    api.getNotifications.mockResolvedValue(feed([]) as never)
    await act(async () => land({ success: true }))
    expect(await screen.findByText('Quiet for now')).toBeTruthy()
  })

  it('a clear the server never answers puts the list back, rather than show it empty over rows the server keeps', async () => {
    api.clearNotifications.mockReturnValue(new Promise(() => {}) as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    await screen.findByText('Clear all notifications?')
    fireEvent.press(screen.getAllByText('Clear all').slice(-1)[0])
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t clear. Try again.', 'error', { haptic: 'error' }), { timeout: ANSWER_DEADLINE_MS * 2 })
    expect(screen.getByText('You have a new match')).toBeTruthy()
  })

  it('promises it once the server says it keeps them, and keeps them on screen', async () => {
    api.getNotifications.mockResolvedValue(feed([friend, match], { clearKeepsRequests: true }) as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText(/Requests waiting on you stay/)).toBeTruthy()
    fireEvent.press(screen.getAllByText('Clear all').slice(-1)[0])
    await waitFor(() => expect(api.clearNotifications).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('You have a new match')).toBeNull())
    expect(screen.getByText('New friend request')).toBeTruthy()
  })

  it('clears the list, and puts it back with a toast when the server refuses', async () => {
    api.clearNotifications.mockResolvedValue({ success: false } as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    await screen.findByText('Clear all notifications?')
    fireEvent.press(screen.getAllByText('Clear all').slice(-1)[0])
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Couldn’t clear. Try again.', 'error', { haptic: 'error' }))
    expect(screen.getByText('You have a new match')).toBeTruthy()
  })
})

describe('paging and live rows', () => {
  it('asks for the next page by its cursor, 30 at a time, and does not shorten the list', async () => {
    api.getNotifications
      .mockResolvedValueOnce({
        success: true,
        data: { notifications: [match], unreadCount: 1, pagination: { limit: 30, hasMore: true, nextCursor: 'c1' } },
      } as never)
      .mockResolvedValueOnce(feed([older]) as never)
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await act(async () => {
      fireEvent(screen.getByTestId('notifications-list'), 'endReached')
    })
    expect(api.getNotifications).toHaveBeenLastCalledWith({ cursor: 'c1', limit: 30 })
    expect(await screen.findByText('Friend request accepted')).toBeTruthy()
    expect(screen.getByText('You have a new match')).toBeTruthy()
  })

  it('a row that lands while it is open joins the list without a reload shortening it', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    const landed = item({ id: 'n9', kind: 'crew_here', title: 'Nebula', createdAt: ago(MIN) })
    api.getNotifications.mockResolvedValue(feed([landed, match]) as never)
    await act(async () => mockBell?.())
    expect(await screen.findByText('Nebula')).toBeTruthy()
    // The older ones are still there: a refresh never shortens what has been loaded.
    expect(screen.getByText('Friend request accepted')).toBeTruthy()
  })
})

describe('landing from a push', () => {
  it('finds the row its payload names, and no other', async () => {
    mockParams.type = 'friend_request'
    mockParams.requestId = 'r1'
    await render(<Screen />)
    await screen.findByText('New friend request')
    // Decorative, so hidden from the accessibility tree: found by id.
    const hidden = { includeHiddenElements: true }
    await waitFor(() => expect(screen.getByTestId('landing-f1', hidden)).toBeTruthy())
    expect(screen.queryByTestId('landing-m1', hidden)).toBeNull()
  })

  it('lands on a reveal request by its conversation, as the push names it', async () => {
    api.getNotifications.mockResolvedValue(feed([item({ id: 'rv', kind: 'reveal_request', data: { conversationId: 'v9' } }), match]) as never)
    mockParams.type = 'reveal_request'
    mockParams.conversationId = 'v9'
    await render(<Screen />)
    await waitFor(() => expect(screen.getByTestId('landing-rv', { includeHiddenElements: true })).toBeTruthy())
  })

  it('lands again, on the new row, when a push is tapped while the screen is open', async () => {
    api.getNotifications.mockResolvedValue(
      feed([friend, item({ id: 'f2', kind: 'friend_request', data: { requestId: 'r2' } }), match]) as never
    )
    mockParams.type = 'friend_request'
    mockParams.requestId = 'r1'
    const hidden = { includeHiddenElements: true }
    const view = await render(<Screen />)
    await waitFor(() => expect(screen.getByTestId('landing-f1', hidden)).toBeTruthy())
    // The router updates the screen's params in place (`router.setParams`), with a stamp.
    mockParams.requestId = 'r2'
    mockParams.at = '1'
    await view.rerender(<Screen />)
    await waitFor(() => expect(screen.getByTestId('landing-f2', hidden)).toBeTruthy())
    expect(screen.queryByTestId('landing-f1', hidden)).toBeNull()
    // The same row tapped again is a new landing too.
    mockParams.at = '2'
    await view.rerender(<Screen />)
    await waitFor(() => expect(screen.getByTestId('landing-f2', hidden)).toBeTruthy())
  })

  it('highlights nothing for a payload it cannot find', async () => {
    mockParams.type = 'friend_request'
    mockParams.requestId = 'zzz'
    await render(<Screen />)
    await screen.findByText('New friend request')
    expect(screen.queryByTestId('landing-f1', { includeHiddenElements: true })).toBeNull()
  })
})

describe('the app icon (badgeCount, Flow 9 · 9.4)', () => {
  // notification-feed-details.itest.ts "badgeCount": two unseen rows and a conversation with something unread give 2 and 3.
  const rows = [friend, match, older]

  it('says the conversations once the bell\'s rows are seen: badgeCount less unreadCount, after the server has them as seen', async () => {
    api.getNotifications.mockResolvedValue(feed(rows, { unreadCount: 2, badgeCount: 3 }) as never)
    await render(<Screen />)
    await waitFor(() => expect(setBadge).toHaveBeenCalledWith(1))
    expect(api.markNotificationsRead).toHaveBeenCalled()
  })

  it('does not move the icon when marking seen failed: the server still counts them', async () => {
    api.getNotifications.mockResolvedValue(feed(rows, { unreadCount: 2, badgeCount: 3 }) as never)
    api.markNotificationsRead.mockResolvedValue({ success: false } as never)
    await render(<Screen />)
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalled())
    await act(async () => {})
    expect(setBadge).not.toHaveBeenCalled()
  })

  it('with nothing unseen, the icon says the whole of badgeCount: the conversations', async () => {
    api.getNotifications.mockResolvedValue(feed([older], { badgeCount: 2 }) as never)
    await render(<Screen />)
    await waitFor(() => expect(setBadge).toHaveBeenCalledWith(2))
    expect(api.markNotificationsRead).not.toHaveBeenCalled()
  })

  it('leaves the icon alone for a server that sends no badgeCount', async () => {
    await render(<Screen />)
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalled())
    await act(async () => {})
    expect(setBadge).not.toHaveBeenCalled()
  })

  it('sets nothing while the phone has not granted notifications, and never asks', async () => {
    permissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
    api.getNotifications.mockResolvedValue(feed(rows, { unreadCount: 2, badgeCount: 3 }) as never)
    await render(<Screen />)
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalled())
    await act(async () => {})
    expect(setBadge).not.toHaveBeenCalled()
  })
})

/*
 * Requests placement A (owner 2026-11-15, board 05): friend requests and crew invites are ONE list each, read by
 * Notifications · Waiting on you, Friends/Me and Crews. An answer on any surface takes the ask off every surface at once,
 * with no reload, so it can be answered once (SCRUM-1036: three lists, three counts, and they drifted).
 */
describe('one list per ask kind, every surface at once (requests placement A)', () => {
  /** Me's row and the Friends page's count: the shared list's total. */
  function FriendsCount() {
    return <Text testID="friends-count">{String(useFriendRequestsState().incoming.total)}</Text>
  }
  /** Friends › Friend requests: its own Accept, on the same list. */
  function FriendsPage() {
    const { incoming, respond } = useFriendRequests()
    return (
      <View>
        {incoming.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Friends accept ${r.id}`} onPress={() => void respond(r, 'accept')} />
        ))}
      </View>
    )
  }
  /** Crews › Invites and Me's Crews dot: the shared list. */
  function CrewsCount() {
    const { invites, total } = useCrewInvites()
    return <Text testID="crews-count">{`${total}:${invites.map((i) => i.crewId).join(',')}`}</Text>
  }
  const Surfaces = () => (
    <View>
      <Screen />
      <FriendsCount />
      <FriendsPage />
      <CrewsCount />
    </View>
  )
  const crewsRead = { success: true, data: { crews: [], invites: [{ crewId: 'cr1', name: 'Night Owls' }], invitesPagination: { hasMore: false, nextCursor: null, totalCount: 1 } } }
  beforeEach(() => {
    api.getNotifications.mockResolvedValue(feed([friend, invite, match]) as never)
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [{ id: 'r1', person: { userId: 'u_r1', name: 'Asha' } }], outgoing: [] } } as never)
    ;(crewsApi.myCrews as jest.Mock).mockResolvedValue(crewsRead)
  })
  const settled = async () => {
    await screen.findByText('New friend request')
    await waitFor(() => expect(screen.getByTestId('friends-count').props.children).toBe('1'))
    await waitFor(() => expect(screen.getByTestId('crews-count').props.children).toBe('1:cr1'))
  }

  it('Accept in Waiting on you takes the request off Friends and Me at once, without reading the list again', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Surfaces />)
    await settled()
    api.getFriendRequests.mockClear()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Accept' })))
    expect(screen.getByTestId('friends-count').props.children).toBe('0')
    expect(screen.queryByRole('button', { name: 'Friends accept r1' })).toBeNull()
    expect(api.getFriendRequests).not.toHaveBeenCalled()
    // One answer: the Friends page has nothing left to send a second.
    expect(api.respondToFriendRequest).toHaveBeenCalledTimes(1)
  })

  it('Accept on Friends takes the row out of Waiting on you at once', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Surfaces />)
    await settled()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Friends accept r1' })))
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(screen.queryByText('New friend request')).toBeNull()
    expect(screen.getByTestId('friends-count').props.children).toBe('0')
    expect(api.respondToFriendRequest).toHaveBeenCalledTimes(1)
  })

  it('Decline of a crew invite in Waiting on you takes it off Crews and Me’s dot at once', async () => {
    ;(crewsApi.decline as jest.Mock).mockResolvedValue({ success: true })
    api.getNotifications.mockResolvedValue(feed([invite]) as never)
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } } as never)
    await render(<Surfaces />)
    await waitFor(() => expect(screen.getByTestId('crews-count').props.children).toBe('1:cr1'))
    ;(crewsApi.myCrews as jest.Mock).mockClear()
    await act(async () => fireEvent.press(await screen.findByRole('button', { name: 'Decline' })))
    expect(screen.getByTestId('crews-count').props.children).toBe('0:')
    expect(crewsApi.myCrews).not.toHaveBeenCalled()
  })

  it('a Join on the consent screen comes back saying so, then the row leaves; Crews has let it go already', async () => {
    jest.useFakeTimers()
    try {
      await render(<Surfaces />)
      await settled()
      await act(async () => crewInviteAnswered('cr1', 'joined', 'Thiruvananthapuram Night Owls'))
      expect(screen.getByTestId('crews-count').props.children).toBe('0:')
      expect(screen.getByText('You’re in Thiruvananthapuram Night Owls')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
      await act(async () => jest.advanceTimersByTime(DONE_DWELL_MS + 50))
      expect(screen.queryByText('You’re in Thiruvananthapuram Night Owls')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  // Control: a read that began before an answer and lands after it does not put the ask back on any surface.
  it('a list read that was out before the answer does not bring the ask back', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Surfaces />)
    await settled()
    let land: (v: unknown) => void = () => {}
    api.getFriendRequests.mockImplementationOnce(() => new Promise((r) => (land = r)) as never)
    const { loadFriendRequests } = jest.requireActual('../lib/friendRequests') as typeof import('../lib/friendRequests')
    const read = loadFriendRequests()
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Accept' })))
    await act(async () => {
      land({ success: true, data: { incoming: [{ id: 'r1', person: { userId: 'u_r1', name: 'Asha' } }], outgoing: [] } })
      await read
    })
    expect(screen.getByTestId('friends-count').props.children).toBe('0')
    expect(screen.queryByRole('button', { name: 'Friends accept r1' })).toBeNull()
  })

  it('a message request is never in Waiting on you: it is a plain line with a chevron, and opens Banter', async () => {
    const ask = item({ id: 'mr1', kind: 'message_request', title: 'Venkatalakshmi wants to message you', data: { requestId: 'm1' } })
    api.getNotifications.mockResolvedValue(feed([ask, friend]) as never)
    await render(<Screen />)
    await screen.findByText('Venkatalakshmi wants to message you')
    expect(screen.getByTestId('notifications-waiting-card')).toBeTruthy()
    expect(within(screen.getByTestId('notifications-waiting-card')).queryByText('Venkatalakshmi wants to message you')).toBeNull()
    expect(screen.getByText('Message requests · 5 min ago')).toBeTruthy()
    expect(screen.getByTestId('notification-mr1-chevron')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: /^Venkatalakshmi wants to message you/ }))
    expect(navigateFromNotificationData).toHaveBeenCalledWith({ requestId: 'm1' })
  })
})

/*
 * SCRUM-1062: Notifications said "Waiting on you · 8" while Friend requests said "14 waiting", for the same 14. The six missing
 * were older than 7 days: Waiting on you was built from the notification rows, and an ask with no row in the feed was not in it.
 */
describe('Waiting on you is the shared lists, whatever the feed holds (SCRUM-1062)', () => {
  const DAY = 24 * HOUR
  const names = ['Asha', 'Ravi', 'Meera', 'Kabir', 'Isha', 'Arjun', 'Diya', 'Rohan', 'Tara', 'Vikram', 'Leela', 'Neel', 'Anaya', 'Dev']
  // 14 waiting: 8 within the week, 6 older than 7 days.
  const requests = names.map((name, i) => ({ id: `q${i}`, person: { userId: `u_q${i}`, name, photo: null }, createdAt: ago(i < 8 ? (i + 1) * HOUR : (8 + i) * DAY) }))
  const recentRows = requests.slice(0, 8).map((r) => item({ id: `n_${r.id}`, kind: 'friend_request', title: 'New friend request', createdAt: r.createdAt, data: { requestId: r.id } }))
  const invites = ['k1', 'k2'].map((crewId, i) => ({ crewId, name: `Crew ${crewId}`, bio: null, emblemSeed: `seed-${crewId}`, tags: [], size: 3, invitedBy: 'Asha', invitedAt: ago((9 + i) * DAY) }))

  function Counts() {
    const friends = useFriendRequestsState().incoming.total
    const crews = useCrewInvites().total
    return <Text testID="counts">{`${friends}:${crews}`}</Text>
  }
  function FriendsPage() {
    const { incoming, respond } = useFriendRequests()
    return (
      <View>
        {incoming.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Friends accept ${r.id}`} onPress={() => void respond(r, 'accept')} />
        ))}
      </View>
    )
  }
  const Surfaces = () => (
    <View>
      <Screen />
      <Counts />
      <FriendsPage />
    </View>
  )

  beforeEach(() => {
    api.getNotifications.mockResolvedValue(feed([...recentRows, match]) as never)
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: requests, outgoing: [] } } as never)
    ;(crewsApi.myCrews as jest.Mock).mockResolvedValue({ success: true, data: { crews: [], invites: [] } })
  })

  it('14 waiting, 6 of them older than 7 days: Waiting on you says 14, as Friends does, and See all lists all 14', async () => {
    await render(<Surfaces />)
    await waitFor(() => expect(screen.getByTestId('counts').props.children).toBe('14:0'))
    expect(await screen.findByRole('header', { name: 'Waiting on you, 14' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'See all 14' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(14))
    // The oldest is there, by name, though the feed has no row for it.
    expect(screen.getByText('Dev wants to be friends')).toBeTruthy()
  })

  it('a feed with no request rows at all (cleared, swept) still waits on all of them', async () => {
    api.getNotifications.mockResolvedValue(feed([match]) as never)
    await render(<Surfaces />)
    expect(await screen.findByRole('header', { name: 'Waiting on you, 14' })).toBeTruthy()
  })

  it('crew invites older than 7 days follow the same rule: on Crews, so in Waiting on you, counted once', async () => {
    api.getNotifications.mockResolvedValue(feed([match]) as never)
    api.getFriendRequests.mockResolvedValue({ success: true, data: { incoming: [], outgoing: [] } } as never)
    ;(crewsApi.myCrews as jest.Mock).mockResolvedValue({ success: true, data: { crews: [], invites } })
    await render(<Surfaces />)
    await waitFor(() => expect(screen.getByTestId('counts').props.children).toBe('0:2'))
    expect(await screen.findByRole('header', { name: 'Waiting on you, 2' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(2)
    expect(screen.getByText('Crew k1')).toBeTruthy()
  })

  it('an Accept in Waiting on you on a request older than 7 days leaves both counts at 13', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Surfaces />)
    await screen.findByRole('header', { name: 'Waiting on you, 14' })
    fireEvent.press(screen.getByRole('button', { name: 'See all 14' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(14))
    const oldest = screen.getByTestId('notification-friend_request:q13')
    await act(async () => fireEvent.press(within(oldest).getByRole('button', { name: 'Accept' })))
    expect(api.respondToFriendRequest).toHaveBeenCalledWith('q13', 'accept')
    expect(await screen.findByText('You’re friends now')).toBeTruthy()
    expect(screen.getByTestId('counts').props.children).toBe('13:0')
    expect(screen.getByRole('header', { name: 'Waiting on you, 13' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Friends accept q13' })).toBeNull()
    await waitFor(() => expect(screen.queryByText('You’re friends now')).toBeNull(), { timeout: DONE_DWELL_MS + 1000 })
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(13)
  })

  it('an Accept on Friends of a request older than 7 days takes it out of Waiting on you at once', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Surfaces />)
    await screen.findByRole('header', { name: 'Waiting on you, 14' })
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Friends accept q12' })))
    expect(screen.getByTestId('counts').props.children).toBe('13:0')
    expect(screen.getByRole('header', { name: 'Waiting on you, 13' })).toBeTruthy()
    expect(screen.queryByTestId('notification-friend_request:q12')).toBeNull()
  })

  it('a list past its first page counts the server’s total and pages on with See all', async () => {
    const page1 = requests.slice(0, 10)
    api.getFriendRequests.mockImplementation(
      async (opts?: { cursor?: string }) =>
        ({
          success: true,
          data: opts?.cursor
            ? { incoming: requests.slice(10), outgoing: [], pagination: { incoming: { limit: 10, hasMore: false, nextCursor: null, totalCount: 14 } } }
            : { incoming: page1, outgoing: [], pagination: { incoming: { limit: 10, hasMore: true, nextCursor: 'p2', totalCount: 14 } } },
        }) as never
    )
    await render(<Surfaces />)
    expect(await screen.findByRole('header', { name: 'Waiting on you, 14' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'See all 14' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(14))
    expect(api.getFriendRequests).toHaveBeenCalledWith({ side: 'incoming', cursor: 'p2' })
  })
})
