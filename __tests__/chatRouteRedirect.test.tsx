import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
/**
 * `chat/[id]` for the room you are in now opens the room's Chat tab (Flow 5 C1, R-A): installed links, pushes, the
 * Lobby handover, "Open the room" and the event page all reach this route, so this one check covers them. Every other
 * room (another event's, a crew's, a Blend's, a board post's) is still its own screen.
 */
let mockParams: Record<string, string> = {}
const mockDismissTo = jest.fn()
const mockDismissAll = jest.fn()
const mockReplace = jest.fn()
let mockCanDismiss = true
jest.mock('expo-router', () => ({
  router: {
    dismissTo: (...a: unknown[]) => mockDismissTo(...a),
    dismissAll: () => mockDismissAll(),
    canDismiss: () => mockCanDismiss,
    push: jest.fn(),
    back: jest.fn(),
    replace: (...a: unknown[]) => mockReplace(...a),
  },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('../components/chat/RoomChat', () => ({
  RoomChat: ({ id }: { id: string }) => {
    const { Text: T } = require('react-native')
    return <T>{`chat screen ${id}`}</T>
  },
}))
jest.mock('../components/chat/BrokenLink', () => ({ BrokenLink: () => null }))
// What the server says you are checked in to, and your chat list: asked only when the app does not know your room yet.
const mockActive = jest.fn()
const mockGroups = jest.fn()
jest.mock('../lib/apiClient', () => ({
  apiClient: { getActiveCheckins: (...a: unknown[]) => mockActive(...a), getChatGroups: (...a: unknown[]) => mockGroups(...a) },
}))
const checkedInTo = (eventId: string | null) => ({
  success: true,
  data: { checkIns: eventId ? [{ id: 'ci', eventId, checkInTime: '2026-11-14T20:00:00Z', event: { id: eventId, title: 'Design festival' } }] : [] },
})

// eslint-disable-next-line import/first
import GroupChat from '../app/chat/[id]'
// eslint-disable-next-line import/first
import { blendnClosed, getLiveEventId, isBlendnOpen, setCurrentTab, setLiveHint, setLiveRoomChat, getRoomTab, takeReturnTo } from '../lib/blendnOverlay'
// eslint-disable-next-line import/first
import { chatOpensInRoom } from '../lib/roomTab'

beforeEach(() => {
  mockDismissTo.mockClear()
  mockDismissAll.mockClear()
  mockReplace.mockClear()
  mockCanDismiss = true
  setCurrentTab('events')
  blendnClosed()
  takeReturnTo()
  setLiveHint(null)
  setLiveRoomChat('live-room')
  mockActive.mockReset().mockResolvedValue(checkedInTo(null))
  mockGroups.mockReset().mockResolvedValue({ success: true, data: [] })
})

it('the live room’s chat opens the room on its Chat tab, over the tabs', async () => {
  mockParams = { id: 'live-room' }
  const view = await render(<GroupChat />)
  expect(view.queryByText(/chat screen/)).toBeNull()
  expect(isBlendnOpen()).toBe(true)
  expect(getRoomTab()).toBe('chat')
  expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/events')
  expect(mockDismissAll).not.toHaveBeenCalled()
})

// Found on the iOS drive: from Banter's live row, closing the room landed on the Pulse (a dismiss-all reached `index`).
it('steps back to the tab you were on: Banter stays Banter', async () => {
  setCurrentTab('chat')
  mockParams = { id: 'live-room' }
  await render(<GroupChat />)
  expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/chat')
})

it('a cold-start link has no tabs under it yet: it replaces itself with them', async () => {
  mockCanDismiss = false
  mockParams = { id: 'live-room' }
  await render(<GroupChat />)
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/events')
})

it('a crew’s room is its own screen even with the live room’s id', async () => {
  mockParams = { id: 'live-room', kind: 'crew' }
  const view = await render(<GroupChat />)
  expect(view.getByText('chat screen live-room')).toBeTruthy()
  expect(isBlendnOpen()).toBe(false)
})

it('a push for the room you are checked in to, with the overlay never opened, opens its Chat tab', async () => {
  setLiveRoomChat(null)
  setLiveHint('e1')
  mockParams = { id: 'live-room', eventId: 'e1' }
  await render(<GroupChat />)
  expect(isBlendnOpen()).toBe(true)
  expect(getRoomTab()).toBe('chat')
  setLiveHint(null)
})

it('with no live room every chat is a screen', async () => {
  setLiveRoomChat(null)
  mockParams = { id: 'live-room' }
  const view = await render(<GroupChat />)
  expect(await view.findByText('chat screen live-room')).toBeTruthy()
  expect(isBlendnOpen()).toBe(false)
})

/*
 * SCRUM-1049: cold, a link or a push to the room you are checked in to opened the chat screen with its own header. The
 * route decides as it mounts, and cold that is before the tab bar has read your check-in (no live hint) and before the
 * Room has said its chat (no live chat id): both checks read "no room", so it was a screen. Now it asks.
 */
describe('cold, before the app knows which room you are in (SCRUM-1049)', () => {
  beforeEach(() => setLiveRoomChat(null))

  it('a push or a link naming the event you are checked in to opens its Chat tab', async () => {
    mockActive.mockResolvedValue(checkedInTo('e1'))
    mockCanDismiss = false
    mockParams = { id: 'room-1', eventId: 'e1' }
    const view = await render(<GroupChat />)
    await waitFor(() => expect(isBlendnOpen()).toBe(true))
    expect(getRoomTab()).toBe('chat')
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/events')
    expect(view.queryByText(/chat screen/)).toBeNull()
  })

  it('a bare blendn://chat/<id> link is matched to your room by its id in your chat list', async () => {
    mockActive.mockResolvedValue(checkedInTo('e1'))
    mockGroups.mockResolvedValue({ success: true, data: [{ id: 'room-2', event: { id: 'e2' } }, { id: 'room-1', event: { id: 'e1' } }] })
    mockParams = { id: 'room-1' }
    const view = await render(<GroupChat />)
    await waitFor(() => expect(isBlendnOpen()).toBe(true))
    expect(getRoomTab()).toBe('chat')
    expect(view.queryByText(/chat screen/)).toBeNull()
  })

  // Controls: every other answer is the chat screen, as before.
  it('another event’s room, a bare link to a room that is not yours, no check-in, or no answer: the chat screen', async () => {
    const cases: [Record<string, string>, () => void][] = [
      [{ id: 'room-2', eventId: 'e2' }, () => mockActive.mockResolvedValue(checkedInTo('e1'))],
      [
        { id: 'room-2' },
        () => {
          mockActive.mockResolvedValue(checkedInTo('e1'))
          mockGroups.mockResolvedValue({ success: true, data: [{ id: 'room-1', event: { id: 'e1' } }, { id: 'room-2', event: { id: 'e2' } }] })
        },
      ],
      [{ id: 'room-1', eventId: 'e1' }, () => mockActive.mockResolvedValue(checkedInTo(null))],
      [{ id: 'room-1', eventId: 'e1' }, () => mockActive.mockResolvedValue({ success: false })],
      [{ id: 'room-1', eventId: 'e1' }, () => mockActive.mockRejectedValue(new Error('offline'))],
      [{ id: 'room-1' }, () => {
        mockActive.mockResolvedValue(checkedInTo('e1'))
        mockGroups.mockRejectedValue(new Error('offline'))
      }],
    ]
    for (const [params, arrange] of cases) {
      blendnClosed()
      setLiveHint(null)
      setLiveRoomChat(null)
      arrange()
      mockParams = params
      const view = await render(<GroupChat />)
      expect(await view.findByText(`chat screen ${params.id}`)).toBeTruthy()
      expect(isBlendnOpen()).toBe(false)
      await view.unmount()
    }
  })

  it('a crew’s room never asks: it is its own screen at once', async () => {
    mockParams = { id: 'room-1', kind: 'crew' }
    const view = await render(<GroupChat />)
    expect(view.getByText('chat screen room-1')).toBeTruthy()
    expect(mockActive).not.toHaveBeenCalled()
  })

  it('what it learned is kept: the live hint and the room’s chat, so the next link decides at once', async () => {
    mockActive.mockResolvedValue(checkedInTo('e1'))
    mockGroups.mockResolvedValue({ success: true, data: [{ id: 'room-1', event: { id: 'e1' } }] })
    mockParams = { id: 'room-1' }
    await render(<GroupChat />)
    await waitFor(() => expect(isBlendnOpen()).toBe(true))
    expect(getLiveEventId()).toBe('e1')
    expect(chatOpensInRoom({ id: 'room-1' })).toBe(true)
  })
})

it('from the event page: closing the room comes back to that page (ROOM-13), so the overlay remembers it', async () => {
  mockParams = { id: 'live-room', eventId: 'e1', from: 'event' }
  await render(<GroupChat />)
  expect(getRoomTab()).toBe('chat')
  expect(takeReturnTo()).toBe('e1')
})

it('control: a push or a link carries the event too, and closing stays on the tabs', async () => {
  mockParams = { id: 'live-room', eventId: 'e1' }
  await render(<GroupChat />)
  expect(isBlendnOpen()).toBe(true)
  expect(takeReturnTo()).toBeNull()
})
