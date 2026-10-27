/**
 * A crew like in the liker's crew chat (admin lib/crews/like.ts: `type: "system"`, the words a predicate) is the room
 * saying who did what: a centred line, never a bubble, and your own never drawn as yours (TG-10, RC audit C22).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { RoomMessageRow, type RowHandlers } from '../components/chat/RoomFeed'
import { crewLikeLine } from '../lib/crews'
import type { RoomMessage } from '../lib/roomMessages'

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native')
  return { Image: ({ source }: { source: { uri: string } }) => <View testID={`img-${source.uri}`} /> }
})
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }), VideoView: () => null }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

const handlers: RowHandlers = { menu: jest.fn(), retry: jest.fn(), react: jest.fn(), reply: jest.fn(), sender: jest.fn(), link: jest.fn(), pollRefusal: jest.fn() }
const like = (over: Partial<RoomMessage> = {}): RoomMessage => ({
  message_id: 'm1',
  sender_id: 'u-rohan',
  sender_name: 'Rohan',
  message_text: 'liked Crew Nebula for the crew',
  message_type: 'system',
  reply_to_message_id: null,
  created_at: '2026-10-24T19:00:00.000Z',
  ...over,
})
const row = (item: RoomMessage, mine: boolean) =>
  render(<RoomMessageRow item={item} roomId="g1" mine={mine} first last senderTappable={false} handlers={handlers} />)

it('somebody’s like: a centred line naming them, no bubble', async () => {
  await row(like(), false)
  expect(screen.getByTestId('system-m1')).toHaveTextContent('Rohan liked Crew Nebula for the crew')
  expect(screen.queryByTestId('bubble-m1')).toBeNull()
})

it('your own like: "You liked …", never your own bubble', async () => {
  await row(like({ sender_id: 'me', sender_name: 'You' }), true)
  expect(screen.getByTestId('system-m1')).toHaveTextContent('You liked Crew Nebula for the crew')
  expect(screen.queryByTestId('bubble-m1')).toBeNull()
})

it('any other message of a person stays their bubble', async () => {
  await row(like({ message_type: 'system', message_text: 'We’re here 👋' }), false)
  expect(screen.getByTestId('bubble-m1')).toBeTruthy()
  await row(like({ message_type: 'text' }), false)
  expect(screen.getByTestId('bubble-m1')).toBeTruthy()
})

it('the Banter preview words: who, then the predicate, with no "You:"', () => {
  expect(crewLikeLine('liked Crew Nebula for the crew', 'You')).toBe('You liked Crew Nebula for the crew')
  expect(crewLikeLine('  liked Two for the crew ', 'Rohan')).toBe('Rohan liked Two for the crew')
  expect(crewLikeLine('see you at 9', 'Rohan')).toBeNull()
})

describe('a crew’s members are photographed, an event’s room is creatures (ROOM-07, SV-6)', () => {
  const PHOTO = 'https://cdn.example/rohan.jpg'
  const { roomMessagesFrom } = require('../lib/roomMessages')
  const { senderOf } = require('../components/chat/RoomFeed')
  const raw = (user: Record<string, unknown>) => [{ id: 'm1', type: 'text', content: 'hi', createdAt: '2026-10-24T19:00:00.000Z', user: { id: 'u1', name: 'Rohan', ...user } }]

  it('a crew room keeps the server’s user.image, and senderOf hands it to the bubble', () => {
    const [m] = roomMessagesFrom(raw({ image: PHOTO }), 'me', 'crew')
    expect(m.sender_image).toBe(PHOTO)
    expect(senderOf(m, 'g1')).toMatchObject({ name: 'Rohan', photoUri: PHOTO })
  })

  // Defence in depth for anonymity: whatever the server sends, only a crew's room is photographed.
  it.each([['event', 'event'], ['board_post', 'board_post'], ['blend', 'blend'], ['no kind (an event’s room)', undefined]])(
    'a %s room drops user.image even when the server sends one',
    (_label, kind) => {
      const [m] = roomMessagesFrom(raw({ image: PHOTO }), 'me', kind as never)
      expect(m.sender_image).toBeUndefined()
      expect(senderOf(m, 'g1').photoUri).toBeUndefined()
    }
  )

  it('a crew room with no image stays a creature', () => {
    const [m] = roomMessagesFrom(raw({ image: null }), 'me', 'crew')
    expect(m.sender_image).toBeUndefined()
  })

  it('the bubble draws the photo for a crew member, and a creature (no image) for anyone else', async () => {
    await row(like({ message_type: 'text', sender_image: PHOTO }), false)
    expect(screen.getByTestId(`img-${PHOTO}`, { includeHiddenElements: true })).toBeTruthy()
  })

  it('no photo for a sender without one', async () => {
    await row(like({ message_type: 'text' }), false)
    expect(screen.queryByTestId(`img-${PHOTO}`, { includeHiddenElements: true })).toBeNull()
  })
})
