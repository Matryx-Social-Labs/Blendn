/**
 * The event page with tickets (event page A, contract §1): `ticketing: null` changes nothing; native shows the price line,
 * the Tickets rows (left, sold out, sales end; folded after three) and a dock that sells, then "You're going · N tickets"
 * and "My ticket"; sold out offers Save; external is one row and "Tickets on <site> ↗" in the in-app browser beside the RSVP.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import * as WebBrowser from 'expo-web-browser'

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
    getActiveCheckins: jest.fn(() => Promise.resolve({ success: true, data: { checkIns: [] } })),
    getEventChat: jest.fn(),
    toggleInterest: jest.fn(() => Promise.resolve({ success: true, data: { interested: true, interestCount: 1 } })),
    rsvpToEvent: jest.fn(),
    cancelRsvp: jest.fn(),
    getTicketQuote: jest.fn(() => new Promise(() => {})),
    createTicketOrder: jest.fn(),
    getTicketOrder: jest.fn(),
    forgetEvent: jest.fn(),
  },
}))
jest.mock('../lib/socketClient', () => ({ subscribeToEventCheckIn: () => () => {}, subscribeToEventInterest: () => () => {} }))
jest.mock('../lib/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../components/scene/SceneHeroMedia', () => ({ SceneHeroMedia: () => null, HERO_CAPTION_FOOT: 40 }))
jest.mock('../components/scene/SceneLightbox', () => ({ SceneLightbox: () => null }))
jest.mock('../components/board/BoardSections', () => ({ BoardEntry: () => null }))
jest.mock('../lib/blendnOverlay', () => ({ openBlendn: jest.fn(), openPass: jest.fn(), openRoomOf: jest.fn(), useRoomUp: () => false, useLiveEventId: () => null, useLiveTitle: () => null }))
jest.mock('../lib/calendar', () => ({ addToCalendar: jest.fn() }))
jest.mock('../lib/openInMaps', () => ({ openInMaps: jest.fn() }))
jest.mock('../lib/safetyUtils', () => ({ showEventReportOptions: jest.fn() }))
jest.mock('../lib/eventDetailCache', () => ({ getEventDetailCache: () => null, setEventDetailCache: jest.fn(), forgetEventDetailCache: jest.fn() }))
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
jest.mock('../lib/pushAsk', () => ({ askPushInContext: jest.fn(() => Promise.resolve()) }))
jest.mock('expo-location', () => ({ ...jest.requireActual('expo-location'), getLastKnownPositionAsync: () => Promise.resolve(null) }))

/* eslint-disable import/first */
import { router } from 'expo-router'
import EventDetail from '../components/screens/EventDetailScreen'
import { apiClient } from '../lib/apiClient'
import { askPushInContext } from '../lib/pushAsk'
import { markOnline } from '../lib/networkStatus'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const type = (id: string, over: object = {}) => ({
  id,
  name: `Type ${id}`,
  description: null,
  priceMinor: 79_900,
  status: 'on_sale',
  remaining: null,
  salesStartAt: null,
  salesEndAt: null,
  maxPerOrder: 10,
  ...over,
})
const native = (over: object = {}) => ({
  mode: 'native',
  currency: 'INR',
  fromMinor: 49_900,
  feesAbsorbed: false,
  refundPolicy: 'until_24h',
  types: [
    type('t1', { name: 'Early bird', priceMinor: 49_900, remaining: 6 }),
    type('t2', { name: 'General' }),
    type('t3', { name: 'Couple', priceMinor: 89_900, status: 'sold_out' }),
    type('t4', { name: 'VIP deck', priceMinor: 149_900 }),
    type('t5', { name: 'Late' }),
  ],
  mine: null,
  ...over,
})
const detail = (ticketing: unknown, status: object = {}) => ({
  success: true,
  data: {
    id: 'e1',
    title: 'Rooftop Sundowner',
    description: 'Sunset sets.',
    venueName: 'High Ultra Lounge',
    city: 'Bengaluru',
    startTime: hours(72),
    endTime: hours(76),
    status: 'published',
    minAge: 18,
    doorPolicy: 'open',
    organizer: { id: 'org', name: 'High' },
    stats: { rsvpCount: 4, favoriteCount: 0, checkInCount: 0 },
    userStatus: { isFavorited: false, isCheckedIn: false, rsvpStatus: null, ...status },
    media: [],
    amenities: [],
    ticketing,
  },
})
const open = async (ticketing: unknown, status: object = {}) => {
  api.getEvent.mockResolvedValue(detail(ticketing, status) as never)
  await render(<EventDetail />)
  await act(async () => {})
}
const dock = () => within(screen.getByTestId('scene-dock'))
// The in-app browser is presented a macrotask after the press (`lib/links.ts` `present`).
const browserTurn = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
  jest.clearAllMocks()
  markOnline()
})

it('ticketing null: the free page is unchanged — no price, no Tickets section, "I’m going" in the dock', async () => {
  await open(null)
  expect(screen.queryByTestId('ticket-price-line')).toBeNull()
  expect(screen.queryByTestId('ticket-section')).toBeNull()
  expect(dock().getByRole('button', { name: 'I’m going' })).toBeTruthy()
  expect(dock().queryByText('Get tickets')).toBeNull()
})

describe('native', () => {
  it('a price line in the currency, rows with their states, three shown and the rest folded', async () => {
    await open(native())
    expect(screen.getByLabelText('From 499 Indian rupees, plus booking fee')).toBeTruthy()
    const section = within(screen.getByTestId('ticket-section'))
    expect(section.getByRole('button', { name: /^Early bird, 499 Indian rupees, 6 left/ })).toBeTruthy()
    // Sold out is said, and is not a button.
    expect(section.getByLabelText('Couple, sold out')).toBeTruthy()
    expect(section.queryByRole('button', { name: /^Couple/ })).toBeNull()
    expect(section.queryByText('VIP deck')).toBeNull()
    expect(section.getByRole('button', { name: 'See all 5 ticket types' })).toBeTruthy()
    expect(section.getByText('₹499')).toBeTruthy()
  })

  it('absorbed fees say "Price includes fees"', async () => {
    await open(native({ feesAbsorbed: true }))
    expect(screen.getByLabelText('From 499 Indian rupees, price includes fees')).toBeTruthy()
  })

  it('the dock sells: "From ₹499" and Get tickets, which opens the sheet with nothing picked', async () => {
    await open(native())
    expect(dock().getByText('From ₹499')).toBeTruthy()
    await fireEvent.press(dock().getByRole('button', { name: 'Get tickets' }))
    expect(screen.getByTestId('checkout-sheet')).toBeTruthy()
    expect(screen.getByTestId('checkout-step-t1').props.accessibilityValue.now).toBe(0)
  })

  it('a row opens the sheet with that type at 1', async () => {
    await open(native())
    await fireEvent.press(screen.getByRole('button', { name: /^General,/ }))
    expect(screen.getByTestId('checkout-step-t2').props.accessibilityValue.now).toBe(1)
  })

  it('bought: "You’re going · 2 tickets" and My ticket, which opens the pass', async () => {
    await open(native({ mine: { ticketCount: 2, orderIds: ['o1'] } }))
    expect(dock().getByText('You’re going')).toBeTruthy()
    expect(dock().getByText('2 tickets · works offline')).toBeTruthy()
    await fireEvent.press(dock().getByRole('button', { name: 'My ticket' }))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/ticket/[orderId]', params: { orderId: 'o1' } })
    expect(screen.getByText('You’re going · 2 tickets')).toBeTruthy()
  })

  it('sold out: the dock says so and offers Save, never a dead Get tickets', async () => {
    await open(native({ types: [type('t1', { status: 'sold_out' }), type('t2', { status: 'sold_out' })] }))
    expect(dock().getByText('Sold out')).toBeTruthy()
    expect(dock().queryByRole('button', { name: 'Get tickets' })).toBeNull()
    await fireEvent.press(dock().getByRole('button', { name: 'Save' }))
    expect(api.toggleInterest).toHaveBeenCalledWith('e1')
  })
})

describe('external', () => {
  const external = { mode: 'external', externalUrl: 'https://www.eventbrite.ca/e/123', externalSite: 'eventbrite.ca' }

  it('one row and a plain line about who sells; the dock keeps I’m going beside Tickets on <site>', async () => {
    await open(external)
    expect(screen.getByText('Sold by the organizer')).toBeTruthy()
    expect(screen.getByText('on eventbrite.ca')).toBeTruthy()
    expect(screen.getByText(/Blend’n doesn’t sell these tickets or take a cut/)).toBeTruthy()
    expect(dock().getByRole('button', { name: 'I’m going' })).toBeTruthy()
    expect(dock().getByRole('button', { name: 'Tickets on eventbrite.ca, opens in browser' })).toBeTruthy()
  })

  it('the dock and the row both open the organizer’s link in the in-app browser', async () => {
    await open(external)
    await fireEvent.press(dock().getByRole('button', { name: 'Tickets on eventbrite.ca, opens in browser' }))
    await browserTurn()
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.eventbrite.ca/e/123', expect.anything())
    ;(WebBrowser.openBrowserAsync as jest.Mock).mockClear()
    await fireEvent.press(screen.getByRole('link', { name: 'Find tickets on eventbrite.ca, opens in browser' }))
    await browserTurn()
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.eventbrite.ca/e/123', expect.anything())
  })

  it('I’m going is still the RSVP, and still asks for push in context', async () => {
    api.rsvpToEvent.mockResolvedValue({ success: true, data: { rsvpStatus: 'going', rsvpCount: 5 } } as never)
    await open(external)
    await fireEvent.press(dock().getByRole('button', { name: 'I’m going' }))
    await act(async () => {})
    expect(api.rsvpToEvent).toHaveBeenCalledWith('e1', 'going')
    expect(askPushInContext).toHaveBeenCalledWith('rsvp', 'Rooftop Sundowner')
  })
})
