/**
 * A crew like in the liker's crew chat (admin lib/crews/like.ts: `type: "system"`, the words a predicate) is the room
 * saying who did what: a centred line, never a bubble, and your own never drawn as yours (TG-10, RC audit C22).
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { RoomMessageRow, type RowHandlers } from '../components/chat/RoomFeed'
import { crewLikeLine } from '../lib/crews'
import type { RoomMessage } from '../lib/roomMessages'

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
