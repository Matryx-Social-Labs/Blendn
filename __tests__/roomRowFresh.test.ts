/**
 * A room joined since the Banter list was cached (at the doors, from the event page) is not in that list: the room's
 * row asks the server once more, or the room never learns its event and the Lobby's card never shows (Lobby 6/6
 * drive, 2026-11-09).
 */
jest.mock('../lib/apiClient', () => ({ apiClient: { getChatGroups: jest.fn() } }))
jest.mock('../lib/socketClient', () => ({ subscribeToEventCheckIn: jest.fn(() => () => {}), subscribeToEventCheckOut: jest.fn(() => () => {}) }))
jest.mock('../lib/roomMembership', () => ({ rememberRoomMute: jest.fn() }))

import { renderHook, waitFor } from '@testing-library/react-native'

import { apiClient } from '../lib/apiClient'
import { useRoomRow } from '../lib/roomRow'

const api = apiClient as jest.Mocked<typeof apiClient>
const list = (...ids: string[]) => ({ success: true, data: { groups: ids.map((id) => ({ id, event: { id: `e-${id}`, title: 'Night' } })), rooms: [] } }) as never

beforeEach(() => api.getChatGroups.mockReset())

it('asks the server again when the cached list does not have the room', async () => {
  api.getChatGroups.mockImplementation(async (o?: { force?: boolean }) => (o?.force ? list('old', 'new') : list('old')))
  const { result } = await renderHook(() => useRoomRow('new'))
  await waitFor(() => expect(result.current?.eventId).toBe('e-new'))
  expect(api.getChatGroups).toHaveBeenLastCalledWith({ force: true })
})

it('does not ask again when the cached list has it', async () => {
  api.getChatGroups.mockResolvedValue(list('old'))
  const { result } = await renderHook(() => useRoomRow('old'))
  await waitFor(() => expect(result.current?.eventId).toBe('e-old'))
  expect(api.getChatGroups).toHaveBeenCalledTimes(1)
})
