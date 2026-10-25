/*
 * Where an event's room is (`eventRoomDoor`): the one lookup behind the Blend'n overlay's chat button and the Scene's
 * Open the room (R6-5). It used to live inline in BlendnScreen, pinned by its source; now by what it answers.
 */
jest.mock('../lib/logger', () => ({ Logger: { warn: jest.fn() } }))
jest.mock('../lib/apiClient', () => ({ apiClient: { getEventChat: jest.fn() } }))
jest.mock('../lib/roomMembership', () => ({ markRoomLeft: jest.fn() }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { eventRoomDoor } from '../lib/eventRoomDoor'
import { NO_LONGER_AVAILABLE } from '../lib/noLongerAvailable'
import { markRoomLeft } from '../lib/roomMembership'
/* eslint-enable import/first */

const chat = apiClient.getEventChat as jest.Mock
const named = { roomName: 'Vinyl Night', eventTitle: 'Vinyl Night' }

it('an open room: its id, named', async () => {
  chat.mockResolvedValue({ success: true, data: { chatGroupId: 'g1' } })
  await expect(eventRoomDoor('e1', 'Vinyl Night')).resolves.toEqual({ kind: 'route', params: { id: 'g1', ...named } })
})

it('not open yet, to someone entitled: the chat, with the event and the server’s opensAt to count down to', async () => {
  const opensAt = new Date(Date.now() + 3_600_000).toISOString()
  chat.mockResolvedValue({ success: false, reasonCode: 'NOT_OPEN_YET', opensAt, chatGroupId: 'g1' })
  await expect(eventRoomDoor('e1', 'Vinyl Night')).resolves.toEqual({ kind: 'route', params: { id: 'g1', ...named, eventId: 'e1', opensAt } })
})

it('not open yet with no room to open: when it opens, in words', async () => {
  chat.mockResolvedValue({ success: false, reasonCode: 'NOT_OPEN_YET', opensAt: new Date(Date.now() + 3 * 3_600_000).toISOString() })
  await expect(eventRoomDoor('e1', 'Vinyl Night')).resolves.toEqual({ kind: 'say', line: 'The room opens in 3 hours.' })
})

it('left it: the chat, on its Rejoin', async () => {
  chat.mockResolvedValue({ success: false, errorCode: 'LEFT_ROOM', chatGroupId: 'g1' })
  await expect(eventRoomDoor('e1', '')).resolves.toEqual({ kind: 'route', params: { id: 'g1', roomName: 'Event chat', eventTitle: '' } })
  expect(markRoomLeft).toHaveBeenCalledWith('g1')
})

it('taken down: the suspension’s sentence, by its code', async () => {
  chat.mockResolvedValue({ success: false, errorCode: 'NOT_FOUND', reasonCode: 'ORGANISER_SUSPENDED' })
  await expect(eventRoomDoor('e1', 'Vinyl Night')).resolves.toEqual({ kind: 'say', line: NO_LONGER_AVAILABLE.line })
})

it('anything else, or a failed lookup: the old line', async () => {
  chat.mockResolvedValue({ success: false, errorCode: 'FORBIDDEN' })
  await expect(eventRoomDoor('e1', 'Vinyl Night')).resolves.toEqual({ kind: 'say', line: 'The chat for this event is not open yet.' })
  chat.mockRejectedValue(new Error('offline'))
  await expect(eventRoomDoor('e1', 'Vinyl Night')).resolves.toEqual({ kind: 'say', line: 'The chat for this event is not open yet.' })
})
