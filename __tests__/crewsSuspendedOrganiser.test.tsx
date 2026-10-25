/*
 * The Room's crews when the event's organiser was suspended (blendn-admin ce249325: the 404 of `GET /events/:id/crews` carries
 * `reasonCode: ORGANISER_SUSPENDED`): the one sentence, not "didn't load, tap to try again".
 */
import { act, renderHook, waitFor } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => void) => require('react').useEffect(() => fn(), [fn]), router: { push: jest.fn() } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }))
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/checkIn', () => ({ subscribeCheckInChanged: () => () => {} }))
const mockCrewsAt = jest.fn()
jest.mock('../lib/crewsApi', () => ({
  crewsApi: { crewsAt: (...a: unknown[]) => mockCrewsAt(...a), myCrews: jest.fn(async () => ({ success: true, data: { crews: [], invites: [] } })) },
}))

import { useCrewsHere } from '../components/crews/CrewsView'

// The body the door sends, as blendn-admin's event-changed-scene.itest.ts builds it (`withReason`).
const suspended = { success: false, errorCode: 'NOT_FOUND', reasonCode: 'ORGANISER_SUSPENDED', error: 'Event not found' }

it('is a gone state, not an error to retry', async () => {
  mockCrewsAt.mockResolvedValue(suspended)
  const { result } = await renderHook(() => useCrewsHere('e1'))
  await waitFor(() => expect(result.current.state.status).toBe('gone'))
})

it('a plain 404, or a failure, is still the error it was; not being checked in is still that', async () => {
  mockCrewsAt.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', error: 'Event not found' })
  const a = await renderHook(() => useCrewsHere('e1'))
  await waitFor(() => expect(a.result.current.state.status).toBe('error'))
  mockCrewsAt.mockResolvedValue({ success: false, errorCode: 'NOT_CHECKED_IN', error: 'x' })
  const b = await renderHook(() => useCrewsHere('e2'))
  await waitFor(() => expect(b.result.current.state.status).toBe('not_here'))
  await act(async () => {})
})
