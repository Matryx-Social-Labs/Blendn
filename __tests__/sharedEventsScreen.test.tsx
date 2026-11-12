/**
 * State 2 C's See all (SCRUM-1042): every event you have both been to, a page at a time, for the handle the page was
 * opened with. The rule is the server's; this screen draws what it is sent.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: 'rh_v', name: 'Venkatalakshmi' }) }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('../lib/apiClient', () => ({ apiClient: { getSharedEvents: jest.fn() } }))

import { apiClient } from '../lib/apiClient'
import SharedEventsScreen from '../app/shared-events/[id]'

const api = apiClient as jest.Mocked<typeof apiClient>
const ev = (i: number) => ({ id: `ev${i}`, title: `Night ${i}`, startTime: '2026-10-12T14:00:00Z', timezone: 'Asia/Kolkata', venueName: 'Champaca Bookstore', coverImageUrl: null })
const page = (from: number, n: number, total: number, next: string | null) => ({
  success: true,
  data: { events: Array.from({ length: n }, (_, i) => ev(from + i)), pagination: { limit: 20, hasMore: !!next, nextCursor: next, totalCount: total } },
})
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => jest.clearAllMocks())

it('asks for this handle, says with whom and how many, and draws the rows with their date and place', async () => {
  api.getSharedEvents.mockResolvedValueOnce(page(0, 2, 2, null) as never)
  await render(<SharedEventsScreen />)
  await settle()
  expect(api.getSharedEvents).toHaveBeenCalledWith('rh_v', 20, null)
  expect(screen.getByText('With Venkatalakshmi · 2 events, newest first')).toBeTruthy()
  expect(screen.getByText('Night 0')).toBeTruthy()
  expect(screen.getAllByText('12 Oct · Champaca Bookstore').length).toBe(2)
})

it('reads the next page by its cursor at the end of the list, and only while there is one', async () => {
  api.getSharedEvents.mockResolvedValueOnce(page(0, 20, 25, 'c1') as never).mockResolvedValueOnce(page(20, 5, 25, null) as never)
  await render(<SharedEventsScreen />)
  await settle()
  await fireEvent(screen.getByTestId('shared-events-list'), 'onEndReached')
  await settle()
  expect(api.getSharedEvents).toHaveBeenLastCalledWith('rh_v', 20, 'c1')
  await fireEvent(screen.getByTestId('shared-events-list'), 'onEndReached')
  await settle()
  expect(api.getSharedEvents).toHaveBeenCalledTimes(2)
})

it('says so when there are none, and when the first page fails (with a retry)', async () => {
  api.getSharedEvents.mockResolvedValueOnce(page(0, 0, 0, null) as never)
  const view = await render(<SharedEventsScreen />)
  await settle()
  expect(screen.getByTestId('shared-events-empty')).toBeTruthy()
  view.unmount()
  api.getSharedEvents.mockResolvedValueOnce({ success: false, error: 'down' } as never).mockResolvedValueOnce(page(0, 1, 1, null) as never)
  await render(<SharedEventsScreen />)
  await settle()
  expect(screen.getByTestId('shared-events-failed')).toBeTruthy()
  await fireEvent.press(screen.getByText('Try again'))
  await settle()
  expect(screen.getByText('Night 0')).toBeTruthy()
})

it('is registered with no native header: its own TopBar is the bar (drive, iOS showed "user/[id] | shared-events/[id]")', () => {
  const layout = jest.requireActual<typeof import('fs')>('fs').readFileSync(require.resolve('../app/_layout.tsx'), 'utf8')
  expect(layout).toContain('<Stack.Screen name="shared-events/[id]" options={{ headerShown: false }} />')
})
