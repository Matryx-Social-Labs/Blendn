/**
 * Audit H1 (a11y-motion 2026-10-24): every chat surface — an event's room, a crew's and a Blend's (all RoomMessageRow,
 * through app/chat/[id].tsx) and a DM (DmMessageRow) — gives a screen reader "More options", which opens the very menu
 * the hold opens (the screen's `menu` handler, at the bubble's frame): Report, Block, Copy, the card. Without it a blind
 * user could not report or block from a message. "View profile" where the room has a card for the sender.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { DmMessageRow, type DmRowHandlers } from '../components/chat/DmParts'
import { RoomMessageRow, type RowHandlers } from '../components/chat/RoomFeed'
import type { PrivateMessage } from '../lib/directThread'
import type { RoomMessage } from '../lib/roomMessages'

jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: () => {} }), play: () => {} }), VideoView: () => null }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
const FRAME = { x: 16, y: 300, width: 240, height: 44 }
jest.mock('../components/ds/anchor', () => ({ measureAnchor: (_node: unknown, then: (r: typeof FRAME) => void) => then(FRAME) }))

const actionsOf = (id: string) => screen.getByTestId(id).props.accessibilityActions.map((a: { name: string }) => a.name)
const doAction = (id: string, actionName: string) => fireEvent(screen.getByTestId(id), 'accessibilityAction', { nativeEvent: { actionName } })

const roomMessage = (over: Partial<RoomMessage> = {}): RoomMessage => ({
  message_id: 'm1',
  sender_id: 'u-rohan',
  sender_name: 'Rohan',
  message_text: 'See you at the bar',
  message_type: 'text',
  reply_to_message_id: null,
  created_at: '2026-10-24T19:00:00.000Z',
  ...over,
})
const roomHandlers = (): RowHandlers => ({ menu: jest.fn(), retry: jest.fn(), react: jest.fn(), reply: jest.fn(), sender: jest.fn(), link: jest.fn(), pollRefusal: jest.fn() })

describe.each([
  ['an event’s room', true],
  ['a crew’s or a Blend’s room', false],
])('%s', (_name, senderTappable) => {
  it('More options opens the hold’s menu for that message; View profile only where the room has a card', async () => {
    const handlers = roomHandlers()
    const item = roomMessage()
    await render(<RoomMessageRow item={item} roomId="g1" mine={false} first last senderTappable={senderTappable} handlers={handlers} />)
    expect(actionsOf('bubble-m1-bubble')).toContain('More options')
    await doAction('bubble-m1-bubble', 'More options')
    expect(handlers.menu).toHaveBeenCalledWith(item, FRAME)
    expect(actionsOf('bubble-m1-bubble').includes('View profile')).toBe(senderTappable)
    if (senderTappable) {
      await doAction('bubble-m1-bubble', 'View profile')
      expect(handlers.sender).toHaveBeenCalledWith(item)
    }
  })

  it('your own message has More options too (Copy; Delete when it failed)', async () => {
    await render(<RoomMessageRow item={roomMessage({ sender_id: 'me' })} roomId="g1" mine first last senderTappable={senderTappable} handlers={roomHandlers()} />)
    expect(actionsOf('bubble-m1-bubble')).toContain('More options')
    expect(actionsOf('bubble-m1-bubble')).not.toContain('View profile')
  })
})

const dmMessage = (over: Partial<PrivateMessage> = {}): PrivateMessage => ({
  id: 'd1',
  conversationId: 'c1',
  senderId: 'u-maya',
  sender: { id: 'u-maya', name: 'Maya', image: null },
  text: 'Hey',
  isRead: true,
  createdAt: '2026-10-24T19:00:00.000Z',
  ...over,
})
const dmHandlers = (): DmRowHandlers => ({ menu: jest.fn(), retry: jest.fn(), reply: jest.fn(), photo: jest.fn(), link: jest.fn() })

describe('a DM', () => {
  it('a text message: More options opens the hold’s menu', async () => {
    const handlers = dmHandlers()
    const item = dmMessage()
    await render(<DmMessageRow item={item} mine={false} name="Maya" first last animate={false} handlers={handlers} />)
    await doAction('dm-bubble-d1-bubble', 'More options')
    expect(handlers.menu).toHaveBeenCalledWith(item, FRAME)
  })

  it('a photo: More options on the photo bubble as well', async () => {
    const handlers = dmHandlers()
    const item = dmMessage({ text: null, mediaUrl: 'https://x/p.jpg', mediaType: 'image' })
    await render(<DmMessageRow item={item} mine={false} name="Maya" first last animate={false} handlers={handlers} />)
    await doAction('dm-photo-d1-bubble', 'More options')
    expect(handlers.menu).toHaveBeenCalledWith(item, FRAME)
  })

  it('removed by moderation: no menu', async () => {
    await render(<DmMessageRow item={dmMessage({ senderId: 'me', removed: true })} mine name="Maya" first last animate={false} handlers={dmHandlers()} />)
    expect(actionsOf('dm-bubble-d1-bubble')).toEqual([])
  })
})
