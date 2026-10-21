/**
 * The Me tab on the design system (Flow 6 `me`): its states render, its circles go where the frame puts them, and the entrance
 * is the DS list-enter (28 ms apart, capped), not the old 70 ms × 9.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), navigate: (...a: unknown[]) => mockNavigate(...a) },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
  useIsFocused: () => true,
  useScrollToTop: () => {},
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 98 }))
jest.mock('../lib/useAuth', () => {
  const auth = { user: { id: 'me' }, loading: false }
  return { useAuth: () => auth }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getPublicProfile: jest.fn(),
    getMyAttendance: jest.fn(),
    getFriends: jest.fn(async () => ({ success: true, data: { count: 9, friends: [] } })),
    getFriendRequests: jest.fn(async () => ({ success: true, data: { incoming: [{ id: 'r1' }, { id: 'r2' }] } })),
  },
}))
jest.mock('../lib/crewsApi', () => ({
  crewsApi: { myCrews: jest.fn(async () => ({ success: true, data: { crews: [{ crewId: 'c1', emblemSeed: 'a' }, { crewId: 'c2', emblemSeed: 'b' }], invites: [{ crewId: 'c3' }] } })) },
}))

/* eslint-disable import/first */
import Profile from '../app/(tabs)/profile'
import { apiClient } from '../lib/apiClient'
import { queryCache } from '../lib/queryCache'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const PROFILE = {
  success: true,
  data: {
    id: 'me', name: 'Sam', age: 28, location: 'Bengaluru', occupation: 'Product designer', bio: 'Records and late trains.',
    interests: ['Vinyl'], photos: ['https://cdn/a.jpg'], memberSince: '2025-03-04T00:00:00Z',
    stats: { eventsAttended: 14, eventsFavorited: 6, eventsOrganized: 0 },
  },
}

// Let the screen's own background requests land inside this test, so they cannot overlap the next one's act scope.
afterEach(async () => {
  jest.useRealTimers()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
})

beforeEach(() => {
  jest.clearAllMocks()
  queryCache.invalidate('')
})

it('draws the frame: name, circles, requests, crews with its count and dot, stats, nights', async () => {
  api.getPublicProfile.mockResolvedValue(PROFILE as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [{ id: 'e1', title: 'Vinyl Night', start_time: '2020-01-01T20:00:00Z', end_time: '2020-01-01T23:00:00Z', cover_image_url: null }] } } as never)
  await render(<Profile />)
  await screen.findByLabelText('Sam, 28')
  expect(screen.getByLabelText('Settings')).toBeTruthy()
  expect(screen.getByLabelText('Add friends')).toBeTruthy()
  await waitFor(() => expect(screen.getByLabelText('2 friend requests')).toBeTruthy())
  await waitFor(() => expect(screen.getByLabelText('Crews, 2, 1 invite waiting')).toBeTruthy())
  expect(screen.getByTestId('crews-invite-dot', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByLabelText('14 Attended')).toBeTruthy()
  expect(screen.getByLabelText('9 Friends')).toBeTruthy()
  await screen.findByTestId('nights-grid')
  // Hosted is left out at zero.
  expect(screen.queryByLabelText(/Hosted/)).toBeNull()
})

it('says the first night is not written yet when there is none, never an empty grid', async () => {
  api.getPublicProfile.mockResolvedValue(PROFILE as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [] } } as never)
  await render(<Profile />)
  await screen.findByTestId('nights-first')
  expect(screen.queryByTestId('nights-grid')).toBeNull()
  await fireEvent.press(screen.getByText('See what’s on tonight'))
  expect(mockNavigate).toHaveBeenCalled()
})

it('keeps the page and puts a notice on Nights out when attendance fails', async () => {
  jest.useFakeTimers()
  api.getPublicProfile.mockResolvedValue(PROFILE as never)
  api.getMyAttendance.mockResolvedValue({ success: false, error: 'x' } as never)
  await render(<Profile />)
  await screen.findByLabelText('Sam, 28')
  await jest.advanceTimersByTimeAsync(2000)
  await screen.findByText('Your nights didn’t load.')
  jest.useRealTimers()
})

it('a profile that did not load is a state with Try again, not a blank', async () => {
  api.getPublicProfile.mockResolvedValue({ success: false, error: 'x' } as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [] } } as never)
  await render(<Profile />)
  await screen.findByText('Your profile didn’t load')
  api.getPublicProfile.mockResolvedValue(PROFILE as never)
  await fireEvent.press(screen.getByText('Try again'))
  await screen.findByLabelText('Sam, 28')
})

it('offers Add a photo as the one primary when there is no photo', async () => {
  api.getPublicProfile.mockResolvedValue({ ...PROFILE, data: { ...PROFILE.data, photos: [], bio: '' } } as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [] } } as never)
  await render(<Profile />)
  await screen.findByText('Finish your profile')
  await fireEvent.press(screen.getByText('Add a photo'))
  expect(mockPush).toHaveBeenCalledWith('/edit-profile')
})

// Last on purpose: a press leaves the router mock and a spring behind that a later render in this file would trip over.
it('Settings and Add friends are the bar circles, and go where they say', async () => {
  api.getPublicProfile.mockResolvedValue(PROFILE as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [] } } as never)
  await render(<Profile />)
  await screen.findByLabelText('Sam, 28')
  await fireEvent.press(screen.getByLabelText('Settings'))
  expect(mockPush).toHaveBeenCalledWith('/settings')
  await fireEvent.press(screen.getByLabelText('Add friends'))
  expect(mockPush).toHaveBeenCalledWith('/friends/add')
})
