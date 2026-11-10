/**
 * Flow 5 C2, room chat F-A (SCRUM-1042; board flow-5/chat.html, fA*): bubbles in runs, the name in rose inside the
 * bubble, yours violet, a reaction as a count chip on the corner; the host as an ember card with the organisation's
 * name and HOST, never a person; the rate limit inside the field in the server's words; runs grouped in linear time.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { RoomMessageRow, type RowHandlers } from '../components/chat/RoomFeed'
import { ChatBubble, type ChatBubbleProps } from '../components/ds/ChatBubble'
import { Composer } from '../components/ds/Composer'
import { SELECTION } from '../components/ds/shared'
import { runPlace } from '../lib/chatFeed'
import { COLOR } from '../lib/design/tokens'
import type { RoomMessage } from '../lib/roomMessages'
import { lockFor } from '../lib/useComposerLock'

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native')
  return { Image: () => <View /> }
})
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
jest.mock('../lib/apiClient', () => ({ apiClient: {} }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
const bubble = (props: Partial<ChatBubbleProps> = {}) => (
  <ChatBubble mine={false} sender={{ name: 'Night Owl' }} text="Just got up here. The view is unreal." time="6:12 PM" testID="b" {...props} />
)

describe('the bubble (F-A)', () => {
  it('theirs: on surface, the pseudonym in rose inside the bubble, a button to their card', async () => {
    const onSenderPress = jest.fn()
    await render(bubble({ first: true, last: true, onSenderPress }))
    expect(flat('b-bubble').backgroundColor).toBe(COLOR.surface)
    const name = within(screen.getByTestId('b-bubble')).getByText('Night Owl', { includeHiddenElements: true })
    expect(StyleSheet.flatten(name.props.style).color).toBe(SELECTION.rose.glyph)
    await fireEvent.press(screen.getByTestId('b-name', { includeHiddenElements: true }))
    expect(onSenderPress).toHaveBeenCalledTimes(1)
  })

  it('in a run, only the first carries the name', async () => {
    await render(bubble({ first: false, last: true }))
    expect(screen.queryByText('Night Owl', { includeHiddenElements: true })).toBeNull()
  })

  it('yours: violet, no name', async () => {
    await render(bubble({ mine: true }))
    expect(flat('b-bubble').backgroundColor).toBe(COLOR.selectionVioletFill)
    expect(screen.queryByText('Night Owl', { includeHiddenElements: true })).toBeNull()
  })

  // The board draws no time under a room's run; it is still read with the message.
  it('a room shows no time under the run, and still reads it', async () => {
    await render(bubble())
    expect(screen.queryByText('6:12 PM', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByTestId('b-bubble').props.accessibilityLabel).toBe('Night Owl, Just got up here. The view is unreal., 6:12 PM')
  })

  // Control: a DM keeps its time (D-A is C4's).
  it('a DM keeps the time under the last', async () => {
    await render(bubble({ surface: 'dm' }))
    expect(screen.getByText('6:12 PM', { includeHiddenElements: true })).toBeTruthy()
  })

  it('a reaction is a count chip on the corner: compact for the eye, the whole number for a screen reader, never who', async () => {
    await render(bubble({ reactions: [{ emoji: '❤️', count: 1234, mine: false }], onReactionPress: jest.fn() }))
    expect(screen.getByText('1.2k', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: /, 1234$/ })).toBeTruthy()
    expect(flat('b-reactions')).toMatchObject({ position: 'absolute' })
  })

  // Driven 2026-11-10: a full last line ("…unreal.") went under the chip. With a chip the words stop 12 above the edge.
  it('a chip never covers the words: the bubble pads 12 under them, 8 without one', async () => {
    await render(bubble({ reactions: [{ emoji: '😂', count: 1, mine: false }] }))
    expect(flat('b-bubble').paddingBottom).toBe(12)
    await screen.rerender(bubble())
    expect(flat('b-bubble').paddingBottom ?? flat('b-bubble').paddingVertical).toBe(8)
  })

  it('one reaction still shows its count', async () => {
    await render(bubble({ reactions: [{ emoji: '🔥', count: 1, mine: false }] }))
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy()
  })
})

const handlers: RowHandlers = { menu: jest.fn(), retry: jest.fn(), react: jest.fn(), reply: jest.fn(), sender: jest.fn(), link: jest.fn(), pollRefusal: jest.fn() }
const msg = (over: Partial<RoomMessage>): RoomMessage => ({
  message_id: 'm1',
  sender_id: 'u-host',
  sender_name: 'Nightshift Collective',
  message_text: '📢 [Announcement from Nightshift Collective]\nDoors are open.',
  message_type: 'announcement',
  reply_to_message_id: null,
  created_at: '2026-11-10T12:30:00.000Z',
  ...over,
})
const row = (item: RoomMessage) => render(<RoomMessageRow item={item} roomId="g1" mine={false} first last senderTappable handlers={handlers} />)

describe('the host (F-A): the organisation and HOST, never a person', () => {
  it('reads "Host, Nightshift Collective: …", shows HOST, and is no bubble and no creature', async () => {
    await row(msg({}))
    expect(screen.getByLabelText(/^Host, Nightshift Collective: Doors are open\., /)).toBeTruthy()
    expect(screen.getByText('HOST', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('Nightshift Collective', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByTestId('bubble-m1', { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByTestId('bubble-m1-avatar', { includeHiddenElements: true })).toBeNull()
  })

  it('a long organisation name keeps HOST on its line', async () => {
    const name = 'Kerala Design Week & Friends of the Riso Collective'
    await row(msg({ message_text: `📢 [Announcement from ${name}]\nEntry is through the East Gate.` }))
    expect(screen.getByText(name, { includeHiddenElements: true }).props.numberOfLines).toBe(1)
  })

  // Every kind that is not somebody talking: none of them is a bubble (a creature) in the room.
  it.each([
    ['sponsored', '📣 [Sponsored]\nTwo-for-one till 11.'],
    ['poll', 'Which set next?'],
    ['system', 'liked Crew Nebula for the crew'],
  ] as const)('%s is never a bubble', async (message_type, message_text) => {
    await row(msg({ message_type, message_text }))
    expect(screen.queryByTestId('bubble-m1', { includeHiddenElements: true })).toBeNull()
  })

  // Control: a person's text is a bubble.
  it('a person’s text is a bubble', async () => {
    await row(msg({ message_type: 'text', sender_name: 'Lunar Fox', message_text: 'Parked.' }))
    expect(screen.getByTestId('bubble-m1')).toBeTruthy()
  })
})

describe('the rate limit, in the server’s words, inside the field (F-A gig)', () => {
  const SERVER = 'Slow down a moment, then try again.'
  it('a burst keeps the server’s sentence', () => {
    expect(lockFor('SPAM_BLOCKED', SERVER)).toEqual({ state: 'ratelimited', reason: SERVER })
  })

  // The bare 429 says "Too many requests", which is the API's, not a sentence for a person: the composer's own words.
  it('the generic 429 keeps the composer’s words', () => {
    expect(lockFor('RATE_LIMITED', 'Too many requests')).toEqual({ state: 'ratelimited' })
  })

  it('the field stays, the line inside it, with the countdown; nothing can be sent', async () => {
    const onSend = jest.fn()
    await render(<Composer value="" onChangeText={jest.fn()} onSend={onSend} state="ratelimited" reason={SERVER} countdown="0:12" testID="c" />)
    const field = screen.getByTestId('c-field', { includeHiddenElements: true })
    expect(within(field).getByText(/^Slow down a moment, then try again\. 0:12$/, { includeHiddenElements: true })).toBeTruthy()
    expect(within(field).getByText('0:12', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('Slow down a moment')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState).toMatchObject({ disabled: true })
  })
})

describe('runs at 12,480 (large-data check)', () => {
  it('a run of three: name on the first, face on the last, none in the middle', () => {
    const items = ['fox', 'fox', 'fox', 'owl'].map((who, t) => ({ who, t }))
    const at = (i: number) => runPlace(items, i, (m) => m.who, (m) => m.t)
    expect([0, 1, 2, 3].map(at)).toEqual([
      { first: true, last: false },
      { first: false, last: false },
      { first: false, last: true },
      { first: true, last: true },
    ])
  })

  it('placing every row reads a constant few neighbours, so a 12k history groups in linear time', () => {
    const N = 12480
    const items = Array.from({ length: N }, (_, i) => ({ who: `u${i % 7 < 3 ? 1 : 2}`, t: i }))
    let reads = 0
    const speaker = (m: { who: string }) => {
      reads++
      return m.who
    }
    for (let i = 0; i < N; i++) runPlace(items, i, speaker, (m) => m.t)
    expect(reads).toBeLessThanOrEqual(5 * N)
  })
})
