/**
 * The Notifications screen (Flow 9 · 9.2): every state the frames draw, driven against a mocked API.
 *
 * Behavioural, because each is a branch a source grep would pass by name alone: loading, failed,
 * empty, populated in three sections, the request answered in place (pending → done, stale, decline),
 * See all, the ⋯ menu and Clear all, paging, opening marking everything seen.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { View } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
const mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(() => fn(), [fn]),
  useLocalSearchParams: () => mockParams,
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
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}))
jest.mock('../lib/crewsApi', () => ({ crewsApi: { decline: jest.fn() } }))
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
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }))
jest.mock('../lib/haptics', () => ({
  H: { destructive: jest.fn(), toggle: jest.fn(), error: jest.fn(), primary: jest.fn(), success: jest.fn(), threshold: jest.fn(), select: jest.fn() },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import NotificationsScreen from '../app/notifications'
import { SheetHost } from '../components/SheetHost'
import { apiClient } from '../lib/apiClient'
import { crewsApi } from '../lib/crewsApi'
import type { NotificationItem } from '../lib/notificationFormat'
import { navigateFromNotificationData } from '../lib/notifications'
import { closeSheet } from '../lib/sheet'

const api = apiClient as jest.Mocked<typeof apiClient>
const permissions = Notifications.getPermissionsAsync as jest.Mock

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
  jest.clearAllMocks()
  await AsyncStorage.clear()
  for (const k of Object.keys(mockParams)) delete mockParams[k]
  api.getNotifications.mockResolvedValue(feed([friend, match, older]) as never)
  api.markNotificationsRead.mockResolvedValue({ success: true } as never)
  api.clearNotifications.mockResolvedValue({ success: true } as never)
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
    expect(screen.getByText(/land here\. Messages are in Banter\./)).toBeTruthy()
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
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()

    // It stays inline for 2 s (the prototype's dwell), then the row leaves.
    await waitFor(() => expect(screen.queryByText('You’re friends now')).toBeNull(), { timeout: 3000 })
    expect(screen.queryByRole('header', { name: /Waiting on you/ })).toBeNull()
  })

  it('Decline collapses the row and says nothing to anybody', async () => {
    api.respondToFriendRequest.mockResolvedValue({ success: true } as never)
    await render(<Screen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Decline' }))
    expect(api.respondToFriendRequest).toHaveBeenCalledWith('r1', 'dismiss')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull())
    expect(mockShowToast).not.toHaveBeenCalled()
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

  it('does not promise the requests stay while the server clears them too', async () => {
    await render(<Screen />)
    await screen.findByText('You have a new match')
    await openMenu()
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText(/the requests waiting on you included/)).toBeTruthy()
    expect(screen.queryByText(/Requests waiting on you stay/)).toBeNull()
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

  it('highlights nothing for a payload it cannot find', async () => {
    mockParams.type = 'friend_request'
    mockParams.requestId = 'zzz'
    await render(<Screen />)
    await screen.findByText('New friend request')
    expect(screen.queryByTestId('landing-f1', { includeHiddenElements: true })).toBeNull()
  })
})
