/**
 * The Me tab on the design system (Flow 6 `me`): its states render, its circles go where the frame puts them, and the entrance
 * is the DS list-enter (28 ms apart, capped), not the old 70 ms × 9.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

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
    getProfile: jest.fn(),
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
import { SIZE, SPACE } from '../lib/design/tokens'
import { queryCache } from '../lib/queryCache'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const PROFILE = {
  success: true,
  data: {
    id: 'me', name: 'Sam', age: 28, education: 'NID Ahmedabad', location: 'Bengaluru', occupation: 'Product designer', bio: 'Records and late trains.',
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
  expect(screen.getByLabelText('14 Nights')).toBeTruthy()
  expect(screen.getByLabelText('9 Friends')).toBeTruthy()
  await screen.findByTestId('nights-grid')
  // What you entered stays visible on your own page: occupation under the name, education under About.
  expect(screen.getByText('Product designer')).toBeTruthy()
  expect(screen.getByLabelText('education, NID Ahmedabad')).toBeTruthy()
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

it('clears the tab bar by the inset, the bar and one gutter, so the last card is never flush against it', async () => {
  api.getPublicProfile.mockResolvedValue(PROFILE as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [] } } as never)
  await render(<Profile />)
  await screen.findByLabelText('Sam, 28')
  const content = StyleSheet.flatten(screen.getByTestId('me-scroll').props.contentContainerStyle)
  expect(content.paddingBottom).toBe(34 + 98 + SPACE.xl)
})

it.each([0, 24, 34])('Android, bottom inset %i: the foot of the page is above the bar’s top edge by a gutter', async (inset) => {
  // The bar floats `inset + 12 + 64` up from the screen's foot (`tabBarTop`); the page reserves `inset + clearance + gutter`.
  const barHeightFromFoot = inset + SPACE.tabBarBottomGapAndroid + SIZE.tabBar
  expect(inset + 98 + SPACE.xl - barHeightFromFoot).toBeGreaterThanOrEqual(SPACE.xl)
})

describe('what GET /profiles/:you adds (blendn-admin #716): badges and photos taken down', () => {
  const mount = async (own: unknown) => {
    api.getPublicProfile.mockResolvedValue(PROFILE as never)
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [] } } as never)
    api.getProfile.mockResolvedValue(own as never)
    await render(<Profile />)
    await screen.findByLabelText('Sam, 28')
  }
  // profile-badges.itest.ts and profile-friends-push-gaps.itest.ts: `{ kind, label }`, and `photo_states` with the pulled one's URL null.
  const badges = [{ kind: 'shows_up', label: 'Shows up' }, { kind: 'nights_out', label: '5+ nights this month' }]
  const states = (wasMain: boolean) => [
    { url: 'https://cdn.test/profile/p1/live.jpg', pulled: false, pulled_at: null, was_main: false },
    { url: null, pulled: true, pulled_at: '2026-10-21T09:15:00.000Z', was_main: wasMain },
  ]

  it('draws the earned badges as DS pills in a Badges card under who you are, and a tap says what one means', async () => {
    await mount({ success: true, data: { profile: { badges } } })
    expect(await screen.findByTestId('me-badges')).toBeTruthy()
    expect(screen.getByLabelText('Badge: Shows up')).toBeTruthy()
    expect(screen.getByLabelText('Badge: 5+ nights this month')).toBeTruthy()
    expect(screen.getByText('From your check-ins. They can’t be bought, and they come and go on their own.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Badge: Shows up'))
    expect(screen.getByText('When 80%+ of your RSVPs turn into nights, 3 or more')).toBeTruthy()
  })

  it('none earned yet is a sentence and no pills, and nothing to unlock', async () => {
    await mount({ success: true, data: { profile: { badges: [] } } })
    expect(await screen.findByText(/Badges come from your check-ins/)).toBeTruthy()
    expect(screen.queryByLabelText(/^Badge:/)).toBeNull()
  })

  it('draws no Badges card when the server sent none (badges off, or an older server)', async () => {
    await mount({ success: true, data: { profile: { name: 'Sam' } } })
    await waitFor(() => expect(api.getProfile).toHaveBeenCalled())
    expect(screen.queryByTestId('me-badges')).toBeNull()
  })

  it('says a photo was taken down, once, with the way to add a different one', async () => {
    await mount({ success: true, data: { profile: { photo_states: states(false) } } })
    expect(await screen.findByText('A photo of yours was removed. It didn’t meet the photo rules.')).toBeTruthy()
    await fireEvent.press(screen.getByText('Add a different photo'))
    expect(mockPush).toHaveBeenCalledWith('/edit-profile')
  })

  it('says what the main photo is now when the main one was taken down', async () => {
    await mount({ success: true, data: { profile: { photo_states: states(true) } } })
    expect(await screen.findByText('Your main photo was removed. The next one is your main photo now.')).toBeTruthy()
  })

  it('says nothing about photos when none was pulled: a live photo is not a notice', async () => {
    await mount({ success: true, data: { profile: { photo_states: [states(false)[0]] } } })
    await waitFor(() => expect(api.getProfile).toHaveBeenCalled())
    expect(screen.queryByTestId('me-photo-pulled')).toBeNull()
  })

  it('a failed read of the profile leaves both out and the page standing', async () => {
    await mount({ success: false, error: 'x' })
    await waitFor(() => expect(api.getProfile).toHaveBeenCalled())
    expect(screen.queryByTestId('me-badges')).toBeNull()
    expect(screen.queryByTestId('me-photo-pulled')).toBeNull()
    expect(screen.getByLabelText('Sam, 28')).toBeTruthy()
  })
})
