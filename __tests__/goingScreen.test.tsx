/**
 * The Going tab on the real screen, at scale: a person with hundreds of past nights, dozens of saves and a long run of RSVPs.
 * The server returns a page and the true total (`pagination`); the tab draws what it holds, says what is left as it is, and asks
 * for the next page when the reader does (or, for Past, reaches the end). Venue visits, a night that moved, and the row's ⋯.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  // Once, as a focus is: the real hook runs on the focus, not on every render.
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => cb(), []),
  useScrollToTop: () => {},
}))
jest.mock('../app/(tabs)/_layout', () => ({ TAB_BAR_CLEARANCE: 80 }))
const mockUser = { id: 'me' }
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../lib/apiClient', () => ({
  apiClient: {
    getUserFavorites: jest.fn(),
    getMyRsvps: jest.fn(),
    getMyAttendance: jest.fn(),
    getMyEventRating: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    removeFavorite: jest.fn(),
    addFavorite: jest.fn(),
  },
}))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/shareRow', () => ({ shareEvent: jest.fn() }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn() }))
jest.mock('../lib/paywall', () => ({ openTonight: jest.fn() }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import Going from '../app/(tabs)/going'
import { apiClient } from '../lib/apiClient'
import { showSheet } from '../lib/sheet'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const day = (n: number, h = 20) => new Date(2026, 8, n, h).toISOString()
const night = (i: number, over: object = {}) => ({
  id: `p${i}`,
  title: `Night ${i}`,
  cover_image_url: null,
  start_time: day(1, 20),
  end_time: day(1, 23),
  venue_name: 'Toit',
  city: null,
  attendedAt: day(1, 20),
  ...over,
})
const nights = (from: number, n: number) => Array.from({ length: n }, (_, i) => night(from + i))
const upcoming = (id: string, over: object = {}) => ({
  id,
  title: `Event ${id}`,
  venueName: 'Toit',
  startTime: new Date(Date.now() + 86_400_000 * 3).toISOString(),
  endTime: new Date(Date.now() + 86_400_000 * 3 + 7_200_000).toISOString(),
  status: 'published',
  ...over,
})
const page = (page: number, totalCount: number, hasMore: boolean) => ({ page, limit: 30, totalCount, hasMore })

beforeEach(() => {
  jest.clearAllMocks()
  api.getUserFavorites.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false) } } as never)
  api.getMyRsvps.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false) } } as never)
  api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [], pagination: page(1, 0, false), lockedCount: 0 } } as never)
})

const open = async () => {
  await render(<Going />)
  await act(async () => {})
}

describe('hundreds of past nights', () => {
  // Four rows to a page keeps the section's end inside the first window; the server's real page is 30.
  const pageOf = (n: number) => ({ success: true, data: { events: nights((n - 1) * 4, 4), pagination: page(n, 312, true), lockedCount: 0 } })
  beforeEach(() => {
    api.getMyAttendance.mockImplementation((_limit?: number, n = 1) => Promise.resolve(pageOf(n)) as never)
  })
  const more = () => screen.getByTestId('going-more-past')
  const left = () => Number(/\d+/.exec(more().props.accessibilityLabel)?.[0])

  it('draws a page, the true count in the header, and says what is left', async () => {
    await open()
    expect(await screen.findByText('Night 3')).toBeTruthy()
    expect(screen.getByLabelText('Past, 312')).toBeTruthy()
    // What is left is the server's total less what is held, whatever has been asked for since.
    expect(left()).toBe(308)
  })

  it('reading the first page asks for a page by size, not for everything', async () => {
    await open()
    expect(api.getMyAttendance).toHaveBeenCalledWith(30)
    expect(api.getUserFavorites).toHaveBeenCalledWith('me', 1, 30)
  })

  it('the next page is asked for by number, and what comes is added after what is held', async () => {
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    await waitFor(() => expect(api.getMyAttendance).toHaveBeenCalledWith(30, 2))
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
    expect(left()).toBe(304)
    expect(screen.getByText('Night 0')).toBeTruthy()
    expect(screen.getByLabelText('Past, 312')).toBeTruthy()
  })

  it('a refused page says so on the row, keeps what is held, and asks again when the row is pressed', async () => {
    api.getMyAttendance.mockImplementation((_limit?: number, n = 1) => Promise.resolve(n === 1 ? pageOf(1) : { success: false, error: 'boom' }) as never)
    await open()
    await fireEvent.press(await screen.findByTestId('going-more-past'))
    await waitFor(() => expect(more().props.accessibilityLabel).toBe('Couldn’t load more. Try again'))
    expect(screen.getByText('Night 0')).toBeTruthy()
    // The scroll does not ask again by itself: a refusal is not a loop.
    const asked = api.getMyAttendance.mock.calls.length
    await act(async () => {})
    expect(api.getMyAttendance.mock.calls.length).toBe(asked)
    api.getMyAttendance.mockImplementation((_limit?: number, n = 1) => Promise.resolve(pageOf(n)) as never)
    await fireEvent.press(more())
    await waitFor(() => expect(screen.getByText('Night 7')).toBeTruthy())
  })

  it('the last page leaves no row and no claim: the header goes back to a bare word', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: nights(0, 12), pagination: page(1, 12, false), lockedCount: 0 } } as never)
    await open()
    expect(await screen.findByText('Night 0')).toBeTruthy()
    expect(screen.queryByTestId('going-more-past')).toBeNull()
    expect(screen.getByLabelText('Past')).toBeTruthy()
  })
})

describe('RSVPs and saves are paged the same way', () => {
  it('a long run of RSVPs and of saves each end with their own count', async () => {
    api.getMyRsvps.mockResolvedValue({
      success: true,
      data: { events: Array.from({ length: 3 }, (_, i) => ({ ...upcoming(`g${i}`), rsvpStatus: 'going' })), pagination: page(1, 80, true) },
    } as never)
    api.getUserFavorites.mockResolvedValue({
      success: true,
      data: { events: Array.from({ length: 3 }, (_, i) => upcoming(`s${i}`)), pagination: page(1, 41, true) },
    } as never)
    await open()
    expect(await screen.findByTestId('going-more-going')).toBeTruthy()
    expect(screen.getByTestId('going-more-going').props.accessibilityLabel).toBe('Show 77 more')
    expect(screen.getByTestId('going-more-saved').props.accessibilityLabel).toBe('Show 38 more')
    expect(screen.getByLabelText('Saved, 41')).toBeTruthy()
  })
})

describe('Past: the places you went live at (Flow 4, frame 01)', () => {
  const visit = night(1, { id: 'v1', kind: 'venue_day', title: 'bookkeeping title', venue_name: 'Toit', stay_minutes: 100 })

  it('is the place\'s name, "Live here · date · how long", and a Venue tag, with no rating to ask for', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [visit], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    expect(await screen.findByText('Toit')).toBeTruthy()
    expect(screen.queryByText('bookkeeping title')).toBeNull()
    expect(screen.getByText('Venue')).toBeTruthy()
    expect(screen.getByLabelText(/^Toit, live here, .*1h 40m$/)).toBeTruthy()
    expect(screen.queryByText('Rate who you met')).toBeNull()
    expect(api.getMyEventRating).not.toHaveBeenCalled()
  })

  it('without a place id it is read and not offered', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [visit], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    expect((await screen.findByLabelText(/^Toit, live here/)).props.accessibilityRole).toBe('text')
  })

  it('with the place\'s id (when the server sends it) it opens the place', async () => {
    api.getMyAttendance.mockResolvedValue({ success: true, data: { events: [{ ...visit, venue_id: 'v-toit' }], pagination: page(1, 1, false), lockedCount: 0 } } as never)
    await open()
    await fireEvent.press(await screen.findByLabelText(/^Toit, live here/))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/venue/[id]', params: { id: 'v-toit' } })
  })
})

describe('a night that moved, and the row\'s ⋯', () => {
  const rows = [
    { ...upcoming('a'), rsvpStatus: 'going' },
    { ...upcoming('b'), rsvpStatus: 'going', changedFields: ['time'] },
    { ...upcoming('c'), rsvpStatus: 'going', changedFields: ['venue'] },
  ]
  beforeEach(() => {
    api.getMyRsvps.mockResolvedValue({ success: true, data: { events: rows, pagination: page(1, 3, false) } } as never)
  })

  it('says "New time" or "New venue" on the row it moved, and nothing from a server that does not send it', async () => {
    await open()
    expect(await screen.findByText('New time')).toBeTruthy()
    expect(screen.getByText('New venue')).toBeTruthy()
    expect(screen.getAllByText(/^New /)).toHaveLength(2)
  })

  it('the ⋯ opens the row\'s actions in the app\'s Sheet: Share, Directions, Add to calendar, Cancel', async () => {
    await open()
    await fireEvent.press((await screen.findAllByLabelText(/^More about Event b/))[0])
    const sheet = (showSheet as jest.Mock).mock.calls[0][0]
    expect(sheet.title).toBe('Event b')
    expect(sheet.actions.map((a: { label: string }) => a.label)).toEqual(['Share', 'Directions', 'Add to calendar', 'Cancel'])
    expect(router.push).not.toHaveBeenCalled()
  })
})
