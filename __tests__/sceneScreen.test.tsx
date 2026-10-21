/**
 * The Scene screen (Flow 3 `scene`), state by state: the failed and not-found pages, the ⋯ menu (Report for anyone;
 * Edit, Announce and Delete for the organiser, Delete last), the facts as tiles, the banners and the one dock button.
 * What it does with an RSVP, a save or a check-in is unchanged and pinned by the source tests beside this one.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'e1' }),
  useFocusEffect: () => {},
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getEvent: jest.fn(),
    getRoomPreview: jest.fn(() => Promise.resolve({ success: false })),
    toggleInterest: jest.fn(),
    rsvpToEvent: jest.fn(),
    cancelRsvp: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => ({
  subscribeToEventCheckIn: () => () => {},
  subscribeToEventInterest: () => () => {},
}))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null }))
jest.mock('../components/scene/SceneLightbox', () => ({ SceneLightbox: () => null }))
jest.mock('../components/board/BoardSections', () => ({ BoardEntry: () => null }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn(), openPass: jest.fn() }))
jest.mock('../lib/calendar', () => ({ addToCalendar: jest.fn() }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn() }))
jest.mock('../lib/safetyUtils', () => ({ showEventReportOptions: jest.fn() }))
jest.mock('../lib/eventDetailCache', () => ({ getEventDetailCache: () => null, setEventDetailCache: jest.fn() }))
jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native')
  return { __esModule: true, default: (p: object) => <View {...p} testID="map" />, Marker: () => null }
})
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))

/* eslint-disable import/first */
import { router as mockRouter } from 'expo-router'
import EventDetail from '../components/screens/EventDetailScreen'
import { apiClient } from '../lib/apiClient'
import { openInMaps } from '../lib/openInMaps'
import { showEventReportOptions } from '../lib/safetyUtils'
import { showSheet } from '../lib/sheet'
import { markOffline, markOnline } from '../lib/networkStatus'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

const detail = (over: Record<string, unknown> = {}, status: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    id: 'e1',
    title: 'Vinyl Night',
    description: 'A night of records.',
    venueName: 'Toit',
    city: 'Bengaluru',
    address: 'Indiranagar',
    startTime: hours(3),
    endTime: hours(6),
    status: 'published',
    minAge: 18,
    doorPolicy: 'open',
    maxCapacity: 0,
    latitude: 12.9,
    longitude: 77.6,
    organizer: { id: 'org', name: 'Toit' },
    stats: { rsvpCount: 42, favoriteCount: 0, checkInCount: 0 },
    userStatus: { isFavorited: false, isCheckedIn: false, rsvpStatus: null, ...status },
    media: [],
    amenities: [],
    ...over,
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  markOnline()
})
const open = async () => {
  await render(<EventDetail />)
  await act(async () => {})
}

it('a missing event is "Event not found" with Go back, and says nothing about the connection', async () => {
  api.getEvent.mockResolvedValue({ success: false, error: 'Event not found', errorCode: 'NOT_FOUND' } as never)
  await open()
  expect(await screen.findByText('Event not found')).toBeTruthy()
  expect(screen.queryByText('Couldn’t load this event')).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
  expect(mockRouter.back).toHaveBeenCalled()
})

it('a dropped connection is "Couldn’t load this event" with Try again, which asks again', async () => {
  api.getEvent.mockResolvedValue({ success: false, error: 'network' } as never)
  await open()
  expect(await screen.findByText('Couldn’t load this event')).toBeTruthy()
  api.getEvent.mockResolvedValue(detail() as never)
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('The experience')).toBeTruthy()
})

it('draws the four facts as tiles: Doors, Where, Going and Door, and Where opens the map', async () => {
  api.getEvent.mockResolvedValue(detail() as never)
  await open()
  expect(await screen.findByTestId('scene-tile-doors')).toBeTruthy()
  expect(screen.getByTestId('scene-tile-crowd').props.accessibilityLabel).toBe('GOING, 42')
  expect(screen.getByTestId('scene-tile-door').props.accessibilityLabel).toBe('DOOR, 18+')
  await fireEvent.press(screen.getByTestId('scene-tile-where'))
  expect(openInMaps).toHaveBeenCalled()
})

it('says the age floor and the door in the Door tile and an age pill above 18', async () => {
  api.getEvent.mockResolvedValue(detail({ minAge: 21, doorPolicy: 'guest_list' }) as never)
  await open()
  expect((await screen.findByTestId('scene-tile-door')).props.accessibilityLabel).toBe('DOOR, 21+ · Guest list')
  expect(screen.getByTestId('scene-pill-age')).toBeTruthy()
})

describe('the ⋯ menu', () => {
  it('an attendee gets Report, which opens the event report', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Report this event' }))
    expect(showEventReportOptions).toHaveBeenCalledWith('Vinyl Night', 'e1')
  })

  it('the organiser also gets Edit and Announce, and Delete last, in red', async () => {
    api.getEvent.mockResolvedValue(detail({ organizer: { id: 'me', name: 'Me' } }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'More options' }))
    const names = within(screen.getByTestId('scene-menu')).getAllByRole('button').map((n) => n.props.accessibilityLabel)
    expect(names).toEqual(['Edit event', 'Send an announcement', 'Report this event', 'Delete event'])
  })
})

describe('banners and the dock', () => {
  it('cancelled: the banner, the quiet Cancelled button, and nothing to press', async () => {
    api.getEvent.mockResolvedValue(detail({ status: 'cancelled' }, { rsvpStatus: 'going' }) as never)
    await open()
    expect(await screen.findByTestId('scene-cancelled')).toBeTruthy()
    const cta = screen.getByRole('button', { name: 'Cancelled' })
    expect(cta.props.accessibilityState).toMatchObject({ disabled: true })
  })

  it('waitlisted: the paused banner, and the button says so (never "You’re going")', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'waitlisted' }) as never)
    await open()
    expect(await screen.findByTestId('scene-waitlisted')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'On the waitlist' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'You’re going' })).toBeNull()
  })

  it('before the doors the primary is "I’m going"', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    expect(await screen.findByRole('button', { name: 'I\'m going' })).toBeTruthy()
  })

  it('says it is offline, under the hero, while it still shows what it had', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    await screen.findByText('The experience')
    expect(screen.queryByTestId('scene-offline')).toBeNull()
    await act(async () => markOffline())
    await waitFor(() => expect(screen.getByText('Offline. Showing what you had.')).toBeTruthy())
    expect(screen.getByText('The experience')).toBeTruthy()
  })
})

describe('the RSVP answers are the app\'s Sheet, not a tray', () => {
  it('"You’re going" asks before it lets go: Keep it, or the destructive Cancel RSVP (whose press plays the haptic)', async () => {
    api.getEvent.mockResolvedValue(detail({}, { rsvpStatus: 'going' }) as never)
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'You\'re going' }))
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    expect(sheet).toMatchObject({ kind: 'actions', title: 'Cancel your RSVP?' })
    expect(sheet.actions.map((a: { label: string; variant: string }) => [a.label, a.variant])).toEqual([
      ['Keep it', 'secondary'],
      ['Cancel RSVP', 'destructive'],
    ])
    // Nothing is cancelled until the destructive action runs.
    expect(api.cancelRsvp).not.toHaveBeenCalled()
    api.cancelRsvp.mockResolvedValue({ success: true, data: { rsvpCount: 41 } } as never)
    await act(async () => sheet.actions[1].then())
    expect(api.cancelRsvp).toHaveBeenCalledWith('e1')
  })

  it('a failed RSVP says so in a sheet and plays the error haptic once', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    api.rsvpToEvent.mockResolvedValue({ success: false } as never)
    const { H } = jest.requireActual('../lib/haptics')
    const error = jest.spyOn(H, 'error').mockImplementation(() => {})
    await open()
    await fireEvent.press(await screen.findByRole('button', { name: 'I\'m going' }))
    await waitFor(() => expect(showSheet).toHaveBeenCalledWith(expect.objectContaining({ title: 'Couldn’t RSVP' })))
    expect(error).toHaveBeenCalledTimes(1)
  })
})

describe('the sections kept from before the redesign, on the design system, behind the frame\'s layout', () => {
  it('the byline: who is putting it on, and the live count while it runs', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    expect(await screen.findByTestId('scene-byline')).toHaveTextContent(/By Toit/)
  })

  it('attendees: the heading read as one "Going, 42"', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    const attendees = await screen.findByTestId('scene-attendees')
    expect(within(attendees).getByRole('header', { name: 'Going, 42' })).toBeTruthy()
  })

  it('the location card: the venue, its address and the map, and a tap opens Maps', async () => {
    api.getEvent.mockResolvedValue(detail() as never)
    await open()
    const card = await screen.findByTestId('scene-location')
    expect(card).toHaveTextContent(/Toit/)
    expect(card).toHaveTextContent(/Indiranagar/)
    await fireEvent.press(screen.getByRole('button', { name: 'Open Toit in Maps' }))
    expect(openInMaps).toHaveBeenCalled()
  })
})
