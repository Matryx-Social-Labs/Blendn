/*
 * The bell and the app icon read one response and say two numbers (Flow 9 · 9.1, 9.4): the bell's badge is `unreadCount`, its own
 * rows, which opening it clears; the icon is `badgeCount`, which holds the unread conversations too. The fixtures are the
 * feed's counts as blendn-admin's notification-feed-details.itest.ts builds them (two unseen rows and one conversation: 2 and 3).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(() => fn(), [fn]),
}))
jest.mock('../lib/apiClient', () => ({ apiClient: { getNotifications: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({ subscribeToBell: () => () => {} }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), setBadgeCountAsync: jest.fn() }))
jest.mock('../components/ui/Material', () => ({ Material: () => null }))

/* eslint-disable import/first */
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { NotificationBell } from '../components/pulse/NotificationBell'
import { apiClient } from '../lib/apiClient'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const setBadge = Notifications.setBadgeCountAsync as jest.Mock
const permissions = Notifications.getPermissionsAsync as jest.Mock

const feed = (extra: Record<string, unknown>) => ({ success: true, data: { notifications: [], pagination: { limit: 1, hasMore: false }, ...extra } }) as never

beforeEach(() => {
  jest.clearAllMocks()
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
})

it('the bell says its own rows, and the icon says rows and conversations', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 2, badgeCount: 3 }))
  await render(<NotificationBell />)
  expect(await screen.findByLabelText('Notifications')).toBeTruthy()
  await waitFor(() => expect(setBadge).toHaveBeenCalledWith(3))
  // The badge is hidden from a screen reader, which hears the true number on the bell itself.
  expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.queryByText('3', { includeHiddenElements: true })).toBeNull()
  expect(screen.getByLabelText('Notifications').props.accessibilityValue).toEqual({ text: '2 unseen' })
})

it('opening the bell clears the bell at once; the icon is the conversations\' until the next read', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 2, badgeCount: 3 }))
  await render(<NotificationBell />)
  await waitFor(() => expect(screen.getByLabelText('Notifications').props.accessibilityValue).toEqual({ text: '2 unseen' }))
  await fireEvent.press(screen.getByLabelText('Notifications'))
  expect(router.push).toHaveBeenCalledWith('/notifications')
  expect(screen.getByLabelText('Notifications').props.accessibilityValue.text).toBeUndefined()
  expect(screen.queryByText('2', { includeHiddenElements: true })).toBeNull()
})

it('an older server sends no badgeCount: the bell works and the icon is left alone', async () => {
  api.getNotifications.mockResolvedValue(feed({ unreadCount: 2 }))
  await render(<NotificationBell />)
  await waitFor(() => expect(screen.getByLabelText('Notifications').props.accessibilityValue).toEqual({ text: '2 unseen' }))
  await act(async () => {})
  expect(setBadge).not.toHaveBeenCalled()
})
