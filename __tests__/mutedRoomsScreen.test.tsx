/**
 * The rooms you muted (Flow 9 · 9.6 frame 04): a few on the Notifications screen, the rest on a virtualised screen of their
 * own. Read from the Banter's own `GET /chat/groups`, page by page; scale from none to hundreds.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'u_me' } }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: { getProfile: jest.fn(), updateProfile: jest.fn(), queuedRequest: jest.fn(), getChatGroups: jest.fn() },
}))
jest.mock('../lib/notifications', () => ({
  initializePushNotifications: jest.fn(async () => null),
  removePushTokenFromProfile: jest.fn(async () => true),
}))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })) }))
jest.mock('expo-application', () => ({ applicationId: 'app.blendn' }))

import { router } from 'expo-router'
import MutedRoomsScreen from '../app/muted-rooms'
import NotificationSettingsScreen from '../app/notification-settings'
import { apiClient } from '../lib/apiClient'
import { MUTED_SCAN_PAGES } from '../lib/mutedRooms'
import { markRoomLeft, rememberRoomMute, resetRoomMembership } from '../lib/roomMembership'

const api = apiClient as jest.Mocked<typeof apiClient>
const getChatGroups = api.getChatGroups as jest.Mock
const queued = api.queuedRequest as jest.Mock

const MUTE = { muted: true, until: null }
const room = (i: number, mute: unknown = MUTE) => ({ id: `r${i}`, event: { title: `Room ${i}` }, mute })
const page = (groups: unknown[], hasMore = false, rooms: unknown[] = []) => ({ success: true, data: { groups, rooms, pagination: { hasMore } } })

beforeEach(() => {
  jest.clearAllMocks()
  resetRoomMembership()
  api.getProfile.mockResolvedValue({ success: true, data: { profile: { push_enabled: true } } } as never)
  queued.mockImplementation((url: string) => Promise.resolve(url.includes('notification-preferences') ? { success: false } : { success: true, data: { enabled: true } }))
  getChatGroups.mockResolvedValue(page([]))
})

describe('Notifications screen: the muted rooms group', () => {
  it('has no group when nothing is muted', async () => {
    await render(<NotificationSettingsScreen />)
    await screen.findByText('Push notifications')
    expect(screen.queryByText('Muted rooms')).toBeNull()
  })

  it('lists the rooms with when each ends, and a row opens that room’s info', async () => {
    getChatGroups.mockResolvedValue(page([room(1), room(2)]))
    await render(<NotificationSettingsScreen />)
    expect(await screen.findByText('Muted rooms')).toBeTruthy()
    expect(screen.getAllByText('until you turn it back on')).toHaveLength(2)
    expect(screen.queryByTestId('notification-settings-muted-all')).toBeNull()
    fireEvent.press(screen.getByTestId('muted-room-r1'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/chat-info/[id]', params: { id: 'r1', roomName: 'Room 1', eventTitle: 'Room 1' } })
  })

  it('shows three and a "See all N" row to the virtualised screen once there are more', async () => {
    getChatGroups.mockResolvedValue(page([1, 2, 3, 4, 5].map((i) => room(i))))
    await render(<NotificationSettingsScreen />)
    fireEvent.press(await screen.findByText('See all 5 muted rooms'))
    expect(screen.queryByTestId('muted-room-r4')).toBeNull()
    expect(router.push).toHaveBeenCalledWith('/muted-rooms')
  })
})

describe('Muted rooms screen', () => {
  it('says there are none, with how rooms get here', async () => {
    await render(<MutedRoomsScreen />)
    expect(await screen.findByText('No muted rooms')).toBeTruthy()
  })

  it('says it did not load, and Try again reads again', async () => {
    getChatGroups.mockResolvedValueOnce({ success: false, error: 'offline' })
    await render(<MutedRoomsScreen />)
    expect(await screen.findByText('Your rooms didn’t load')).toBeTruthy()
    getChatGroups.mockResolvedValue(page([room(1)]))
    await act(async () => fireEvent.press(screen.getByText('Try again')))
    expect(await screen.findByText('Room 1')).toBeTruthy()
    expect(getChatGroups).toHaveBeenLastCalledWith({ force: true })
  })

  it('reads on past the first page until the server says there is no more', async () => {
    getChatGroups.mockResolvedValue(page([room(1)], true))
    queued.mockImplementation((url: string) => Promise.resolve(url.endsWith('page=2') ? page([room(2)], true) : url.endsWith('page=3') ? page([room(3)], false) : { success: false }))
    await render(<MutedRoomsScreen />)
    expect(await screen.findByText('Room 3')).toBeTruthy()
    expect(screen.getByText('Room 1')).toBeTruthy()
    expect(queued.mock.calls.map((c) => c[0])).toEqual(['/api/mobile/chat/groups?page=2', '/api/mobile/chat/groups?page=3'])
  })

  it('stops at the page cap and says it looked at the most recent', async () => {
    getChatGroups.mockResolvedValue(page([room(0)], true))
    queued.mockImplementation((url: string) => Promise.resolve(page([room(Number(url.split('=')[1]))], true)))
    await render(<MutedRoomsScreen />)
    expect(await screen.findByText(/most recent/)).toBeTruthy()
    expect(queued).toHaveBeenCalledTimes(MUTED_SCAN_PAGES - 1)
  })

  it('keeps what it found when a later page fails', async () => {
    getChatGroups.mockResolvedValue(page([room(1)], true))
    queued.mockResolvedValue({ success: false })
    await render(<MutedRoomsScreen />)
    expect(await screen.findByText('Room 1')).toBeTruthy()
  })

  it('drops a room unmuted, or left, one screen over without reading again', async () => {
    getChatGroups.mockResolvedValue(page([room(1), room(2), room(3)]))
    await render(<MutedRoomsScreen />)
    await screen.findByText('Room 1')
    await act(async () => {
      rememberRoomMute('r1', { muted: false, until: null })
      markRoomLeft('r2')
    })
    expect(screen.queryByText('Room 1')).toBeNull()
    expect(screen.queryByText('Room 2')).toBeNull()
    expect(screen.getByText('Room 3')).toBeTruthy()
    expect(getChatGroups).toHaveBeenCalledTimes(1)
  })

  it('a crew’s room opens the crew, a Blend’s the room', async () => {
    getChatGroups.mockResolvedValue(page([], false, [{ id: 'c1', kind: 'crew', name: 'Nebula', crewId: 'crew_1', mute: MUTE }]))
    await render(<MutedRoomsScreen />)
    fireEvent.press(await screen.findByText('Nebula'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/crews/[crewId]', params: { crewId: 'crew_1' } })
  })

  it('hundreds of rooms are a virtualised list, not a screen of rows', async () => {
    getChatGroups.mockResolvedValue(page(Array.from({ length: 400 }, (_, i) => room(i))))
    await render(<MutedRoomsScreen />)
    await screen.findByText('Room 0')
    // Only the first screenful is mounted.
    await waitFor(() => expect(screen.queryByText('Room 399')).toBeNull())
    expect(screen.queryAllByTestId(/^muted-room-r/).length).toBeLessThan(60)
  })
})
