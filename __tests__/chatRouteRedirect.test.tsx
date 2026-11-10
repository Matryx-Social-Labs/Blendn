import React from 'react'
import { render } from '@testing-library/react-native'
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

// eslint-disable-next-line import/first
import GroupChat from '../app/chat/[id]'
// eslint-disable-next-line import/first
import { blendnClosed, isBlendnOpen, setCurrentTab, setLiveHint, setLiveRoomChat, takePendingTab, takeReturnTo } from '../lib/blendnOverlay'

beforeEach(() => {
  mockDismissTo.mockClear()
  mockDismissAll.mockClear()
  mockReplace.mockClear()
  mockCanDismiss = true
  setCurrentTab('events')
  blendnClosed()
  takeReturnTo()
  setLiveRoomChat('live-room')
})

it('the live room’s chat opens the room on its Chat tab, over the tabs', async () => {
  mockParams = { id: 'live-room' }
  const view = await render(<GroupChat />)
  expect(view.queryByText(/chat screen/)).toBeNull()
  expect(isBlendnOpen()).toBe(true)
  expect(takePendingTab()).toBe('chat')
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
  expect(takePendingTab()).toBe('chat')
  setLiveHint(null)
})

it('with no live room every chat is a screen', async () => {
  setLiveRoomChat(null)
  mockParams = { id: 'live-room' }
  const view = await render(<GroupChat />)
  expect(view.getByText('chat screen live-room')).toBeTruthy()
})

it('from the event page: closing the room comes back to that page (ROOM-13), so the overlay remembers it', async () => {
  mockParams = { id: 'live-room', eventId: 'e1', from: 'event' }
  await render(<GroupChat />)
  expect(takePendingTab()).toBe('chat')
  expect(takeReturnTo()).toBe('e1')
})

it('control: a push or a link carries the event too, and closing stays on the tabs', async () => {
  mockParams = { id: 'live-room', eventId: 'e1' }
  await render(<GroupChat />)
  expect(isBlendnOpen()).toBe(true)
  expect(takeReturnTo()).toBeNull()
})
