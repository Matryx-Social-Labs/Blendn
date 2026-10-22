/**
 * Whose words the Scene may paint before its fetch lands (lib/sceneSeed.ts): a card opened inside the app seeds it at
 * once; a link never does, whatever its query says, because a link is anyone's string and a cover URL is a request.
 */
import { act, render, screen } from '@testing-library/react-native'

let mockParams: Record<string, string> = { id: 'e1' }

jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), journey: jest.fn() } }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
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
import EventDetail from '../components/screens/EventDetailScreen'
import { apiClient } from '../lib/apiClient'
import { markOnline } from '../lib/networkStatus'
import { nativeIntentPath } from '../lib/shareLinks'
import { internalSeed } from '../lib/sceneSeed'
/* eslint-enable import/first */

const api = apiClient as jest.Mocked<typeof apiClient>
const NEVER = new Promise<never>(() => {})

const CRAFTED = 'title=Free%20money%20here&cover=https://attacker.example/x.jpg&description=Send%20your%20bank%20details&venue=Attacker%20Bar&start=2026-12-31T20:00:00Z'
const query = (url: string) => Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''))

beforeEach(() => {
  jest.clearAllMocks()
  markOnline()
  // The fetch has not landed: what is on screen is what the route seeded.
  api.getEvent.mockReturnValue(NEVER as never)
})
const open = async () => {
  await render(<EventDetail />)
  await act(async () => {})
}

it('a crafted external link lands on the Scene with no params, so none of its words or its cover are drawn', async () => {
  const landed = nativeIntentPath(`https://www.blendn.app/e/e1?${CRAFTED}`)
  expect(landed).toBe('/event/e1')
  mockParams = { id: 'e1', ...query(landed) }
  await open()
  expect(screen.queryByText('Free money here')).toBeNull()
  expect(screen.queryByText('Send your bank details')).toBeNull()
  expect(screen.queryByText('Attacker Bar')).toBeNull()
})

it('even if a crafted query reached the route, without the app’s own flag it seeds nothing (including a forged one that never survived the intent)', async () => {
  mockParams = { id: 'e1', ...query(`x?${CRAFTED}`) }
  await open()
  expect(screen.queryByText('Free money here')).toBeNull()
  expect(screen.queryByText('Attacker Bar')).toBeNull()
})

it('a card opened inside the app still seeds the Scene at once', async () => {
  mockParams = {
    id: 'e1',
    ...internalSeed({ title: 'Vinyl Night', cover: '', venue: 'Toit', city: 'Indiranagar', start: new Date(Date.now() + 3_600_000).toISOString(), end: new Date(Date.now() + 7_200_000).toISOString(), category: '', description: 'A night of records.' }),
  }
  await open()
  expect(screen.getAllByText('Vinyl Night').length).toBeGreaterThan(0)
})
