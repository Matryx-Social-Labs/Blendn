/**
 * The Scene's ways to share (Flow 16 · 16.1): the share circle in its bar, and “Bring someone?” in its dock once you are
 * going. Hidden, never disabled, for what may not be linked; an unlisted event shares its area only; never after check-in.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

const mockOpenShare = jest.fn((_target?: unknown) => Promise.resolve(true))
const mockOpenWhatsApp = jest.fn()

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
  apiClient: { getEvent: jest.fn(), getRoomPreview: jest.fn(() => Promise.resolve({ success: false })), toggleInterest: jest.fn(), rsvpToEvent: jest.fn(), cancelRsvp: jest.fn() },
}))
jest.mock('../lib/socketClient', () => ({ subscribeToEventCheckIn: () => () => {}, subscribeToEventInterest: () => () => {} }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null, HERO_CAPTION_FOOT: 40 }))
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
jest.mock('../lib/shareTray', () => ({ openShare: (t: unknown) => mockOpenShare(t) }))
jest.mock('../lib/shareWhatsApp', () => ({ openWhatsApp: (t: unknown) => mockOpenWhatsApp(t) }))

/* eslint-disable import/first */
import EventDetail from '../components/screens/EventDetailScreen'
import { apiClient } from '../lib/apiClient'
import { markOnline } from '../lib/networkStatus'
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
    city: 'Indiranagar',
    address: '298, 100 Feet Rd',
    startTime: hours(3),
    endTime: hours(6),
    status: 'published',
    visibility: 'public',
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
  mockOpenWhatsApp.mockResolvedValue(true)
  markOnline()
})
const open = async (data: ReturnType<typeof detail>) => {
  api.getEvent.mockResolvedValue(data as never)
  await render(<EventDetail />)
  await act(async () => {})
}

describe('the share circle', () => {
  it('opens the tray with the event card and its /event/ link', async () => {
    await open(detail())
    await fireEvent.press(await screen.findByRole('button', { name: 'Share' }))
    expect(mockOpenShare).toHaveBeenCalledWith({
      kind: 'event',
      event: expect.objectContaining({ title: 'Vinyl Night', venue: 'Toit', area: 'Indiranagar', url: 'https://www.blendn.app/event/e1', unlisted: false, cancelled: false }),
    })
  })

  it('an unlisted event shares its area only: the venue and the street are not in what the tray is given', async () => {
    await open(detail({ visibility: 'unlisted' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Share' }))
    const [target] = mockOpenShare.mock.calls[0] as unknown as [{ event: object }]
    expect(target.event).toMatchObject({ unlisted: true, venue: '', area: 'Indiranagar' })
    expect(JSON.stringify(target)).not.toMatch(/Toit|Feet/)
  })

  it('is not drawn at all for a private event or a draft: hidden, never disabled', async () => {
    await open(detail({ visibility: 'private' }))
    expect(await screen.findByText('Vinyl Night')).toBeTruthy()
    expect(screen.queryByTestId('scene-share')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    expect(screen.getByTestId('scene-save')).toBeTruthy()
  })
})

describe('“Bring someone?”', () => {
  const bring = () => screen.queryByTestId('scene-bring')

  it('appears in the dock once you are going, above the button', async () => {
    await open(detail({}, { rsvpStatus: 'going' }))
    expect(await screen.findByText('Bring someone?')).toBeTruthy()
    expect(within(screen.getByTestId('scene-dock')).getByText('Bring someone?')).toBeTruthy()
  })

  it('WhatsApp sends the message with the link; with no WhatsApp it falls back to the tray', async () => {
    await open(detail({}, { rsvpStatus: 'going' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'WhatsApp, send Vinyl Night' }))
    await act(async () => {})
    expect(mockOpenWhatsApp).toHaveBeenCalledWith(expect.stringContaining('https://www.blendn.app/event/e1'))
    expect(mockOpenShare).not.toHaveBeenCalled()
    mockOpenWhatsApp.mockResolvedValue(false)
    await fireEvent.press(screen.getByRole('button', { name: 'WhatsApp, send Vinyl Night' }))
    await act(async () => {})
    expect(mockOpenShare).toHaveBeenCalledTimes(1)
  })

  it('its circle opens the tray', async () => {
    await open(detail({}, { rsvpStatus: 'going' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Share Vinyl Night' }))
    expect(mockOpenShare).toHaveBeenCalledTimes(1)
  })

  it('is not there before you are going', async () => {
    await open(detail())
    expect(await screen.findByText('Vinyl Night')).toBeTruthy()
    expect(bring()).toBeNull()
  })

  it('is not there on the waitlist, nor once the night is called off', async () => {
    await open(detail({}, { rsvpStatus: 'waitlisted' }))
    expect(await screen.findByText('Vinyl Night')).toBeTruthy()
    expect(bring()).toBeNull()
    await open(detail({ status: 'cancelled' }, { rsvpStatus: 'going' }))
    expect(bring()).toBeNull()
  })

  it('is never there after check-in', async () => {
    await open(detail({ startTime: hours(-1), endTime: hours(2) }, { rsvpStatus: 'going', isCheckedIn: true }))
    expect(await screen.findByText('Vinyl Night')).toBeTruthy()
    expect(bring()).toBeNull()
  })

  it('is not there for what may not be linked', async () => {
    await open(detail({ visibility: 'private' }, { rsvpStatus: 'going' }))
    expect(await screen.findByText('Vinyl Night')).toBeTruthy()
    expect(bring()).toBeNull()
  })
})
